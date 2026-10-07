import { buscarJson } from "@/lib/fonte-http";
import { fetchWithTimeout } from "../../../app/api/investigar/tse";

const SICONFI_API_BASE = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt";

export interface EnteSiconfi {
	cod_ibge: number;
	ente: string;
	uf: string;
	esfera: string;
	populacao: number;
	cnpj: string;
}

export interface IndicadoresLRF {
	exercicio: number;
	periodo: number;
	periodicidade: string;
	receitaCorrenteLiquidaAjustada: number;
	despesaPessoalTotal: number;
	percentualDespesaPessoal: number;
	limiteMaximoPercentual: number;
	situacaoLimite: "NORMAL" | "ALERTA" | "PRUDENCIAL" | "EXCEDIDO";
}

function normalize(str: string): string {
	return str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
		.trim();
}

function paraEnte(e: any): EnteSiconfi {
	return {
		cod_ibge: Number(e.cod_ibge),
		ente: e.ente,
		uf: e.uf,
		esfera: e.esfera,
		populacao: Number(e.populacao || 0),
		cnpj: String(e.cnpj || "").replace(/\D/g, ""),
	};
}

/**
 * Todos os entes (5.570 municípios, 27 UFs, União; ~870 KB) numa consulta só,
 * com cache de 24 h. O filtro `entes?q={...}` responde 403 (bloqueio do
 * Tesouro, 07/10/2026): por isso `buscarEnteSiconfi` nunca achava o município
 * e os indicadores LRF do prefeito nunca rodavam.
 */
export async function listarEntesSiconfi(fetchFn?: typeof fetch): Promise<EnteSiconfi[]> {
	const r = await buscarJson<{ items?: any[] }>(`${SICONFI_API_BASE}/entes`, {
		fonte: "siconfi-entes",
		timeoutMs: 20_000,
		tentativas: 2,
		memoria: { ttlMs: 24 * 60 * 60 * 1000 },
		fetchFn,
	});
	if (!r.ok) {
		console.warn(`[SICONFI] Lista de entes indisponível (${r.erro}).`);
		return [];
	}
	return (r.dados?.items ?? []).map(paraEnte);
}

export async function buscarEnteSiconfi(uf: string, nomeMunicipio: string, fetchFn?: typeof fetch): Promise<EnteSiconfi | null> {
	const normBusca = normalize(nomeMunicipio);
	const entes = await listarEntesSiconfi(fetchFn);
	return entes.find((e) => e.esfera === "M" && e.uf === uf.toUpperCase() && normalize(e.ente) === normBusca) ?? null;
}

/** Município pelo código do IBGE (vem da base tse_eleitos) — sem ambiguidade de nome. */
export async function buscarEntePorIbge(codIbge: string | number, fetchFn?: typeof fetch): Promise<EnteSiconfi | null> {
	const cod = Number(codIbge);
	if (!cod) return null;
	return (await listarEntesSiconfi(fetchFn)).find((e) => e.cod_ibge === cod) ?? null;
}

/** Código IBGE das UFs: no SICONFI os estados vêm com `uf: "BR"` e o DF com esfera "D". */
export const IBGE_UF: Record<string, number> = {
	RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27,
	SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53,
};

/** O governo do estado (esfera E, ou D para o DF) pela UF. */
export async function buscarEnteEstadual(uf: string, fetchFn?: typeof fetch): Promise<EnteSiconfi | null> {
	const cod = IBGE_UF[uf.toUpperCase()];
	if (!cod) return null;
	return (await listarEntesSiconfi(fetchFn)).find((e) => (e.esfera === "E" || e.esfera === "D") && e.cod_ibge === cod) ?? null;
}

function processarItemRGF(
	item: any,
	acc: { rcl: number; dtp: number; pct: number; limiteMax: number },
) {
	const { cod_conta: codConta, coluna, valor: v } = item;
	const valor = Number(v) || 0;

	if (codConta === "ReceitaCorrenteLiquidaAjustada" && coluna === "Valor") {
		acc.rcl = valor;
		return;
	}
	if (codConta === "DespesaComPessoalTotal") {
		if (coluna === "Valor") acc.dtp = valor;
		if (coluna === "% sobre a RCL Ajustada") acc.pct = valor;
		return;
	}
	if (
		codConta === "LimiteMaximoDespesaComPessoalTotal" &&
		coluna === "% sobre a RCL Ajustada"
	) {
		acc.limiteMax = valor;
	}
}

function extrairMetricasRGF(items: any[]) {
	const acc = { rcl: 0, dtp: 0, pct: 0, limiteMax: 54 };
	for (const item of items) {
		processarItemRGF(item, acc);
	}
	if (acc.pct === 0 && acc.rcl > 0) {
		acc.pct = (acc.dtp / acc.rcl) * 100;
	}
	return acc;
}

function classificarSituacaoLimite(
	pct: number,
	limiteMax: number,
): "NORMAL" | "ALERTA" | "PRUDENCIAL" | "EXCEDIDO" {
	if (pct >= limiteMax) return "EXCEDIDO";
	if (pct >= limiteMax * 0.95) return "PRUDENCIAL";
	if (pct >= limiteMax * 0.9) return "ALERTA";
	return "NORMAL";
}

async function queryRGF(
	enteId: number,
	ano: number,
	periodo: number,
): Promise<IndicadoresLRF | null> {
	try {
		const url = `${SICONFI_API_BASE}/rgf?an_exercicio=${ano}&in_periodicidade=Q&nr_periodo=${periodo}&co_tipo_demonstrativo=RGF&co_poder=E&id_ente=${enteId}&no_anexo=RGF-Anexo%2001`;
		const res = await fetchWithTimeout(url, { timeout: 8000 });
		if (!res.ok) return null;
		const json = await res.json();
		if (!json.items?.length) return null;

		const { rcl, dtp, pct, limiteMax } = extrairMetricasRGF(json.items);
		if (rcl === 0 && dtp === 0 && pct === 0) return null;

		return {
			exercicio: ano,
			periodo,
			periodicidade: "Q",
			receitaCorrenteLiquidaAjustada: rcl,
			despesaPessoalTotal: dtp,
			percentualDespesaPessoal: Number(pct.toFixed(2)),
			limiteMaximoPercentual: limiteMax,
			situacaoLimite: classificarSituacaoLimite(pct, limiteMax),
		};
	} catch {
		return null;
	}
}

export async function consultarIndicadoresLRF(
	enteId: number,
	ano: number,
): Promise<IndicadoresLRF | null> {
	// Tenta obter o último quadrimestre disponível (3, depois 2, depois 1)
	for (const periodo of [3, 2, 1]) {
		const res = await queryRGF(enteId, ano, periodo);
		if (res) return res;
	}
	// Tenta ano anterior como fallback
	for (const periodo of [3, 2, 1]) {
		const res = await queryRGF(enteId, ano - 1, periodo);
		if (res) return res;
	}
	return null;
}
