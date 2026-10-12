/**
 * Identificação do alvo: CPF oficial da Câmara, dados do TSE (nossa base primeiro,
 * tse-base-primeiro.ts), identidade verificada (identidade.ts), ficha (sanções, TCU,
 * processos) e patrimônio declarado. Devolve o contexto completo da investigação.
 */
import { buscarDetalhesPolitico } from "@/app/api/investigar/scrapers/legislativo";
import { investigarPolitico } from "@/app/api/investigar/scrapers/osint-fiscal";
import { chaveCachePesquisa } from "@/lib/cache-pesquisas";
import { perfilDaCasa } from "@/services/core/alcada";
import { coletarContratosDoMandato } from "@/services/core/contratos-do-ente";
import { resolverIdentidade } from "@/services/core/identidade";
import { dadosTseDoAlvo } from "@/services/core/tse-base-primeiro";
import { type Execucao, type Investigacao, status } from "./contexto";

/** Tenta pegar o CPF da API da Câmara. Se for do Senado, vem nulo. */
async function detalhesDaCamara(dep: any): Promise<any> {
	if (dep.casa !== "CAMARA" || Number.isNaN(Number(dep.id))) return null;
	try {
		return await buscarDetalhesPolitico(Number(dep.id));
	} catch (_e) {
		console.log("[API Câmara Falhou, ignorando detalhes...]");
		return null;
	}
}

function mensagemDocumento(cpf: string | null, ehCnpj: boolean): string {
	if (!cpf) return `Documento do político não confirmado: consultas por CPF (sanções, TCU, processos) serão puladas.`;
	if (ehCnpj) return `CNPJ de Campanha capturado (${cpf}). Usando dados declarados ao TSE...`;
	return `CPF capturado (${cpf}). Investigando Ficha Limpa, TCU e Processos Judiciais...`;
}

/** SEMPRE bate no TSE para resgatar o Patrimônio e Nome Civil (mesmo se o documento vier da ref). */
async function dadosEleitorais(e: Execucao, dep: any, detalhes: any) {
	status(e, "Extraindo dados complementares e patrimônio na base eleitoral do TSE...");
	// Regras da alçada numa tabela só (cargo TSE, rótulo, esfera, fontes): services/core/alcada.ts
	const perfil = perfilDaCasa(dep.casa, dep.uf);
	const nomeParaTSE = dep.nome.replace(/\s*\(.*?\)\s*/g, "").trim();
	// No municipal, a busca no TSE fica no município da ref (antes valia o 1º município com o nome).
	const municipio = perfil.esfera === "MUNICIPAL" ? dep.uri : undefined;
	const { tseResult, eleito } = await dadosTseDoAlvo(
		{ alvo: { id: dep.id, cpfOficial: detalhes?.cpf, nome: nomeParaTSE, uf: dep.uf, cargoTse: perfil.cargoTse }, nomeCivil: detalhes?.nomeCivil, municipio },
		e.sendEvent,
	);
	return { perfil, tseResult, eleito };
}

function avisosDaIdentidade(e: Execucao, identidade: ReturnType<typeof resolverIdentidade>): void {
	for (const conflito of identidade.conflitos) status(e, `[IDENTIDADE] ${conflito}`);
	if (identidade.documentoIsCnpj) {
		status(e, `[LGPD] Apenas CNPJ de Campanha disponível nativamente. Buscas de patrimônio pessoal limitadas.`);
	}
}

/** Ficha (CGU, TCU, processos) e patrimônio do TSE (com reserva nas nossas bases). */
async function fichaEPatrimonio(e: Execucao, dep: any, cpf: string | null, pessoaId: string, detalhes: any) {
	const ficha = await investigarPolitico(cpf ?? "", dep.nome, dep.uf, pessoaId, e.sendEvent);
	// Resolução resiliente do patrimônio do político (TSE DivulgaCand + Fallback em cascata Supabase)
	const { resolverPatrimonioTSE } = await import("@/services/integrations/tse/bens");
	await resolverPatrimonioTSE(ficha, dep._tseResult, cpf ?? "", dep.nome, e.sendEvent, detalhes?.nomeCivil);
	return ficha;
}

export async function identificar(e: Execucao, dep: any): Promise<Investigacao> {
	let detalhes = await detalhesDaCamara(dep);
	const possivelDoc = String(dep.id).replace(/\D/g, "");
	const { perfil, tseResult, eleito } = await dadosEleitorais(e, dep, detalhes);
	// Identidade verificada (v2): documento válido, confiança e se os dados do TSE são da
	// mesma pessoa. Nunca adota CPF achado só pelo nome (ver services/core/identidade.ts).
	const identidade = resolverIdentidade({ cpfOficial: detalhes?.cpf, docDaRef: possivelDoc, tse: tseResult, eleito });
	const cpf = identidade.documento;
	avisosDaIdentidade(e, identidade);
	if (identidade.usarDadosTse && tseResult?.nome) {
		detalhes = detalhes || ({} as any);
		detalhes.nomeCivil = tseResult.nome;
	}
	// Armazena o resultado do TSE para uso posterior (patrimônio, foto, partido) — só se for a mesma pessoa
	dep._tseResult = identidade.usarDadosTse ? tseResult : null;
	const pessoaId = `pessoa-${cpf ?? dep.id}`;
	// Contratos do órgão do mandato e da própria casa no PNCP (~20 s por página): começa já, em paralelo; emite no fim.
	const coletaEnte = coletarContratosDoMandato({
		esfera: perfil.esfera, uf: dep.uf, codIbge: eleito?.cd_municipio_ibge, municipio: dep._nomeMunicipio,
		cargoTse: perfil.cargoTse,
	});
	// Se o documento é um CNPJ de campanha, pula a investigação de patrimônio pessoal profunda (mas mantém o que veio do TSE)
	status(e, mensagemDocumento(cpf, identidade.documentoIsCnpj));
	const ficha = await fichaEPatrimonio(e, dep, cpf, pessoaId, detalhes);
	return {
		...e,
		dep,
		detalhes,
		perfil,
		identidade,
		cpf,
		documentoIsCnpj: identidade.documentoIsCnpj,
		pessoaId,
		tse: dep._tseResult,
		eleito,
		ficha,
		coletaEnte,
		chaveCache: chaveCachePesquisa(e.p.nomeParaBusca, e.p.refParam || e.p.forceRef),
		dbSearchId: null,
		isDev: process.env.NODE_ENV === "development",
	};
}
