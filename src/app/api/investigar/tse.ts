/**
 * Utilitários e tipos do TSE usados pelas nossas bases (tse_eleitos, tse_bens_historico,
 * tse_campanha_contas) e pelo resto do pipe (normalização de nomes, fetch com tempo limite).
 *
 * A consulta ao vivo ao DivulgaCand (identificação, bens, histórico e doadores) saiu em
 * 12/10/2026: o site recusa servidores de nuvem (Vercel em iad1 e gru1, GitHub Actions) e
 * o Polígrafo passou a usar só os arquivos oficiais do TSE carregados por ETL.
 */
import { buscarFonte } from "@/lib/fonte-http";

export function normalizeString(str: string): string {
	if (!str) return "";
	return str
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.trim();
}

export function cleanPunctuation(str: string): string {
	if (!str) return "";
	return str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim();
}

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

/** Dados eleitorais do alvo no formato que o pipe usa (montados das bases em tse-da-base.ts). */
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

/** Código de cada eleição no TSE (idEleicao), do ano mais recente para o mais antigo. */
export const CAMPANHAS_GERAIS = [
	{ ano: "2026", idEleicao: "20322002026" }, // Eleições Gerais 2026
	{ ano: "2022", idEleicao: "2040602022" }, // Eleições Gerais 2022
	{ ano: "2018", idEleicao: "2022802018" }, // Eleições Gerais 2018
	{ ano: "2014", idEleicao: "680" }, // Eleições Gerais 2014
];

export const CAMPANHAS_MUNICIPAIS = [
	{ ano: "2024", idEleicao: "2045202024" }, // Eleições Municipais 2024
	{ ano: "2020", idEleicao: "2030402020" }, // Eleições Municipais 2020
	{ ano: "2016", idEleicao: "2" }, // Eleições Municipais 2016
];

/** "São Paulo", "sao-paulo" e "SAO_PAULO" viram o mesmo slug. */
export function slugMunicipio(nome: string): string {
	return normalizeString(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Variação entre as duas declarações de bens mais recentes (histórico do mais novo para o mais antigo). */
export function calcularVariacoesPatrimonio(historico: ItemHistoricoTse[]) {
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
