import { NextResponse } from "next/server";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchWithTimeout } from "@/app/api/investigar/tse";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const idDeputado = params.id;

  if (!idDeputado) {
    return NextResponse.json({ error: "ID do deputado é obrigatório" }, { status: 400 });
  }

  const supabase = supabasePerfilAdmin;
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  try {
    // 1. Perfil Básico (frentes, comissões, profissões)
    let { data: perfilData, error: perfilError } = await supabase
      .from("camara_perfil_politico_cache")
      .select("*")
      .eq("id_deputado", idDeputado)
      .single();

    // O banco de cache local agora possui nome_civil e nome_eleitoral inseridos pelo perfil-politico-sync.ts
    // Garantindo que NENHUMA requisição em tempo real (runtime) para a API da Câmara ocorra.
    if (!perfilData) {
      perfilData = {
        id_deputado: parseInt(idDeputado),
        nome_civil: "Dados não sincronizados",
        nome_eleitoral: "Dados não sincronizados",
        partido: "N/A",
        uf: "N/A",
        frentes_parlamentares: [],
        comissoes: [],
        profissoes: []
      };
    }

    // 2. Votos Detalhados
    const votosRaw = await (async () => {
      // 1ª tentativa: banco de perfil (PerfilAdmin)
      const { data, error } = await supabase
        .from("camara_votos_detalhados")
        .select("id_votacao, voto, camara_votacoes_master (id_proposicao, projeto_nome, projeto_tema, data_votacao)")
        .eq("id_deputado", idDeputado);
      if (!error && data && data.length > 0) return data;

      // Fallback: API ao vivo da Câmara
      console.warn(`[PERFIL API] Votos vazios no banco para deputado ${idDeputado}. Usando API ao vivo.`);
      try {
        const anoAtual = new Date().getFullYear();
        const res = await fetchWithTimeout(
          `https://dadosabertos.camara.leg.br/api/v2/deputados/${idDeputado}/votacoes?dataInicio=${anoAtual - 1}-01-01&ordem=DESC&ordenarPor=dataHoraVoto&itens=50`,
          { timeout: 10000 }
        );
        if (!res.ok) return [];
        const json = await res.json();
        return (json.dados || []).map((v: any) => ({
          id_votacao: v.id,
          voto: v.voto,
          camara_votacoes_master: {
            id_proposicao: v.proposicao?.id || null,
            projeto_nome: v.proposicao?.ementa || v.descricao || "Sem descrição",
            projeto_tema: v.proposicao?.tema || "Não especificado",
            data_votacao: v.dataHoraVoto || null,
          }
        }));
      } catch { return []; }
    })();

    const votosData = votosRaw?.map((v: any) => ({
      id_votacao: v.id_votacao,
      voto: v.voto,
      id_proposicao: v.camara_votacoes_master?.id_proposicao,
      projeto_nome: v.camara_votacoes_master?.projeto_nome,
      projeto_tema: v.camara_votacoes_master?.projeto_tema,
      data_votacao: v.camara_votacoes_master?.data_votacao,
    })).sort((a: any, b: any) => {
      if (!a.data_votacao) return 1;
      if (!b.data_votacao) return -1;
      return new Date(b.data_votacao).getTime() - new Date(a.data_votacao).getTime();
    }) || [];

    // 3. Produção Legislativa
    const producaoData = await (async () => {
      const { data, error } = await supabase
        .from("camara_producao_legislativa")
        .select("*")
        .eq("id_deputado", idDeputado)
        .order("ano", { ascending: false });
      if (!error && data && data.length > 0) return data;

      // Fallback: API ao vivo da Câmara
      console.warn(`[PERFIL API] Produção legislativa vazia no banco para deputado ${idDeputado}. Usando API ao vivo.`);
      try {
        const anoAtual = new Date().getFullYear();
        const res = await fetchWithTimeout(
          `https://dadosabertos.camara.leg.br/api/v2/deputados/${idDeputado}/proposicoes?dataInicio=${anoAtual - 1}-01-01&ordem=DESC&ordenarPor=dataApresentacao&itens=30`,
          { timeout: 10000 }
        );
        if (!res.ok) return [];
        const json = await res.json();
        return (json.dados || []).map((p: any) => ({
          id_deputado: parseInt(idDeputado),
          ano: new Date(p.dataApresentacao || Date.now()).getFullYear(),
          tipo: p.siglaTipo || "PROP",
          numero: p.numero || "",
          ementa: p.ementa || "Sem descrição",
          situacao: p.statusProposicao?.descricaoSituacao || "Em tramitação",
          data_apresentacao: p.dataApresentacao || null,
        }));
      } catch { return []; }
    })();

    // 4. Servidores do Gabinete
    const { data: servidoresData } = await supabase
      .from("camara_servidores_gabinete")
      .select("*")
      .eq("deputado_id", idDeputado)
      .order("nome", { ascending: true });

    // 5. Cota CEAP — banco de perfil, com fallback para ceap_despesas_cache (banco principal)
    const cotaData = await (async () => {
      const { data } = await supabase
        .from("camara_cota_resumo_cache")
        .select("*")
        .eq("deputado_id", idDeputado)
        .order("ano_referencia", { ascending: true })
        .order("mes_referencia", { ascending: true });
      if (data && data.length > 0) return data;

      // Fallback: agrega os gastos do ceap_despesas_cache do banco principal por mês
      console.warn(`[PERFIL API] Cota vazia no banco de perfil para deputado ${idDeputado}. Usando ceap_despesas_cache.`);
      try {
        const anoAtual = new Date().getFullYear();
        const { data: despesas } = await supabaseAdmin
          .from("ceap_despesas_cache")
          .select("valor_documento, data_documento")
          .eq("id_deputado", idDeputado)
          .or("casa.eq.CAMARA,casa.is.null")
          .gte("ano", anoAtual - 1);
        if (!despesas || despesas.length === 0) return [];

        // Agrupa por mês do ano mais recente com dados
        const porMes: Record<string, number> = {};
        let anoRef = anoAtual;
        for (const d of despesas) {
          const dt = d.data_documento ? new Date(d.data_documento) : null;
          if (!dt) continue;
          const ano = dt.getFullYear();
          const mes = dt.getMonth() + 1;
          if (ano > anoRef) anoRef = ano;
          const key = `${ano}-${mes}`;
          porMes[key] = (porMes[key] || 0) + Number(d.valor_documento || 0);
        }
        return Object.entries(porMes)
          .map(([key, valor_gasto]) => {
            const [ano, mes] = key.split("-").map(Number);
            return { ano_referencia: ano, mes_referencia: mes, valor_gasto, valor_teto: 45612.53, deputado_id: idDeputado };
          })
          .filter(r => r.ano_referencia === anoRef)
          .sort((a, b) => a.mes_referencia - b.mes_referencia);
      } catch { return []; }
    })();

    return NextResponse.json({
      perfil: perfilData || null,
      votos: votosData || [],
      producao: producaoData || [],
      servidores: servidoresData || [],
      cota: cotaData || []
    });
  } catch (error: any) {
    console.error("[API Perfil Deputado] Erro ao buscar dados:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a requisição." },
      { status: 500 }
    );
  }
}
