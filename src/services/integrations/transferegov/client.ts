// lib/transferegov/client.ts
// Client para o TransfereGov API (PostgREST) — Emendas PIX / Transferências Especiais
// Portado do mcp-brasil v0.14.0 — data/transferegov/client.py

import type { ResumoEmendasPIX, TransferenciaEspecial } from "./types";

// ==========================================
// Constantes
// ==========================================
const TRANSFEREGOV_API_BASE = "https://api.transferegov.gestao.gov.br";
const PLANO_ACAO_URL = `${TRANSFEREGOV_API_BASE}/transferenciasespeciais/plano_acao_especial`;
const DEFAULT_PAGE_SIZE = 15;
const DEFAULT_TIMEOUT = 12000;

// ==========================================
// Helpers
// ==========================================

function getRawVal(raw: Record<string, any>, key: string) {
	const v = raw[key];
	return v !== undefined && v !== null ? v : null;
}

/** Parseia um item raw da API PostgREST para nosso tipo */
export function parseTransferencia(
	raw: Record<string, any>,
): TransferenciaEspecial {
	return {
		idPlanoAcao: getRawVal(raw, "id_plano_acao"),
		codigoPlanoAcao: getRawVal(raw, "codigo_plano_acao"),
		ano: getRawVal(raw, "ano_plano_acao"),
		situacao: getRawVal(raw, "situacao_plano_acao"),
		nomeParlamentar: getRawVal(raw, "nome_parlamentar_emenda_plano_acao"),
		numeroEmenda: getRawVal(raw, "numero_emenda_parlamentar_plano_acao"),
		anoEmenda: getRawVal(raw, "ano_emenda_parlamentar_plano_acao"),
		valorCusteio: getRawVal(raw, "valor_custeio_plano_acao"),
		valorInvestimento: getRawVal(raw, "valor_investimento_plano_acao"),
		cnpjBeneficiario: getRawVal(raw, "cnpj_beneficiario_plano_acao"),
		nomeBeneficiario: getRawVal(raw, "nome_beneficiario_plano_acao"),
		ufBeneficiario: getRawVal(raw, "uf_beneficiario_plano_acao"),
		areaPoliticaPublica: getRawVal(
			raw,
			"codigo_descricao_areas_politicas_publicas_plano_acao",
		),
	};
}

/** Constrói query params para PostgREST (column=operator.value) */
function buildQuery(
	filters: Record<string, string>,
	limit = DEFAULT_PAGE_SIZE,
	offset = 0,
	order?: string,
): URLSearchParams {
	const params = new URLSearchParams(filters);
	params.set("limit", String(limit));
	params.set("offset", String(offset));
	if (order) params.set("order", order);
	return params;
}

async function requestTransferenciasComTimeout(url: string, timeout: number) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		return await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept: "application/json",
			},
		});
	} finally {
		clearTimeout(timer);
	}
}

/** Executa GET na API PostgREST com filtros e retry */
async function fetchTransferencias(
	filters: Record<string, string>,
	pagina = 1,
	timeout = DEFAULT_TIMEOUT,
	retries = 2,
): Promise<TransferenciaEspecial[]> {
	const offset = (pagina - 1) * DEFAULT_PAGE_SIZE;
	const params = buildQuery(
		filters,
		DEFAULT_PAGE_SIZE,
		offset,
		"ano_plano_acao.desc",
	);
	const url = `${PLANO_ACAO_URL}?${params.toString()}`;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const response = await requestTransferenciasComTimeout(url, timeout);

			if (!response.ok) {
				if (response.status >= 500 && attempt < retries) {
					console.warn(
						`[TransfereGov] HTTP ${response.status} para ${url}. Tentativa ${attempt + 1}/${retries + 1}...`,
					);
					await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
					continue;
				}
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			return Array.isArray(data) ? data.map(parseTransferencia) : [];
		} catch (e: any) {
			const msg = e.name === "AbortError" ? `Timeout (${timeout}ms)` : e.message;
			console.warn(`[TransfereGov] Falha na tentativa ${attempt + 1}:`, msg);

			if (attempt < retries) {
				await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
			}
		}
	}
	return [];
}

// ==========================================
// API Pública
// ==========================================

/**
 * Busca emendas PIX (transferências especiais) por nome do parlamentar.
 * Usa filtro ilike (case-insensitive, partial match) do PostgREST.
 */
export async function buscarEmendasPorAutor(
	nomeAutor: string,
	ano?: number,
	pagina = 1,
): Promise<TransferenciaEspecial[]> {
	const filters: Record<string, string> = {
		nome_parlamentar_emenda_plano_acao: `ilike.*${nomeAutor}*`,
	};
	if (ano) filters.ano_plano_acao = `eq.${ano}`;
	return fetchTransferencias(filters, pagina);
}

/**
 * Busca emendas PIX destinadas a um município específico.
 */
export async function buscarEmendasPorMunicipio(
	nomeMunicipio: string,
	ano?: number,
	pagina = 1,
): Promise<TransferenciaEspecial[]> {
	const filters: Record<string, string> = {
		nome_beneficiario_plano_acao: `ilike.*${nomeMunicipio}*`,
	};
	if (ano) filters.ano_plano_acao = `eq.${ano}`;
	return fetchTransferencias(filters, pagina);
}

/**
 * Busca emendas PIX por CNPJ do beneficiário.
 * Útil para cruzar com empresas de sócios do político.
 */
export async function buscarEmendasPorCNPJ(
	cnpj: string,
	pagina = 1,
): Promise<TransferenciaEspecial[]> {
	const cnpjLimpo = cnpj.replace(/\D/g, "");
	return fetchTransferencias(
		{ cnpj_beneficiario_plano_acao: `eq.${cnpjLimpo}` },
		pagina,
	);
}

/**
 * Busca emendas PIX de um ano para uma UF específica.
 */
export async function buscarEmendasPorUF(
	uf: string,
	ano?: number,
	pagina = 1,
): Promise<TransferenciaEspecial[]> {
	const filters: Record<string, string> = {
		uf_beneficiario_plano_acao: `eq.${uf.toUpperCase()}`,
	};
	if (ano) filters.ano_plano_acao = `eq.${ano}`;
	return fetchTransferencias(filters, pagina);
}

/**
 * Busca detalhe de uma emenda PIX específica pelo ID.
 */
export async function detalheEmenda(
	idPlanoAcao: number,
): Promise<TransferenciaEspecial | null> {
	const params = buildQuery({ id_plano_acao: `eq.${idPlanoAcao}` }, 1, 0);
	const url = `${PLANO_ACAO_URL}?${params.toString()}`;

	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		const data = await response.json();
		if (Array.isArray(data) && data.length > 0) {
			return parseTransferencia(data[0]);
		}
		return null;
	} catch {
		return null;
	}
}

function agregarEmendasPIX(todasEmendas: TransferenciaEspecial[]): ResumoEmendasPIX {
	const municipiosSet = new Set<string>();
	const areasSet = new Set<string>();
	const ufCount: Record<string, number> = {};

	let valorTotalCusteio = 0;
	let valorTotalInvestimento = 0;

	for (const e of todasEmendas) {
		if (e.nomeBeneficiario) municipiosSet.add(e.nomeBeneficiario);
		if (e.areaPoliticaPublica) areasSet.add(e.areaPoliticaPublica);
		if (e.ufBeneficiario) {
			ufCount[e.ufBeneficiario] = (ufCount[e.ufBeneficiario] || 0) + 1;
		}
		valorTotalCusteio += e.valorCusteio || 0;
		valorTotalInvestimento += e.valorInvestimento || 0;
	}

	const ufsMaisAtendidas = Object.entries(ufCount)
		.map(([uf, quantidade]) => ({ uf, quantidade }))
		.sort((a, b) => b.quantidade - a.quantidade)
		.slice(0, 5);

	return {
		totalEmendas: todasEmendas.length,
		valorTotalCusteio,
		valorTotalInvestimento,
		valorTotalGeral: valorTotalCusteio + valorTotalInvestimento,
		municipiosAtendidos: [...municipiosSet].slice(0, 20),
		areasPoliticas: [...areasSet],
		ufsMaisAtendidas,
	};
}

/**
 * Gera um resumo totalizado das emendas PIX de um parlamentar.
 * Busca todas as páginas disponíveis (até 5) e agrega os dados.
 */
export async function gerarResumoEmendasPIX(
	nomeAutor: string,
): Promise<ResumoEmendasPIX> {
	const todasEmendas: TransferenciaEspecial[] = [];
	const MAX_PAGINAS = 5;

	for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
		const batch = await buscarEmendasPorAutor(nomeAutor, undefined, pagina);
		if (batch.length === 0) break;
		todasEmendas.push(...batch);
		if (batch.length < DEFAULT_PAGE_SIZE) break;
	}

	return agregarEmendasPIX(todasEmendas);
}
