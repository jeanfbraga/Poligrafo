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

export async function buscarEnteSiconfi(
	uf: string,
	nomeMunicipio: string,
): Promise<EnteSiconfi | null> {
	try {
		const url = `${SICONFI_API_BASE}/entes?q=${encodeURIComponent(JSON.stringify({ uf: uf.toUpperCase(), esfera: "M" }))}`;
		const res = await fetchWithTimeout(url, { timeout: 6000 });
		if (!res.ok) return null;
		const json = await res.json();
		if (!json.items || !Array.isArray(json.items)) return null;

		const normBusca = normalize(nomeMunicipio);
		const match = json.items.find((e: any) => normalize(e.ente) === normBusca);
		if (match) {
			return {
				cod_ibge: Number(match.cod_ibge),
				ente: match.ente,
				uf: match.uf,
				esfera: match.esfera,
				populacao: Number(match.populacao || 0),
				cnpj: match.cnpj || "",
			};
		}
		return null;
	} catch (e: any) {
		console.warn("[SICONFI] Erro ao buscar ente:", e.message || e);
		return null;
	}
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
