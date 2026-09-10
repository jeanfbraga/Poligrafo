import { NextResponse } from "next/server";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

function formatarFallbackProjeto(prop: any, autoresJson: any[], tramitacoesJson: any[]) {
  const status = prop.statusProposicao ?? {};
  return {
    id_proposicao: String(prop.id),
    sigla_tipo: prop.siglaTipo,
    numero: prop.numero,
    ano: prop.ano,
    titulo: `${prop.siglaTipo} ${prop.numero}/${prop.ano}`,
    ementa: prop.ementa ?? "Ementa não disponibilizada pela Câmara.",
    texto_integral: prop.urlInteiroTeor ?? null,
    data_apresentacao: prop.dataApresentacao,
    autores_json: autoresJson,
    tramitacoes_json: tramitacoesJson,
    situacao: status.descricaoSituacao ?? null,
    despacho: status.despacho ?? null,
    regime: status.regime ?? null,
    apreciacao: status.apreciacao ?? null,
  };
}

async function buscarProjetoCamaraFallback(idProjeto: string): Promise<any | null> {
  try {
    const [resDetalhes, resAutores, resTramitacoes] = await Promise.all([
      fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${idProjeto}`, { headers: { Accept: "application/json" } }),
      fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${idProjeto}/autores`, { headers: { Accept: "application/json" } }),
      fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${idProjeto}/tramitacoes`, { headers: { Accept: "application/json" } }),
    ]);

    if (!resDetalhes.ok) return null;
    const camaraJson = await resDetalhes.json();
    const prop = camaraJson.dados;
    if (!prop) return null;

    const autoresJson = resAutores.ok ? (await resAutores.json()).dados : [];
    const tramitacoesJson = resTramitacoes.ok ? (await resTramitacoes.json()).dados : [];
    return formatarFallbackProjeto(prop, autoresJson, tramitacoesJson);
  } catch (_e) {
    return null;
  }
}

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> },
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

    if (!error && data) {
      return NextResponse.json(data);
    }

    const fallbackData = await buscarProjetoCamaraFallback(idProjeto);
    if (!fallbackData) {
      return NextResponse.json({ error: "Projeto não encontrado no banco nem na Câmara." }, { status: 404 });
    }

    return NextResponse.json(fallbackData);
  } catch (error: any) {
    console.error("[API Projeto] Erro ao buscar dados:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a requisição." },
      { status: 500 },
    );
  }
}
