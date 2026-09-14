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

function obterFallbackClient(primaryClient: any) {
  if (primaryClient === supabasePerfilAdmin && supabaseAdmin !== supabasePerfilAdmin) {
    return supabaseAdmin;
  }
  if (primaryClient === supabaseAdmin && supabasePerfilAdmin !== supabaseAdmin) {
    return supabasePerfilAdmin;
  }
  return null;
}

import { fetchWithTimeout } from "@/app/api/investigar/tse";

function formatarDataSimples(dataHora?: string): string {
  if (!dataHora) return "";
  const match = dataHora.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, ano, mes, dia] = match;
    return `${dia}/${mes}/${ano}`;
  }
  return "";
}

function filtrarEventosLegislatura(historico: any[]) {
  if (!Array.isArray(historico)) return [];
  const leg57 = historico.filter((h: any) => h.idLegislatura === 57 || !h.idLegislatura);
  const eventos = leg57.length > 0 ? leg57 : historico;
  return [...eventos].sort((a, b) => (a.dataHora || "").localeCompare(b.dataHora || ""));
}

function isEventoEntrada(desc: string, sit: string): boolean {
  return desc.includes("entrada") || sit === "exercício" || sit === "exercicio";
}

function isEventoSaida(desc: string, sit: string): boolean {
  return desc.includes("saída") || desc.includes("saida") || sit.includes("supl") || sit.includes("licen");
}

function extrairUltimasMovimentacoes(ordenados: any[]) {
  let entrada: any = null;
  let saida: any = null;
  for (const ev of ordenados) {
    const desc = (ev.descricaoStatus || "").toLowerCase();
    const sit = (ev.situacao || "").toLowerCase();
    if (isEventoEntrada(desc, sit)) entrada = ev;
    if (isEventoSaida(desc, sit)) saida = ev;
  }
  return { entrada, saida };
}

function montarTextoSuplente(entrada: any, saida: any, ultimoStatus: any): string {
  const dtEntrada = formatarDataSimples(entrada?.dataHora);
  const dtSaida = formatarDataSimples(saida?.dataHora || ultimoStatus?.data);
  if (dtEntrada && dtSaida) return `Exerceu mandato como Suplente de ${dtEntrada} a ${dtSaida}`;
  if (dtSaida) return `Suplente fora de exercício desde ${dtSaida}`;
  return "Parlamentar em suplência";
}

function extrairMotivoLicenca(saida: any): string {
  const desc = (saida?.descricaoStatus || "").toLowerCase();
  if (desc.includes("ministro")) return "exercer o cargo de Ministro de Estado";
  if (desc.includes("saúde") || desc.includes("saude")) return "tratamento de saúde";
  return "afastamento temporário";
}

function montarRetornoSuplente(entrada: any, saida: any, ultimoStatus: any) {
  return {
    situacao: "Suplência",
    condicaoEleitoral: "Suplente",
    mandatoTexto: montarTextoSuplente(entrada, saida, ultimoStatus),
    dataPosse: formatarDataSimples(entrada?.dataHora),
    dataSaida: formatarDataSimples(saida?.dataHora || ultimoStatus?.data),
  };
}

function montarRetornoLicenca(entrada: any, saida: any, condicaoEleitoral: string, ultimoStatus: any) {
  const dtSaida = formatarDataSimples(saida?.dataHora || ultimoStatus?.data);
  const motivo = extrairMotivoLicenca(saida);
  return {
    situacao: "Licença",
    condicaoEleitoral,
    mandatoTexto: `Licenciado desde ${dtSaida} para ${motivo}`,
    dataPosse: formatarDataSimples(entrada?.dataHora),
    dataSaida: dtSaida,
  };
}

function montarRetornoExercicio(entrada: any, condicaoEleitoral: string) {
  const dtPosse = formatarDataSimples(entrada?.dataHora);
  return {
    situacao: "Exercício",
    condicaoEleitoral,
    mandatoTexto: dtPosse ? `Em exercício parlamentar desde ${dtPosse}` : "Em exercício parlamentar",
    dataPosse: dtPosse,
    dataSaida: undefined,
  };
}

function processarHistoricoMandato(historico: any[], ultimoStatus: any) {
  const situacaoAtual = ultimoStatus?.situacao || "Exercício";
  const condicaoEleitoral = ultimoStatus?.condicaoEleitoral || "Titular";
  const ordenados = filtrarEventosLegislatura(historico);
  const { entrada, saida } = extrairUltimasMovimentacoes(ordenados);

  if (situacaoAtual.toLowerCase().includes("supl")) {
    return montarRetornoSuplente(entrada, saida, ultimoStatus);
  }

  const ehLicenca = situacaoAtual.toLowerCase().includes("licen") ||
    Boolean(saida && (!entrada || (saida.dataHora || "") > (entrada.dataHora || "")));

  if (ehLicenca) {
    return montarRetornoLicenca(entrada, saida, condicaoEleitoral, ultimoStatus);
  }

  return montarRetornoExercicio(entrada, condicaoEleitoral);
}

async function persistirPerfilNoBanco(perfil: any) {
  try {
    const targetClient = supabasePerfilAdmin || supabaseAdmin;
    if (!targetClient) return;
    await targetClient.from("camara_perfil_politico_cache").upsert({
      id_deputado: perfil.id_deputado,
      nome_civil: perfil.nome_civil,
      nome_eleitoral: perfil.nome_eleitoral,
      partido: perfil.partido,
      uf: perfil.uf,
      frentes: perfil.frentes || [],
      comissoes: perfil.comissoes || [],
      profissoes: perfil.profissoes || [],
      data_atualizacao: new Date().toISOString(),
    }, { onConflict: "id_deputado" });
  } catch (err) {
    console.warn("[Perfil Auto-Persist Erro]", err);
  }
}

function extrairListaTitulos(res: PromiseSettledResult<any>): string[] {
  if (res.status !== "fulfilled" || !Array.isArray(res.value?.dados)) return [];
  return res.value.dados.map((item: any) => item.titulo || item.nomeOrgao).filter(Boolean);
}

function montarObjetoPerfilCompleto(params: {
  idDeputadoNum: number;
  depData: any;
  frentes: string[];
  comissoes: string[];
  profissoes: string[];
  mandato: any;
  info: any;
}) {
  const { idDeputadoNum, depData, frentes, comissoes, profissoes, mandato, info } = params;
  const ultimoStatus = depData?.ultimoStatus;
  const nomeCivil = depData?.nomeCivil || info?.nome || `Deputado ${idDeputadoNum}`;
  const nomeEleitoral = ultimoStatus?.nomeEleitoral || info?.nome || nomeCivil;
  const partido = ultimoStatus?.siglaPartido || info?.partido || "N/A";
  const uf = ultimoStatus?.siglaUf || info?.uf || "BR";

  return {
    id_deputado: idDeputadoNum,
    nome_civil: nomeCivil,
    nome_eleitoral: nomeEleitoral,
    partido,
    uf,
    frentes,
    comissoes,
    profissoes,
    situacao: mandato.situacao,
    condicao_eleitoral: mandato.condicaoEleitoral,
    mandato_texto: mandato.mandatoTexto,
    data_posse: mandato.dataPosse,
    data_saida: mandato.dataSaida,
  };
}

async function buscarPerfilLiveCamara(idDeputadoNum: number, info: any) {
  const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";
  try {
    const [depRes, frentesRes, orgaosRes, profRes, histRes] = await Promise.allSettled([
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}`, { timeout: 6000 }).then(r => r.json()),
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}/frentes`, { timeout: 6000 }).then(r => r.json()),
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}/orgaos`, { timeout: 6000 }).then(r => r.json()),
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}/profissoes`, { timeout: 6000 }).then(r => r.json()),
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}/historico`, { timeout: 6000 }).then(r => r.json()),
    ]);

    const depData = depRes.status === "fulfilled" ? depRes.value?.dados : null;
    const histData = histRes.status === "fulfilled" ? histRes.value?.dados : [];
    const frentes = extrairListaTitulos(frentesRes);
    const comissoes = extrairListaTitulos(orgaosRes);
    const profissoes = extrairListaTitulos(profRes);

    const mandato = processarHistoricoMandato(histData, depData?.ultimoStatus);
    const perfilCompleto = montarObjetoPerfilCompleto({
      idDeputadoNum,
      depData,
      frentes,
      comissoes,
      profissoes,
      mandato,
      info,
    });

    void persistirPerfilNoBanco(perfilCompleto);
    return perfilCompleto;
  } catch (e) {
    console.warn(`[Perfil Live Câmara] Falha ao consultar deputado ${idDeputadoNum}:`, e);
    return montarPerfilFallback(info, idDeputadoNum);
  }
}

async function enriquecerMandatoSeNecessario(perfil: any, idDeputadoNum: number) {
  if (!perfil) return null;
  if (perfil.mandato_texto) return perfil;
  try {
    const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";
    const [depRes, histRes] = await Promise.allSettled([
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}`, { timeout: 4000 }).then(r => r.json()),
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}/historico`, { timeout: 4000 }).then(r => r.json()),
    ]);
    const depData = depRes.status === "fulfilled" ? depRes.value?.dados : null;
    const histData = histRes.status === "fulfilled" ? histRes.value?.dados : [];
    const mandato = processarHistoricoMandato(histData, depData?.ultimoStatus);
    return {
      ...perfil,
      situacao: mandato.situacao,
      condicao_eleitoral: mandato.condicaoEleitoral,
      mandato_texto: mandato.mandatoTexto,
      data_posse: mandato.dataPosse,
      data_saida: mandato.dataSaida,
    };
  } catch {
    return perfil;
  }
}

async function buscarPerfilBasico(supabase: any, idDeputadoNum: number, idDeputado: string) {
  let { data: perfilData } = await supabase
    .from("camara_perfil_politico_cache")
    .select("*")
    .eq("id_deputado", idDeputadoNum)
    .single();

  const fallback = obterFallbackClient(supabase);
  if (!perfilData && fallback) {
    const res = await fallback
      .from("camara_perfil_politico_cache")
      .select("*")
      .eq("id_deputado", idDeputadoNum)
      .single();
    if (res.data) {
      perfilData = res.data;
    }
  }

  const info = (congressoIndex as any[]).find((p: any) => String(p.id) === idDeputado);
  
  // Se o perfil não existe ou está com listas vazias no banco, recorre ao Live Fallback da Câmara
  const precisaLive = !perfilData || (!perfilData.frentes || perfilData.frentes.length === 0);
  if (precisaLive) {
    return buscarPerfilLiveCamara(idDeputadoNum, info);
  }

  const mesclado = mesclarPerfilComIndex(perfilData, info);
  return enriquecerMandatoSeNecessario(mesclado, idDeputadoNum);
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

async function buscarVotosComFallback(supabase: any, idDeputadoNum: number) {
  let { data, error } = await supabase
    .from("camara_votos_detalhados")
    .select("id_votacao, voto, camara_votacoes_master (id_proposicao, projeto_nome, projeto_tema, data_votacao)")
    .eq("id_deputado", idDeputadoNum);

  const fallback = obterFallbackClient(supabase);
  if ((error || !data || data.length === 0) && fallback) {
    const res = await fallback
      .from("camara_votos_detalhados")
      .select("id_votacao, voto, camara_votacoes_master (id_proposicao, projeto_nome, projeto_tema, data_votacao)")
      .eq("id_deputado", idDeputadoNum);
    if (!res.error && res.data && res.data.length > 0) {
      data = res.data;
    }
  }

  return data || [];
}

async function buscarVotosDeputado(supabase: any, idDeputadoNum: number) {
  const data = await buscarVotosComFallback(supabase, idDeputadoNum);
  if (data.length === 0) return [];
  return formatarVotosDeputado(data);
}

async function persistirProducaoNoBanco(producao: any[]) {
  try {
    const targetClient = supabasePerfilAdmin || supabaseAdmin;
    if (!targetClient || producao.length === 0) return;
    await targetClient.from("camara_producao_legislativa").upsert(
      producao,
      { onConflict: "id_deputado,id_proposicao" }
    );
  } catch (err) {
    console.warn("[Producao Auto-Persist Erro]", err);
  }
}

function mapearProposicaoCamara(p: any, idDeputadoNum: number) {
  const tipo = p.siglaTipo || "PROP";
  const num = p.numero || 0;
  const ano = p.ano || 2024;
  return {
    id_deputado: idDeputadoNum,
    id_proposicao: String(p.id),
    tipo,
    numero: num,
    ano,
    titulo: `${tipo} ${num}/${ano}`,
    ementa: p.ementa || "Sem ementa informada",
    texto_integral: p.urlInteiroTeor || p.uri || null,
    data_apresentacao: p.dataApresentacao || null,
  };
}

async function buscarProducaoLiveCamara(idDeputadoNum: number) {
  const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";
  try {
    const url = `${API_BASE}/proposicoes?idDeputadoAutor=${idDeputadoNum}&itens=100&ordem=DESC&ordenarPor=ano`;
    const res = await fetchWithTimeout(url, { timeout: 8000 });
    if (!res.ok) return [];
    const json = await res.json();
    const dados = json?.dados || [];
    if (!Array.isArray(dados) || dados.length === 0) return [];

    const producao = dados.map((p: any) => mapearProposicaoCamara(p, idDeputadoNum));
    void persistirProducaoNoBanco(producao);
    return producao;
  } catch (e) {
    console.warn(`[Producao Live Câmara] Falha ao consultar deputado ${idDeputadoNum}:`, e);
    return [];
  }
}

async function buscarProducaoBanco(supabase: any, idDeputadoNum: number) {
  let { data, error } = await supabase
    .from("camara_producao_legislativa")
    .select("*")
    .eq("id_deputado", idDeputadoNum)
    .order("ano", { ascending: false });

  const fallback = obterFallbackClient(supabase);
  if ((error || !data || data.length === 0) && fallback) {
    const res = await fallback
      .from("camara_producao_legislativa")
      .select("*")
      .eq("id_deputado", idDeputadoNum)
      .order("ano", { ascending: false });
    if (!res.error && res.data && res.data.length > 0) {
      data = res.data;
    }
  }

  return data || [];
}

async function buscarProducaoDeputado(supabase: any, idDeputadoNum: number) {
  const data = await buscarProducaoBanco(supabase, idDeputadoNum);
  if (data.length > 0) return data;
  return buscarProducaoLiveCamara(idDeputadoNum);
}

async function buscarServidoresDeputado(supabase: any, idDeputadoNum: number) {
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

async function buscarCotaDeputado(supabase: any, idDeputadoNum: number) {
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

function montarRespostaBensHistorico(bens: any[]) {
  const maisRecente = bens[0];
  const anterior = bens.length > 1 ? bens[1] : null;
  const patrimonioTotal = Number(maisRecente.valor_total || 0);
  const patrimonioAnterior = anterior ? Number(anterior.valor_total || 0) : undefined;
  const variacao = patrimonioAnterior !== undefined ? patrimonioTotal - patrimonioAnterior : undefined;
  const variacaoPercentual = (patrimonioAnterior && patrimonioAnterior > 0 && variacao !== undefined)
    ? (variacao / patrimonioAnterior) * 100
    : undefined;

  return {
    patrimonioTotal,
    anoEleicao: maisRecente.ano_eleicao,
    bensDeclarados: maisRecente.descricao_bens || [],
    patrimonioAnterior,
    anoPatrimonioAnterior: anterior?.ano_eleicao,
    variacaoPatrimonio: variacao,
    variacaoPatrimonioPercentual: variacaoPercentual,
    historicoPatrimonio: bens.map((b: any) => ({
      ano: b.ano_eleicao,
      cargo: "Candidato",
      patrimonioTotal: Number(b.valor_total || 0),
      bensDeclarados: b.descricao_bens || [],
    })),
  };
}

async function buscarBensBancoPerfil(perfil: any): Promise<any[]> {
  const { buscarBensHistoricoTSE, buscarBensPorNomeTSE } = await import(
    "@/services/integrations/tse/bens"
  );
  const cpf = perfil?.cpf ? String(perfil.cpf).replace(/\D/g, "") : null;
  if (cpf && cpf.length === 11 && cpf !== "00000000000") {
    const porCpf = await buscarBensHistoricoTSE(cpf);
    if (porCpf.length > 0) return porCpf;
  }
  if (perfil?.nome_civil) {
    const porCivil = await buscarBensPorNomeTSE(perfil.nome_civil);
    if (porCivil.length > 0) return porCivil;
  }
  if (perfil?.nome_eleitoral) {
    return buscarBensPorNomeTSE(perfil.nome_eleitoral);
  }
  return [];
}

function extrairCpfPerfil(perfil: any, liveTse: any): string | null {
  const raw = perfil?.cpf || liveTse?.documentoPrincipal;
  const clean = raw ? String(raw).replace(/\D/g, "") : "";
  return clean && clean.length === 11 && clean !== "00000000000" ? clean : null;
}

function montarRespostaTseLivePerfil(liveTse: any) {
  return {
    patrimonioTotal: liveTse.patrimonioTotal,
    anoEleicao: liveTse.anoEleicao || 2026,
    bensDeclarados: liveTse.bensDeclarados || [],
    patrimonioAnterior: liveTse.patrimonioAnterior,
    anoPatrimonioAnterior: liveTse.anoPatrimonioAnterior,
    variacaoPatrimonio: liveTse.variacaoPatrimonio,
    variacaoPatrimonioPercentual: liveTse.variacaoPatrimonioPercentual,
    historicoPatrimonio: liveTse.historicoPatrimonio || [],
  };
}

async function consultarTseLiveParaPerfil(perfil: any): Promise<any | null> {
  const { buscarCpfNoTSE } = await import("@/app/api/investigar/tse");
  const { persistirBensHistoricosTSE } = await import("@/services/integrations/tse/bens");
  const nomeBusca = perfil?.nome_eleitoral || perfil?.nome_civil || "";
  const nomeSecundario = perfil?.nome_civil || undefined;
  const uf = perfil?.uf || "BR";

  const liveTse = await buscarCpfNoTSE(nomeBusca, uf, "6", nomeSecundario);
  if (!liveTse?.patrimonioTotal || liveTse.patrimonioTotal <= 0) return null;

  const cpf = extrairCpfPerfil(perfil, liveTse);
  if (cpf) {
    void persistirBensHistoricosTSE(cpf, nomeBusca, liveTse);
  }

  return montarRespostaTseLivePerfil(liveTse);
}

async function buscarPatrimonioTseDeputado(perfil: any): Promise<any | null> {
  try {
    const bens = await buscarBensBancoPerfil(perfil);
    if (bens.length > 0) return montarRespostaBensHistorico(bens);
    return await consultarTseLiveParaPerfil(perfil);
  } catch (err) {
    console.warn("[API Perfil Deputado] Erro ao buscar dados do TSE:", err);
    return null;
  }
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

    const [votos, producao, servidores, cota, tse] = await Promise.all([
      buscarVotosDeputado(supabase, parsed.idNum),
      buscarProducaoDeputado(supabase, parsed.idNum),
      buscarServidoresDeputado(supabase, parsed.idNum),
      buscarCotaDeputado(supabase, parsed.idNum),
      buscarPatrimonioTseDeputado(perfil),
    ]);

    return NextResponse.json({
      perfil,
      votos,
      producao,
      servidores,
      cota,
      tse,
    });
  } catch (error: any) {
    console.error("[API Perfil Deputado] Erro ao buscar dados:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar a requisição." },
      { status: 500 }
    );
  }
}
