import { cnpjValido, cpfValido, soDigitos } from "@/lib/documento";
import { buscarFonte } from "@/lib/fonte-http";

export function normalizeString(str: string): string {
	if (!str) return "";
	return str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

export function cleanPunctuation(str: string): string {
	if (!str) return "";
	return str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim();
}

const PREFIXOS_TITULOS = new Set([
	"dr", "dra", "prof", "profa", "professor", "professora",
	"pastor", "pastora", "padre", "bispo", "delegado", "delegada",
	"coronel", "capitao", "major", "sargento", "general", "irmao", "irma"
]);

/**
 * Verifica se `palavra` existe como palavra INTEIRA dentro de `texto`.
 * Aceita pontuação e espaços como delimitadores.
 */
export function matchPalavraInteira(texto: string, palavra: string): boolean {
	if (!texto || !palavra) return false;
	const regex = new RegExp(
		`(?:^|[\\s.,\\-_/])${palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[\\s.,\\-_/]|$|$)`,
	);
	return regex.test(texto);
}

/**
 * Legado: uma tentativa, sem cache, sem ajustes por host — mesmo
 * comportamento de antes. Código novo deve usar `buscarFonte`/`buscarJson`
 * (`@/lib/fonte-http`), que têm nova tentativa, cache e disjuntor.
 */
export async function fetchWithTimeout(
	resource: string | URL | RequestInfo,
	options: RequestInit & { timeout?: number } = {},
) {
	const { timeout = 8000, ...fetchOptions } = options;
	const url = resource instanceof Request ? resource.url : String(resource);
	return buscarFonte(url, {
		...fetchOptions,
		cache: "no-store",
		timeoutMs: timeout,
		tentativas: 1,
		aplicarPoliticas: false,
	});
}

export interface ItemHistoricoTse {
	ano: number;
	idEleicao: string;
	cargo: string;
	partido?: string;
	patrimonioTotal: number;
	bensDeclarados: any[];
	idTse?: number;
	nomeUrna?: string;
	nomeCompleto?: string;
	urlFoto?: string;
}

export interface TseCandidateResult {
	cpf: string;
	documentoPrincipal: string;
	cnpjCampanha: string | null;
	isCnpj: boolean;
	municipio: string;
	idUe: string;
	nome?: string;
	nomeUrna?: string | null;
	idTse?: number;
	anoEleicao?: number;
	idEleicao?: string;
	patrimonioTotal?: number;
	bensDeclarados?: any[];
	partido?: string;
	urlFoto?: string;
	historicoPatrimonio?: ItemHistoricoTse[];
	patrimonioAnterior?: number;
	anoPatrimonioAnterior?: number;
	variacaoPatrimonio?: number;
	variacaoPatrimonioPercentual?: number;
}

export const CAMPANHAS_GERAIS = [
	{ ano: "2026", idEleicao: "20322002026" }, // Eleições Gerais 2026
	{ ano: "2022", idEleicao: "2040602022" }, // Eleições Gerais 2022
	{ ano: "2018", idEleicao: "2022802018" }, // Eleições Gerais 2018
	{ ano: "2014", idEleicao: "680" },        // Eleições Gerais 2014
];

export const CAMPANHAS_MUNICIPAIS = [
	{ ano: "2024", idEleicao: "2045202024" }, // Eleições Municipais 2024
	{ ano: "2020", idEleicao: "2030402020" }, // Eleições Municipais 2020
	{ ano: "2016", idEleicao: "2" },          // Eleições Municipais 2016
];

const REGEX_SITUACAO_INVALIDA = /(N[AÃ]O ELEITO|INDEFERIDO|CANCELADO|REN[UÚ]NCIA)/;

export function isCandidatoEleitoOuValido(c: any): boolean {
	if (!c) return false;
	const sit = (c.descricaoTotalizacao || c.situacao || c.descricaoSituacao || "").toUpperCase();
	return !REGEX_SITUACAO_INVALIDA.test(sit);
}

function extrairTokensValidos(termo: string): string[] {
	return cleanPunctuation(normalizeString(termo))
		.split(/\s+/)
		.filter((p) => p.length >= 2 && !["de", "da", "do", "dos", "das"].includes(p));
}

function candidatoMatchTokens(c: any, tokens: string[]): boolean {
	if (tokens.length === 0) return false;
	const cUrna = normalizeString(c.nomeUrna || "");
	const cNome = normalizeString(c.nomeCompleto || "");
	return tokens.every((p) => matchPalavraInteira(cUrna, p) || matchPalavraInteira(cNome, p));
}

function candidatoMatchExatoOuPunct(c: any, termoNorm: string, termoClean: string): boolean {
	const cUrnaNorm = normalizeString(c.nomeUrna || "");
	const cNomeNorm = normalizeString(c.nomeCompleto || "");
	if (cUrnaNorm === termoNorm || cNomeNorm === termoNorm) return true;

	const cUrnaClean = cleanPunctuation(cUrnaNorm);
	const cNomeClean = cleanPunctuation(cNomeNorm);
	return cUrnaClean === termoClean || cNomeClean === termoClean;
}

function removerPrefixoSeHouver(tokens: string[]): string[] {
	if (tokens.length > 1 && PREFIXOS_TITULOS.has(tokens[0])) {
		return tokens.slice(1);
	}
	return tokens;
}

function encontrarPorTermo(candidatos: any[], termo: string): any {
	if (!termo) return null;
	const termoNorm = normalizeString(termo);
	const termoClean = cleanPunctuation(termoNorm);

	const exato = candidatos.find((c: any) => candidatoMatchExatoOuPunct(c, termoNorm, termoClean));
	if (exato) return exato;

	const tokens = extrairTokensValidos(termo);
	const porTokens = candidatos.find((c: any) => candidatoMatchTokens(c, tokens));
	if (porTokens) return porTokens;

	const tokensSemPrefixo = removerPrefixoSeHouver(tokens);
	if (tokensSemPrefixo.length < tokens.length) {
		return candidatos.find((c: any) => candidatoMatchTokens(c, tokensSemPrefixo));
	}
	return null;
}

export function encontrarCandidatoPorNome(
	candidatos: any[],
	nomePolitico: string,
	nomeSecundario?: string,
): any {
	const matchPrincipal = encontrarPorTermo(candidatos, nomePolitico);
	if (matchPrincipal) return matchPrincipal;

	if (nomeSecundario && nomeSecundario !== nomePolitico) {
		return encontrarPorTermo(candidatos, nomeSecundario);
	}
	return null;
}

async function fetchCandidatosEleicao(url: string, timeout = 6000) {
	try {
		const res = await fetchWithTimeout(url, { timeout });
		if (!res?.ok) return [];
		const data = await res.json();
		const todos = data?.candidatos || [];
		return todos.filter(isCandidatoEleitoOuValido);
	} catch {
		return [];
	}
}

async function buscarCandidatoEleicaoGeral(
	eleicao: any,
	uf: string,
	cargoCodigo: string,
	nomePolitico: string,
	nomeSecundario?: string,
): Promise<TseCandidateResult | null> {
	const urlListagem = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/${cargoCodigo}/candidatos`;
	const candidatos = await fetchCandidatosEleicao(urlListagem, 6000);
	if (candidatos.length === 0) return null;

	const match = encontrarCandidatoPorNome(candidatos, nomePolitico, nomeSecundario);
	if (!match?.id) return null;

	return extrairDetalhesDoTSE(eleicao, uf, match, uf, nomePolitico);
}

// Códigos TSE das capitais com varredura mais frequente (São Paulo e Rio).
const CODIGOS_CAPITAIS_TSE = new Set(["71072", "60011"]);

/** "São Paulo", "sao-paulo" e "SAO_PAULO" viram o mesmo slug. */
export function slugMunicipio(nome: string): string {
	return normalizeString(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function prioridadeMunicipio(m: any, alvo: string | null): number {
	if (alvo && slugMunicipio(String(m.nome ?? "")) === alvo) return 0;
	return CODIGOS_CAPITAIS_TSE.has(String(m.codigo)) ? 1 : 2;
}

/**
 * Municípios da UF, com o município do alvo primeiro (se informado) e depois as
 * capitais. O comparador antigo ignorava o segundo argumento e não ordenava nada.
 */
export function ordenarMunicipios(municipios: any[], municipioPreferido?: string): { codigos: string[]; preferido: boolean } {
	const alvo = municipioPreferido ? slugMunicipio(municipioPreferido) : null;
	const ordenados = [...municipios].sort((a, b) => prioridadeMunicipio(a, alvo) - prioridadeMunicipio(b, alvo));
	const preferido = Boolean(alvo) && prioridadeMunicipio(ordenados[0] ?? {}, alvo) === 0;
	return { codigos: ordenados.map((m: any) => String(m.codigo)), preferido };
}

async function buscarLocaisMunicipais(
	uf: string,
	idEleicao: string,
	municipioPreferido?: string,
): Promise<{ codigos: string[]; preferido: boolean }> {
	try {
		const urlMuni = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/eleicao/buscar/${uf}/${idEleicao}/municipios`;
		const resMuni = await fetchWithTimeout(urlMuni, { timeout: 10000 });
		if (!resMuni.ok) return { codigos: [], preferido: false };
		const dataMuni = await resMuni.json();
		if (!Array.isArray(dataMuni.municipios)) return { codigos: [], preferido: false };
		return ordenarMunicipios(dataMuni.municipios, municipioPreferido);
	} catch {
		return { codigos: [], preferido: false };
	}
}

async function buscarCandidatoNoLocal(
	eleicao: any,
	localidade: string,
	cargoCodigo: string,
	nomePolitico: string,
	timeout = 3500,
	nomeSecundario?: string,
) {
	const urlListagem = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${localidade}/${eleicao.idEleicao}/${cargoCodigo}/candidatos`;
	const candidatos = await fetchCandidatosEleicao(urlListagem, timeout);
	if (candidatos.length === 0) return null;
	const match = encontrarCandidatoPorNome(candidatos, nomePolitico, nomeSecundario);
	if (!match?.id) return null;
	return { match, localidade };
}

async function buscarCandidatoEleicaoMunicipal(
	eleicao: any,
	uf: string,
	cargoCodigo: string,
	nomePolitico: string,
	nomeSecundario?: string,
	municipioPreferido?: string,
): Promise<TseCandidateResult | null> {
	const { codigos: locais, preferido } = await buscarLocaisMunicipais(uf, eleicao.idEleicao, municipioPreferido);
	if (locais.length === 0) return null;
	// Município do alvo conhecido: procura só nele (varrer a UF trazia homônimos de outras cidades).
	if (preferido) return buscarSoNoMunicipio(eleicao, locais[0], cargoCodigo, nomePolitico, uf, nomeSecundario);

	const capitalLocal = locais[0];
	if (capitalLocal) {
		const achouCapital = await buscarCandidatoNoLocal(eleicao, capitalLocal, cargoCodigo, nomePolitico, 15000, nomeSecundario);
		if (achouCapital) {
			const res = await extrairDetalhesDoTSE(eleicao, capitalLocal, achouCapital.match, uf, nomePolitico);
			if (res) return res;
		}
	}

	const locaisRestantes = locais.slice(1);
	const chunkSize = 20;
	for (let i = 0; i < locaisRestantes.length; i += chunkSize) {
		const chunk = locaisRestantes.slice(i, i + chunkSize);
		const chunkPromises = chunk.map((loc) => buscarCandidatoNoLocal(eleicao, loc, cargoCodigo, nomePolitico, 3500, nomeSecundario));
		const chunkResults = await Promise.all(chunkPromises);
		const resultFound = chunkResults.find(Boolean);
		if (resultFound) {
			const res = await extrairDetalhesDoTSE(eleicao, resultFound.localidade, resultFound.match, uf, nomePolitico);
			if (res) return res;
		}
	}
	return null;
}

async function buscarSoNoMunicipio(
	eleicao: any,
	local: string,
	cargoCodigo: string,
	nomePolitico: string,
	uf: string,
	nomeSecundario?: string,
): Promise<TseCandidateResult | null> {
	const achou = await buscarCandidatoNoLocal(eleicao, local, cargoCodigo, nomePolitico, 15000, nomeSecundario);
	return achou ? extrairDetalhesDoTSE(eleicao, local, achou.match, uf, nomePolitico) : null;
}

export async function buscarCpfNoTSE(
	nomePolitico: string,
	uf: string,
	cargoCodigo: string = "5",
	nomeSecundario?: string,
	/** Slug do município do alvo (refs municipais): restringe a busca a ele. */
	municipioPreferido?: string,
): Promise<TseCandidateResult | null> {
	const isMunicipal = ["11", "12", "13"].includes(cargoCodigo);
	const campanhas = isMunicipal ? CAMPANHAS_MUNICIPAIS : CAMPANHAS_GERAIS;

	for (const eleicao of campanhas) {
		try {
			const resultado = isMunicipal
				? await buscarCandidatoEleicaoMunicipal(eleicao, uf, cargoCodigo, nomePolitico, nomeSecundario, municipioPreferido)
				: await buscarCandidatoEleicaoGeral(eleicao, uf, cargoCodigo, nomePolitico, nomeSecundario);

			if (resultado) return resultado;
		} catch (e) {
			console.warn(`[TSE] Falha iterando eleicao ${eleicao.ano} para CPF de ${nomePolitico}:`, e);
		}
	}
	return null;
}

async function buscarBensAdicionais(
	eleicao: any,
	uf: string,
	matchId: string,
): Promise<{ total: number; bens: any[] }> {
	try {
		const urlBens = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/candidato/${eleicao.ano}/${uf}/${eleicao.idEleicao}/candidato/${matchId}/bens`;
		const resBens = await fetchWithTimeout(urlBens, { timeout: 3000 });
		if (!resBens?.ok) return { total: 0, bens: [] };
		const dataBens = await resBens.json();
		return {
			total: dataBens.totalDeBens || 0,
			bens: dataBens.bens || [],
		};
	} catch {
		return { total: 0, bens: [] };
	}
}

async function resolverBensHistorico(eleicao: any, uf: string, matchId: string, det: any) {
	const total = det.totalDeBens || 0;
	const bens = det.bens || [];
	if (total > 0) return { total, bens };

	const bensExtra = await buscarBensAdicionais(eleicao, uf, matchId);
	if (bensExtra.total > 0) return bensExtra;
	return { total: 0, bens: [] };
}

function resolverCampoTexto(v1?: string, v2?: string, padrao = ""): string {
	if (v1) return v1;
	if (v2) return v2;
	return padrao;
}

function montarItemHistorico(eleicao: any, cargoPadrao: string, match: any, det: any, bensData: any): ItemHistoricoTse {
	return {
		ano: Number(eleicao.ano),
		idEleicao: eleicao.idEleicao,
		cargo: resolverCampoTexto(det.cargo?.nome, match.cargo?.nome, `Cargo ${cargoPadrao}`),
		partido: resolverCampoTexto(det.partido?.sigla, match.partido?.sigla),
		patrimonioTotal: bensData.total,
		bensDeclarados: bensData.bens,
		idTse: match.id,
		nomeUrna: match.nomeUrna,
		nomeCompleto: resolverCampoTexto(det.nomeCompleto, match.nomeCompleto),
		urlFoto: resolverCampoTexto(det.fotoUrl, match.fotoUrl),
	};
}

async function coletarCandidatoHistorico(
	eleicao: any,
	uf: string,
	cargo: string,
	nomePolitico: string,
): Promise<ItemHistoricoTse | null> {
	const urlListagem = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/${cargo}/candidatos`;
	const candidatos = await fetchCandidatosEleicao(urlListagem, 3500);
	if (candidatos.length === 0) return null;

	const match = encontrarCandidatoPorNome(candidatos, nomePolitico);
	if (!match?.id) return null;

	const urlDet = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/candidato/${match.id}`;
	const resDet = await fetchWithTimeout(urlDet, { timeout: 3500 });
	if (!resDet?.ok) return null;

	const det = await resDet.json().catch(() => null);
	if (!det) return null;

	const bensData = await resolverBensHistorico(eleicao, uf, match.id, det);
	return montarItemHistorico(eleicao, cargo, match, det, bensData);
}

async function processarCampanhaHistorico(
	eleicao: any,
	uf: string,
	nomePolitico: string,
	isMunicipal: boolean,
): Promise<ItemHistoricoTse | null> {
	if (isMunicipal) return null;
	const cargosGeraisParaBuscar = ["6", "5", "3", "7", "1"];

	for (const cargo of cargosGeraisParaBuscar) {
		try {
			const item = await coletarCandidatoHistorico(eleicao, uf, cargo, nomePolitico);
			if (item) return item;
		} catch {
			// Continua para o próximo cargo
		}
	}
	return null;
}

function calcularVariacoesPatrimonio(historico: ItemHistoricoTse[]) {
	if (historico.length < 2) {
		return {};
	}

	const maisRecente = historico[0];
	const anterior = historico[1];
	const patrimonioAnterior = anterior.patrimonioTotal;
	const anoPatrimonioAnterior = anterior.ano;
	const variacaoPatrimonio = maisRecente.patrimonioTotal - anterior.patrimonioTotal;

	let variacaoPatrimonioPercentual = 0;
	if (anterior.patrimonioTotal > 0) {
		variacaoPatrimonioPercentual = ((maisRecente.patrimonioTotal - anterior.patrimonioTotal) / anterior.patrimonioTotal) * 100;
	} else if (maisRecente.patrimonioTotal > 0) {
		variacaoPatrimonioPercentual = 100;
	}

	return {
		patrimonioAnterior,
		anoPatrimonioAnterior,
		variacaoPatrimonio,
		variacaoPatrimonioPercentual,
	};
}

async function buscarHistoricoPatrimonioTse(
	nomePolitico: string,
	uf: string,
	isMunicipal: boolean,
	registroAtual: ItemHistoricoTse,
): Promise<{
	historico: ItemHistoricoTse[];
	patrimonioAnterior?: number;
	anoPatrimonioAnterior?: number;
	variacaoPatrimonio?: number;
	variacaoPatrimonioPercentual?: number;
}> {
	const todasCampanhas = isMunicipal ? CAMPANHAS_MUNICIPAIS : CAMPANHAS_GERAIS;
	const outrasCampanhas = todasCampanhas.filter((c) => Number(c.ano) !== registroAtual.ano);

	const historico: ItemHistoricoTse[] = [registroAtual];
	const resultados = await Promise.allSettled(
		outrasCampanhas.map((eleicao) => processarCampanhaHistorico(eleicao, uf, nomePolitico, isMunicipal)),
	);

	for (const r of resultados) {
		if (r.status === "fulfilled" && r.value) {
			historico.push(r.value);
		}
	}

	historico.sort((a, b) => b.ano - a.ano);
	const variacoes = calcularVariacoesPatrimonio(historico);

	return {
		historico,
		...variacoes,
	};
}

async function fetchJsonDetalhes(url: string) {
	try {
		const res = await fetchWithTimeout(url, { timeout: 4000 });
		if (!res.ok) return null;
		const text = await res.text();
		return text ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

async function obterJsonDetalhesCandidato(eleicao: any, localidade: string, uf: string, matchId: string) {
	const urlPrimaria = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${eleicao.ano}/${localidade}/${eleicao.idEleicao}/candidato/${matchId}`;
	const jsonPrimario = await fetchJsonDetalhes(urlPrimaria);
	if (jsonPrimario) return jsonPrimario;

	const urlFallback = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/candidato/${matchId}`;
	return fetchJsonDetalhes(urlFallback);
}

async function obterBensDetalhes(eleicao: any, localidade: string, matchId: string, jsonCpf: any) {
	let total = jsonCpf?.totalDeBens || 0;
	let bens = jsonCpf?.bens || [];

	if (total === 0 && matchId) {
		const urlBens = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/candidato/${eleicao.ano}/${localidade}/${eleicao.idEleicao}/candidato/${matchId}/bens`;
		const resBens = await fetchJsonDetalhes(urlBens);
		if (resBens) {
			total = resBens.totalDeBens || 0;
			bens = resBens.bens || [];
		}
	}
	return { total, bens };
}

function extrairDocumentosCandidato(jsonCpf: any) {
	// CPF mascarado pela fonte (***.123.456-**) não é documento: antes virava "123456".
	const cpfReal = cpfValido(jsonCpf?.cpf) ? soDigitos(jsonCpf.cpf) : null;
	const cnpjCampanha = cnpjValido(jsonCpf?.cnpjcampanha) ? soDigitos(jsonCpf.cnpjcampanha) : null;
	const documentoValido = cpfReal || cnpjCampanha;
	const isCnpj = !cpfReal && Boolean(cnpjCampanha);
	return { cpfReal, cnpjCampanha, documentoValido, isCnpj };
}

function montarRegistroAtualTse(eleicao: any, match: any, jsonCpf: any, bensData: any): ItemHistoricoTse {
	return {
		ano: Number(eleicao.ano),
		idEleicao: eleicao.idEleicao,
		cargo: resolverCampoTexto(jsonCpf?.cargo?.nome, match.cargo?.nome, "Candidato"),
		partido: resolverCampoTexto(jsonCpf?.partido?.sigla, match.partido?.sigla),
		patrimonioTotal: bensData.total,
		bensDeclarados: bensData.bens,
		idTse: match.id,
		nomeUrna: match.nomeUrna,
		nomeCompleto: resolverCampoTexto(jsonCpf?.nomeCompleto, match.nomeCompleto),
		urlFoto: resolverCampoTexto(jsonCpf?.fotoUrl, match.fotoUrl),
	};
}

function montarResultadoTse(
	docInfo: any,
	municipioRef: string,
	localidade: string,
	eleicao: any,
	match: any,
	jsonCpf: any,
	bensData: any,
	dadosHistorico: any,
	nomePolitico: string,
): TseCandidateResult {
	const nomeFinal = resolverCampoTexto(jsonCpf?.nomeCompleto, match.nomeCompleto, nomePolitico);
	return {
		cpf: docInfo.documentoValido,
		documentoPrincipal: docInfo.documentoValido,
		cnpjCampanha: docInfo.cnpjCampanha,
		isCnpj: docInfo.isCnpj,
		municipio: municipioRef,
		idUe: localidade,
		nome: nomeFinal,
		nomeUrna: match.nomeUrna || null,
		idTse: match.id,
		anoEleicao: Number(eleicao.ano),
		idEleicao: eleicao.idEleicao,
		patrimonioTotal: bensData.total,
		bensDeclarados: bensData.bens,
		partido: resolverCampoTexto(jsonCpf?.partido?.sigla, match.partido?.sigla),
		urlFoto: resolverCampoTexto(jsonCpf?.fotoUrl, match.fotoUrl),
		historicoPatrimonio: dadosHistorico.historico,
		patrimonioAnterior: dadosHistorico.patrimonioAnterior,
		anoPatrimonioAnterior: dadosHistorico.anoPatrimonioAnterior,
		variacaoPatrimonio: dadosHistorico.variacaoPatrimonio,
		variacaoPatrimonioPercentual: dadosHistorico.variacaoPatrimonioPercentual,
	};
}

async function extrairDetalhesDoTSE(
	eleicao: any,
	localidade: string,
	match: any,
	uf: string,
	nomePolitico: string,
): Promise<TseCandidateResult | null> {
	const jsonCpf = await obterJsonDetalhesCandidato(eleicao, localidade, uf, match.id);
	const docInfo = extrairDocumentosCandidato(jsonCpf);
	if (!docInfo.documentoValido) return null;

	const nomeMunicipioRaw = resolverCampoTexto(jsonCpf?.localCandidatura, jsonCpf?.unidadeEleitoral?.nome, uf);
	const municipioRef = normalizeString(nomeMunicipioRaw).replace(/\s+/g, "-");

	const bensData = await obterBensDetalhes(eleicao, localidade, match.id, jsonCpf);
	const isMunicipal = ["11", "12", "13"].includes(String(jsonCpf?.cargo?.codigo || ""));
	const registroAtual = montarRegistroAtualTse(eleicao, match, jsonCpf, bensData);

	const nomeParaHistorico = resolverCampoTexto(jsonCpf?.nomeCompleto, match.nomeCompleto, nomePolitico);
	const dadosHistorico = await buscarHistoricoPatrimonioTse(nomeParaHistorico, uf, isMunicipal, registroAtual);

	return montarResultadoTse(
		docInfo,
		municipioRef,
		localidade,
		eleicao,
		match,
		jsonCpf,
		bensData,
		dadosHistorico,
		nomePolitico,
	);
}

/**
 * Doadores das contas de campanha guardadas no Banco de Perfil, pelo número do candidato
 * (sem homônimo). Substitui a tabela antiga `tse_doadores_cache` (por nome civil + UF,
 * confundia homônimos), aposentada em 08/10/2026 para aliviar o Banco Principal.
 */
async function doadoresDaBase(sqCandidato: string | null | undefined): Promise<string[]> {
	if (!sqCandidato) return [];
	const { buscarContasCampanha } = await import("@/services/integrations/tse/campanha");
	const contas = await buscarContasCampanha(sqCandidato).catch(() => null);
	const documentos = (contas?.doadores ?? []).map((d) => String(d.documento ?? "").replace(/\D/g, "")).filter((d) => d.length === 11 || d.length === 14);
	return [...new Set(documentos)];
}

function resolverAnoEleicao(idEleicao: string): string {
	if (idEleicao === "20322002026") return "2026";
	if (idEleicao === "2045202024") return "2024";
	if (idEleicao === "2040602022") return "2022";
	return "2020";
}

async function buscarCandidatoIdParaDoadores(
	ano: string,
	uf: string,
	idEleicao: string,
	cargoCodigo: string,
	nomePolitico: string,
): Promise<string | null> {
	const urlBusca = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${ano}/${uf}/${idEleicao}/${cargoCodigo}/candidatos`;
	try {
		const resBusca = await fetchWithTimeout(urlBusca, {
			timeout: 5000,
			headers: {
				Accept: "application/json, text/plain, */*",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});
		if (!resBusca.ok) return null;
		const dataBusca = await resBusca.json();
		const termoNorm = normalizeString(nomePolitico);

		const candidato = dataBusca.candidatos?.find((c: any) => {
			const cUrna = normalizeString(c.nomeUrna || "");
			const cNome = normalizeString(c.nomeCompleto || "");
			return (
				cUrna === termoNorm ||
				cNome === termoNorm ||
				matchPalavraInteira(cUrna, termoNorm) ||
				matchPalavraInteira(cNome, termoNorm)
			);
		});

		return candidato?.id ? String(candidato.id) : null;
	} catch {
		return null;
	}
}

/**
 * Doadores da campanha (CPF/CNPJ, só dígitos). Com o número do candidato, das contas
 * do TSE no Banco de Perfil; sem ele (ou sem contas), o DivulgaCand ao vivo.
 */
export async function buscarDoadoresTSE(
	nomePolitico: string,
	uf: string,
	cargoCodigo: string = "6",
	idEleicao: string = "20322002026",
	sqCandidato?: string | null,
): Promise<string[]> {
	const daBase = await doadoresDaBase(sqCandidato);
	if (daBase.length > 0) return daBase;

	const ano = resolverAnoEleicao(idEleicao);
	const candidatoId = await buscarCandidatoIdParaDoadores(ano, uf, idEleicao, cargoCodigo, nomePolitico);
	if (!candidatoId) return [];

	const urlContas = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta/${idEleicao}/${ano}/${uf}/${cargoCodigo}/90/90/${candidatoId}`;
	try {
		const resContas = await fetchWithTimeout(urlContas, {
			method: "GET",
			timeout: 8000,
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.120 Safari/537.36",
				Accept: "application/json, text/plain, */*",
				"Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				Referer: "https://divulgacandcontas.tse.jus.br/divulga/",
				"Sec-Fetch-Dest": "empty",
				"Sec-Fetch-Mode": "cors",
				"Sec-Fetch-Site": "same-origin",
				Connection: "keep-alive",
			},
		});
		if (!resContas.ok) return [];

		const dataContas = await resContas.json();
		const listaDoadores = (dataContas.rankingDoadores || [])
			.map((doacao: any) => (doacao.cpfCnpj ? doacao.cpfCnpj.replace(/\D/g, "") : null))
			.filter(Boolean);

		return [...new Set<string>(listaDoadores)];
	} catch (e) {
		console.warn(`[TSE] Falha ao buscar doadores para ${nomePolitico}:`, e);
		return [];
	}
}
