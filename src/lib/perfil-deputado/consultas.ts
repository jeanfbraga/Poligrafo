/* ==========================================================================
   Consultas do perfil do deputado federal (banco de perfil, com fallback no
   principal). Compartilhadas pela página de perfil (/api/perfil/deputado) e
   pela exportação do dossiê. SÓ NO SERVIDOR (service role).
   ========================================================================== */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export function obterFallbackClient(primaryClient: any) {
  if (primaryClient === supabasePerfilAdmin && supabaseAdmin !== supabasePerfilAdmin) {
    return supabaseAdmin;
  }
  if (primaryClient === supabaseAdmin && supabasePerfilAdmin !== supabaseAdmin) {
    return supabasePerfilAdmin;
  }
  return null;
}

function formatarVotosDeputado(data: any[]) {
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

/** Teto de linhas por requisição do PostgREST (max_rows padrão do Supabase). */
export const LINHAS_POR_PAGINA = 1000;

/**
 * Lê todas as páginas de uma consulta. Sem isso o PostgREST corta em 1000 linhas
 * em silêncio. `pagina(de, ate)` deve ter ordem estável (senão as páginas se sobrepõem).
 * Erro em qualquer página descarta tudo: lista parcial daria totais errados.
 */
export async function buscarTodasAsPaginas(
  pagina: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<{ data: any[]; error: any }> {
  const linhas: any[] = [];
  for (let de = 0; ; de += LINHAS_POR_PAGINA) {
    const { data, error } = await pagina(de, de + LINHAS_POR_PAGINA - 1);
    if (error) return { data: [], error };
    linhas.push(...(data ?? []));
    if (!data || data.length < LINHAS_POR_PAGINA) return { data: linhas, error: null };
  }
}

function consultarVotos(client: any, idDeputadoNum: number) {
  return buscarTodasAsPaginas((de, ate) =>
    client
      .from("camara_votos_detalhados")
      .select("id_votacao, voto, camara_votacoes_master (id_proposicao, projeto_nome, projeto_tema, data_votacao)")
      .eq("id_deputado", idDeputadoNum)
      .order("id_votacao", { ascending: true })
      .range(de, ate),
  );
}

async function buscarVotosComFallback(supabase: any, idDeputadoNum: number) {
  let { data, error } = await consultarVotos(supabase, idDeputadoNum);

  const fallback = obterFallbackClient(supabase);
  if ((error || data.length === 0) && fallback) {
    const res = await consultarVotos(fallback, idDeputadoNum);
    if (!res.error && res.data.length > 0) {
      data = res.data;
    }
  }

  return data;
}

/** Votos nominais em plenário, do mais recente ao mais antigo. */
export async function buscarVotosDeputado(supabase: any, idDeputadoNum: number) {
  const data = await buscarVotosComFallback(supabase, idDeputadoNum);
  if (data.length === 0) return [];
  return formatarVotosDeputado(data);
}

/** Servidores do gabinete (um registro por período de lotação). */
export async function buscarServidoresDeputado(supabase: any, idDeputadoNum: number) {
  let { data } = await supabase
    .from("camara_servidores_gabinete")
    .select("*")
    .eq("deputado_id", idDeputadoNum)
    .order("nome", { ascending: true });

  const fallback = obterFallbackClient(supabase);
  if ((!data || data.length === 0) && fallback) {
    const res = await fallback
      .from("camara_servidores_gabinete")
      .select("*")
      .eq("deputado_id", idDeputadoNum)
      .order("nome", { ascending: true });
    if (res.data && res.data.length > 0) {
      data = res.data;
    }
  }

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

/** Gasto mensal da cota (CEAP) com o teto do mês; sem resumo no cache, agrega as despesas. */
export async function buscarCotaDeputado(supabase: any, idDeputadoNum: number) {
  let { data } = await supabase
    .from("camara_cota_resumo_cache")
    .select("*")
    .eq("deputado_id", idDeputadoNum)
    .order("ano_referencia", { ascending: true })
    .order("mes_referencia", { ascending: true });

  const fallback = obterFallbackClient(supabase);
  if ((!data || data.length === 0) && fallback) {
    const res = await fallback
      .from("camara_cota_resumo_cache")
      .select("*")
      .eq("deputado_id", idDeputadoNum)
      .order("ano_referencia", { ascending: true })
      .order("mes_referencia", { ascending: true });
    if (res.data && res.data.length > 0) {
      data = res.data;
    }
  }

  if (data && data.length > 0) return data;
  return buscarCotaFallback(idDeputadoNum);
}
