export function normalizeString(str: string): string {
	if (!str) return "";
	return str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

/**
 * Verifica se `palavra` existe como palavra INTEIRA dentro de `texto`.
 * Evita falsos positivos como "marotto" matchando dentro de "camarotto".
 */
export function matchPalavraInteira(texto: string, palavra: string): boolean {
	if (!texto || !palavra) return false;
	const regex = new RegExp(
		`(?:^|\\s|-)${palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|-|$)`,
	);
	return regex.test(texto);
}

export async function fetchWithTimeout(
	resource: string | URL | RequestInfo,
	options: RequestInit & { timeout?: number } = {},
) {
	const { timeout = 8000, ...fetchOptions } = options;
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(resource as URL, {
			...fetchOptions,
			signal: controller.signal,
			cache: "no-store",
		});
		clearTimeout(id);
		return response;
	} catch (e) {
		clearTimeout(id);
		throw e;
	}
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

function encontrarCandidatoPorNome(candidatos: any[], nomePolitico: string): any {
	const termoNorm = normalizeString(nomePolitico);
	const matchExato = candidatos.find((c: any) => {
		const cUrna = normalizeString(c.nomeUrna || "");
		const cNome = normalizeString(c.nomeCompleto || "");
		return cUrna === termoNorm || cNome === termoNorm;
	});
	if (matchExato) return matchExato;

	const parts = termoNorm
		.split(/\s+/)
		.filter((p: string) => !["de", "da", "do", "dos", "das"].includes(p));

	return candidatos.find((c: any) => {
		const cUrna = normalizeString(c.nomeUrna || "");
		const cNome = normalizeString(c.nomeCompleto || "");
		return parts.every(
			(p: string) => matchPalavraInteira(cUrna, p) || matchPalavraInteira(cNome, p),
		);
	});
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
): Promise<TseCandidateResult | null> {
	const urlListagem = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/${cargoCodigo}/candidatos`;
	const candidatos = await fetchCandidatosEleicao(urlListagem, 6000);
	if (candidatos.length === 0) return null;

	const match = encontrarCandidatoPorNome(candidatos, nomePolitico);
	if (!match?.id) return null;

	return extrairDetalhesDoTSE(eleicao, uf, match, uf, nomePolitico);
}

async function buscarLocaisMunicipais(uf: string, idEleicao: string): Promise<string[]> {
	try {
		const urlMuni = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/eleicao/buscar/${uf}/${idEleicao}/municipios`;
		const resMuni = await fetchWithTimeout(urlMuni, { timeout: 10000 });
		if (!resMuni.ok) return [];
		const dataMuni = await resMuni.json();
		if (!Array.isArray(dataMuni.municipios)) return [];

		return dataMuni.municipios
			.sort((a: any) => (a.codigo === "71072" || a.codigo === "60011" ? -1 : 1))
			.map((m: any) => m.codigo);
	} catch {
		return [];
	}
}

async function buscarCandidatoNoLocal(
	eleicao: any,
	localidade: string,
	cargoCodigo: string,
	nomePolitico: string,
	timeout = 3500,
) {
	const urlListagem = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${localidade}/${eleicao.idEleicao}/${cargoCodigo}/candidatos`;
	const candidatos = await fetchCandidatosEleicao(urlListagem, timeout);
	if (candidatos.length === 0) return null;
	const match = encontrarCandidatoPorNome(candidatos, nomePolitico);
	if (!match?.id) return null;
	return { match, localidade };
}

async function buscarCandidatoEleicaoMunicipal(
	eleicao: any,
	uf: string,
	cargoCodigo: string,
	nomePolitico: string,
): Promise<TseCandidateResult | null> {
	const locais = await buscarLocaisMunicipais(uf, eleicao.idEleicao);
	if (locais.length === 0) return null;

	const capitalLocal = locais[0];
	if (capitalLocal) {
		const achouCapital = await buscarCandidatoNoLocal(eleicao, capitalLocal, cargoCodigo, nomePolitico, 15000);
		if (achouCapital) {
			const res = await extrairDetalhesDoTSE(eleicao, capitalLocal, achouCapital.match, uf, nomePolitico);
			if (res) return res;
		}
	}

	const locaisRestantes = locais.slice(1);
	const chunkSize = 20;
	for (let i = 0; i < locaisRestantes.length; i += chunkSize) {
		const chunk = locaisRestantes.slice(i, i + chunkSize);
		const chunkPromises = chunk.map((loc) => buscarCandidatoNoLocal(eleicao, loc, cargoCodigo, nomePolitico));
		const chunkResults = await Promise.all(chunkPromises);
		const resultFound = chunkResults.find(Boolean);
		if (resultFound) {
			const res = await extrairDetalhesDoTSE(eleicao, resultFound.localidade, resultFound.match, uf, nomePolitico);
			if (res) return res;
		}
	}
	return null;
}

export async function buscarCpfNoTSE(
	nomePolitico: string,
	uf: string,
	cargoCodigo: string = "5",
): Promise<TseCandidateResult | null> {
	const isMunicipal = ["11", "12", "13"].includes(cargoCodigo);
	const campanhas = isMunicipal ? CAMPANHAS_MUNICIPAIS : CAMPANHAS_GERAIS;

	for (const eleicao of campanhas) {
		try {
			const resultado = isMunicipal
				? await buscarCandidatoEleicaoMunicipal(eleicao, uf, cargoCodigo, nomePolitico)
				: await buscarCandidatoEleicaoGeral(eleicao, uf, cargoCodigo, nomePolitico);

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
	const cpfReal = jsonCpf?.cpf ? String(jsonCpf.cpf).replace(/\D/g, "") : null;
	const cnpjCampanha = jsonCpf?.cnpjcampanha ? String(jsonCpf.cnpjcampanha).replace(/\D/g, "") : null;
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

async function consultarCacheDoadores(nomePolitico: string, uf: string): Promise<string[] | null> {
	try {
		const { supabaseAdmin } = await import("@/lib/supabase-admin");
		const { data: cacheData, error: cacheErr } = await supabaseAdmin
			.from("tse_doadores_cache")
			.select("doadores")
			.ilike("nome_politico", nomePolitico)
			.eq("uf", uf.toUpperCase())
			.limit(1)
			.single();

		if (!cacheErr && cacheData?.doadores?.length > 0) {
			return cacheData.doadores;
		}
	} catch {
		// Falha silenciosa no cache
	}
	return null;
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

async function salvarDoadoresNoCache(nomePolitico: string, uf: string, doadores: string[]) {
	if (doadores.length === 0) return;
	try {
		const { supabaseAdmin } = await import("@/lib/supabase-admin");
		await supabaseAdmin.from("tse_doadores_cache").upsert(
			{
				nome_politico: nomePolitico,
				uf: uf,
				doadores,
			},
			{ onConflict: "nome_politico, uf" },
		);
	} catch (err) {
		console.warn("[TSE DEBUG] Erro ao salvar doadores no cache", err);
	}
}

export async function buscarDoadoresTSE(
	nomePolitico: string,
	uf: string,
	cargoCodigo: string = "6",
	idEleicao: string = "20322002026",
): Promise<string[]> {
	const cache = await consultarCacheDoadores(nomePolitico, uf);
	if (cache) return cache;

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

		const doadoresUnicos = [...new Set<string>(listaDoadores)];
		await salvarDoadoresNoCache(nomePolitico, uf, doadoresUnicos);
		return doadoresUnicos;
	} catch (e) {
		console.warn(`[TSE] Falha ao buscar doadores para ${nomePolitico}:`, e);
		return [];
	}
}
