import { NextResponse } from "next/server";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const idProjeto = params.id;

  if (!idProjeto) {
    return NextResponse.json({ error: "ID do projeto é obrigatório" }, { status: 400 });
  }

  const supabase = supabasePerfilAdmin;
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  try {
    const { data, error } = await supabase
      .from("camara_proposicoes_detalhes_cache")
      .select("*")
      .eq("id_proposicao", idProjeto)
      .single();

    if (error || !data) {
      // FALLBACK DE EMERGÊNCIA (Caso o ETL ainda não tenha processado este projeto)
      try {
        const [resDetalhes, resAutores, resTramitacoes] = await Promise.all([
            fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${idProjeto}`, { headers: { 'Accept': 'application/json' } }),
            fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${idProjeto}/autores`, { headers: { 'Accept': 'application/json' } }),
            fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${idProjeto}/tramitacoes`, { headers: { 'Accept': 'application/json' } })
        ]);
        
        if (!resDetalhes.ok) {
          return NextResponse.json({ error: "Projeto não encontrado no banco nem na Câmara." }, { status: 404 });
        }
        
        const camaraJson = await resDetalhes.json();
        const prop = camaraJson.dados;
        
        if (!prop) {
          return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
        }

        const autoresJson = resAutores.ok ? (await resAutores.json()).dados : [];
        const tramitacoesJson = resTramitacoes.ok ? (await resTramitacoes.json()).dados : [];
        const status = prop.statusProposicao || {};

        const fallbackData = {
          id_proposicao: prop.id.toString(),
          sigla_tipo: prop.siglaTipo,
          numero: prop.numero,
          ano: prop.ano,
          titulo: `${prop.siglaTipo} ${prop.numero}/${prop.ano}`,
          ementa: prop.ementa || "Ementa não disponibilizada pela Câmara.",
          texto_integral: prop.urlInteiroTeor || null,
          data_apresentacao: prop.dataApresentacao,
          autores_json: autoresJson,
          tramitacoes_json: tramitacoesJson,
          situacao: status.descricaoSituacao || null,
          despacho: status.despacho || null,
          regime: status.regime || null,
          apreciacao: status.apreciacao || null
        };

        return NextResponse.json(fallbackData);
      } catch (camaraError) {
        return NextResponse.json(
          { error: "Falha na conexão com a API da Câmara no fallback." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[API Projeto] Erro ao buscar dados:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a requisição." },
      { status: 500 }
    );
  }
}
