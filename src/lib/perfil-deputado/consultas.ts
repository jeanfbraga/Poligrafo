/* ==========================================================================
   Consultas do perfil do deputado federal. Os dados de perfil ficam SÓ no
   banco de perfil (supabasePerfilAdmin): nada de segunda tentativa no banco
   principal, que guardava cópias parciais. Compartilhadas pela página de
   perfil (/api/perfil/deputado) e pela exportação do dossiê. SÓ NO SERVIDOR.
   ========================================================================== */
import { supabaseAdmin } from "@/lib/supabase-admin";

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

/** Votos nominais em plenário, do mais recente ao mais antigo. */
export async function buscarVotosDeputado(supabase: any, idDeputadoNum: number) {
  const { data, error } = await consultarVotos(supabase, idDeputadoNum);
  if (error) console.warn(`[Perfil] Votos do deputado ${idDeputadoNum} indisponíveis:`, error.message);
  if (data.length === 0) return [];
  return formatarVotosDeputado(data);
}

/** Servidores do gabinete (um registro por período de lotação). */
export async function buscarServidoresDeputado(supabase: any, idDeputadoNum: number) {
  const { data, error } = await buscarTodasAsPaginas((de, ate) =>
    supabase
      .from("camara_servidores_gabinete")
      .select("*")
      .eq("deputado_id", idDeputadoNum)
      .order("nome", { ascending: true })
      .order("id", { ascending: true })
      .range(de, ate),
  );
  if (error) console.warn(`[Perfil] Gabinete do deputado ${idDeputadoNum} indisponível:`, error.message);
  return data;
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

/**
 * Gasto mensal da cota (CEAP) com o teto do mês. Sem resumo no banco de perfil, agrega as
 * despesas brutas da CEAP (ceap_despesas_cache), que são dado de investigação e moram no principal.
 */
export async function buscarCotaDeputado(supabase: any, idDeputadoNum: number) {
  const { data } = await supabase
    .from("camara_cota_resumo_cache")
    .select("*")
    .eq("deputado_id", idDeputadoNum)
    .order("ano_referencia", { ascending: true })
    .order("mes_referencia", { ascending: true });

  if (data && data.length > 0) return data;
  return buscarCotaFallback(idDeputadoNum);
}
