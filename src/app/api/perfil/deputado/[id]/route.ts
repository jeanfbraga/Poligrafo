import { NextResponse } from "next/server";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

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
    const { data: votosRaw, error: votosError } = await supabase
      .from("camara_votos_detalhados")
      .select("id_votacao, voto, camara_votacoes_master (id_proposicao, projeto_nome, projeto_tema, data_votacao)")
      .eq("id_deputado", idDeputado);

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
    const { data: producaoData, error: producaoError } = await supabase
      .from("camara_producao_legislativa")
      .select("*")
      .eq("id_deputado", idDeputado)
      .order("ano", { ascending: false });

    // 4. Servidores do Gabinete
    const { data: servidoresData } = await supabase
      .from("camara_servidores_gabinete")
      .select("*")
      .eq("deputado_id", idDeputado)
      .order("nome", { ascending: true });

    // 5. Cota CEAP (Resumo Histórico)
    const { data: cotaData } = await supabase
      .from("camara_cota_resumo_cache")
      .select("*")
      .eq("deputado_id", idDeputado)
      .order("ano_referencia", { ascending: true })
      .order("mes_referencia", { ascending: true });

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
