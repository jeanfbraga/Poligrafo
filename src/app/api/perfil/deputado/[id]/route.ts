import { NextResponse } from "next/server";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";
import { supabaseAdmin } from "@/lib/supabase-admin";
import congressoIndex from "@/services/integrations/data/congresso-index.json";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseIdDeputado(rawId?: string): { idStr: string; idNum: number } | null {
  if (!rawId) return null;
  const matchPessoa = rawId.trim().match(/^pessoa-(\d+)$/i);
  const idDeputado = matchPessoa ? matchPessoa[1] : rawId.trim();
  if (!/^\d+$/.test(idDeputado)) return null;
  return { idStr: idDeputado, idNum: parseInt(idDeputado, 10) };
}

function obterNomeOuFallback(valor?: string, fallback = "Dados em sincronização"): string {
  if (valor) return valor;
  return fallback;
}

function montarPerfilFallback(info: any, idDeputadoNum: number) {
  const nome = obterNomeOuFallback(info?.nome);
  return {
    id_deputado: idDeputadoNum,
    nome_civil: nome,
    nome_eleitoral: nome,
    partido: info?.partido || "N/A",
    uf: info?.uf || "BR",
    frentes_parlamentares: [],
    comissoes: [],
    profissoes: []
  };
}

function mesclarPerfilComIndex(perfilData: any, info: any) {
  const nomePadrao = obterNomeOuFallback(info?.nome);
  return {
    ...perfilData,
    nome_civil: obterNomeOuFallback(perfilData.nome_civil, nomePadrao),
    nome_eleitoral: obterNomeOuFallback(perfilData.nome_eleitoral, nomePadrao),
    uf: perfilData.uf || info?.uf || "BR",
    partido: perfilData.partido || info?.partido || "N/A"
  };
}

async function buscarPerfilBasico(supabase: any, idDeputadoNum: number, idDeputado: string) {
  const { data: perfilData } = await supabase
    .from("camara_perfil_politico_cache")
    .select("*")
    .eq("id_deputado", idDeputadoNum)
    .single();

  const info = (congressoIndex as any[]).find((p: any) => String(p.id) === idDeputado);
  if (!perfilData && !info) return null;
  if (!perfilData) return montarPerfilFallback(info, idDeputadoNum);

  return mesclarPerfilComIndex(perfilData, info);
}

async function buscarVotosDeputado(supabase: any, idDeputadoNum: number) {
  const { data, error } = await supabase
    .from("camara_votos_detalhados")
    .select("id_votacao, voto, camara_votacoes_master (id_proposicao, projeto_nome, projeto_tema, data_votacao)")
    .eq("id_deputado", idDeputadoNum);

  if (error || !data || data.length === 0) return [];

  return data.map((v: any) => ({
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
  });
}

async function buscarProducaoDeputado(supabase: any, idDeputadoNum: number) {
  const { data, error } = await supabase
    .from("camara_producao_legislativa")
    .select("*")
    .eq("id_deputado", idDeputadoNum)
    .order("ano", { ascending: false });

  if (error || !data) return [];
  return data;
}

async function buscarServidoresDeputado(supabase: any, idDeputadoNum: number) {
  const { data } = await supabase
    .from("camara_servidores_gabinete")
    .select("*")
    .eq("deputado_id", idDeputadoNum)
    .order("nome", { ascending: true });

  return data || [];
}

function agregarDespesasPorMes(despesas: any[], anoAtual: number, idDeputadoNum: number) {
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
      return { ano_referencia: ano, mes_referencia: mes, valor_gasto, valor_teto: 45612.53, deputado_id: idDeputadoNum };
    })
    .filter(r => r.ano_referencia === anoRef)
    .sort((a, b) => a.mes_referencia - b.mes_referencia);
}

async function buscarCotaFallback(idDeputadoNum: number) {
  try {
    const anoAtual = new Date().getFullYear();
    const { data: despesas } = await supabaseAdmin
      .from("ceap_despesas_cache")
      .select("valor_documento, data_documento")
      .eq("id_deputado", idDeputadoNum)
      .or("casa.eq.CAMARA,casa.is.null")
      .gte("ano", anoAtual - 1);

    if (!despesas || despesas.length === 0) return [];
    return agregarDespesasPorMes(despesas, anoAtual, idDeputadoNum);
  } catch {
    return [];
  }
}

async function buscarCotaDeputado(supabase: any, idDeputadoNum: number) {
  const { data } = await supabase
    .from("camara_cota_resumo_cache")
    .select("*")
    .eq("deputado_id", idDeputadoNum)
    .order("ano_referencia", { ascending: true })
    .order("mes_referencia", { ascending: true });

  if (data && data.length > 0) return data;
  return buscarCotaFallback(idDeputadoNum);
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const parsed = parseIdDeputado(params.id);
  if (!parsed) {
    return NextResponse.json(
      { error: `ID de parlamentar inválido: "${params.id}". O identificador deve ser numérico.` },
      { status: 400 }
    );
  }

  const supabase = supabasePerfilAdmin;
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  try {
    const perfil = await buscarPerfilBasico(supabase, parsed.idNum, parsed.idStr);
    if (!perfil) {
      return NextResponse.json(
        { error: `Parlamentar com ID ${parsed.idStr} não encontrado.` },
        { status: 404 }
      );
    }

    const [votos, producao, servidores, cota] = await Promise.all([
      buscarVotosDeputado(supabase, parsed.idNum),
      buscarProducaoDeputado(supabase, parsed.idNum),
      buscarServidoresDeputado(supabase, parsed.idNum),
      buscarCotaDeputado(supabase, parsed.idNum),
    ]);

    return NextResponse.json({
      perfil,
      votos,
      producao,
      servidores,
      cota
    });
  } catch (error: any) {
    console.error("[API Perfil Deputado] Erro ao buscar dados:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a requisição." },
      { status: 500 }
    );
  }
}
