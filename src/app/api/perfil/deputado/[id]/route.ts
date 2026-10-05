import { NextResponse } from "next/server";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buscarCotaDeputado, buscarServidoresDeputado, buscarVotosDeputado, obterFallbackClient } from "@/lib/perfil-deputado/consultas";
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

import { fetchWithTimeout } from "@/app/api/investigar/tse";
import { type MandatoHistorico, mandatoDoHistorico } from "@/lib/mandato";

/** Fatos do mandato (posse, retorno, saída, origem) a partir do histórico da Câmara; a tela decide o texto (lib/mandato.ts). */
function camposDoMandato(mandato: MandatoHistorico) {
  return {
    situacao: mandato.situacao,
    condicao_eleitoral: mandato.condicaoEleitoral,
    data_posse: mandato.dataPosse,
    data_entrada: mandato.dataEntrada,
    data_saida: mandato.dataSaida,
    origem_posse: mandato.origemPosse,
    motivo_afastamento: mandato.motivoAfastamento,
  };
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
    ...camposDoMandato(mandato),
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

    const mandato = mandatoDoHistorico(histData, depData?.ultimoStatus);
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
  if (perfil.data_posse !== undefined) return perfil;
  try {
    const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";
    const [depRes, histRes] = await Promise.allSettled([
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}`, { timeout: 4000 }).then(r => r.json()),
      fetchWithTimeout(`${API_BASE}/deputados/${idDeputadoNum}/historico`, { timeout: 4000 }).then(r => r.json()),
    ]);
    const depData = depRes.status === "fulfilled" ? depRes.value?.dados : null;
    const histData = histRes.status === "fulfilled" ? histRes.value?.dados : [];
    const mandato = mandatoDoHistorico(histData, depData?.ultimoStatus);
    return {
      ...perfil,
      ...camposDoMandato(mandato),
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
