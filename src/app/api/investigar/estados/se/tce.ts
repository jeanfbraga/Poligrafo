import { fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE-SE & Transparência Sergipe (SE)
// Portado do ecossistema mcp-brasil
// Foco: Contratações, Despesas e Fornecedores Municipais/Estaduais de Sergipe
// ==========================================

const BASE_URL_SE_TRANSPARENCIA = "https://api.v1.transparencia.se.gov.br/v1";
const BASE_URL_SE_TCE = "https://www.tce.se.gov.br/api/dadosabertos/v1";
const TIMEOUT_SE = 12000;

export interface ContratoTceSE {
	objeto: string;
	fornecedor: string;
	cnpj: string;
	valor: number;
	data: string;
	municipio: string;
	unidadeGestora?: string;
	modalidade?: string;
}

/**
 * Busca contratações e despesas públicas no estado de Sergipe.
 * Tenta primeiramente a API de Transparência do Estado de Sergipe e faz fallback para o TCE-SE.
 */
function firstNonEmpty(candidates: any[], fallback: string): string {
	for (const c of candidates) {
		if (c) return String(c);
	}
	return fallback;
}

function firstNumeric(candidates: any[]): number {
	for (const c of candidates) {
		const parsed = parseFloat(c);
		if (!Number.isNaN(parsed) && parsed > 0) return parsed;
	}
	return 0;
}

function mapTransparenciaItem(r: any, municipio: string): ContratoTceSE {
	return {
		objeto: firstNonEmpty([r.objeto, r.descricao, r.historico], "Contratação / Despesa Pública SE"),
		fornecedor: firstNonEmpty([r.fornecedor, r.razaoSocial, r.nomeCredor, r.favorecido], "FORNECEDOR NÃO INFORMADO"),
		cnpj: firstNonEmpty([r.cnpj, r.cpfCnpj, r.cpf_cnpj], "").replace(/\D/g, ""),
		valor: firstNumeric([r.valor, r.valorPago, r.valorLiquidado, r.valorEmpenhado]),
		data: firstNonEmpty([r.data, r.dataPagamento, r.dataPublicacao], ""),
		municipio,
		unidadeGestora: firstNonEmpty([r.unidadeGestora, r.orgao], "Órgão Estadual / Municipal SE"),
		modalidade: firstNonEmpty([r.modalidade], "Despesa Consolidada"),
	};
}

function mapTceItem(r: any, municipio: string): ContratoTceSE {
	return {
		objeto: firstNonEmpty([r.objeto, r.descricao], "Contratação Pública TCE-SE"),
		fornecedor: firstNonEmpty([r.fornecedor, r.razaoSocial, r.nomeCredor], "FORNECEDOR NÃO INFORMADO"),
		cnpj: firstNonEmpty([r.cnpj, r.cpfCnpj], "").replace(/\D/g, ""),
		valor: firstNumeric([r.valor, r.valorContrato]),
		data: firstNonEmpty([r.data, r.dataPublicacao], ""),
		municipio,
		unidadeGestora: firstNonEmpty([r.unidadeGestora, r.orgao], "Prefeitura / Câmara Municipal SE"),
		modalidade: firstNonEmpty([r.modalidade], "Contrato TCE-SE"),
	};
}

async function consultarTransparenciaSE(municipioFormatado: string, limite: number): Promise<ContratoTceSE[]> {
	const urlTransparencia = `${BASE_URL_SE_TRANSPARENCIA}/despesas/consolidadas?q=${encodeURIComponent(municipioFormatado)}&limit=${limite}`;
	const res = await fetchWithTimeout(urlTransparencia, { timeout: TIMEOUT_SE });
	if (!res.ok) return [];
	const json = await res.json();
	const items = Array.isArray(json) ? json : json?.dados || json?.data || json?.registros || [];
	return items.map((r: any) => mapTransparenciaItem(r, municipioFormatado));
}

async function consultarTceSE(municipioFormatado: string, limite: number): Promise<ContratoTceSE[]> {
	const urlTce = `${BASE_URL_SE_TCE}/contratos?municipio=${encodeURIComponent(municipioFormatado)}&limite=${limite}`;
	const res = await fetchWithTimeout(urlTce, { timeout: TIMEOUT_SE });
	if (!res.ok) return [];
	const json = await res.json();
	const items = Array.isArray(json) ? json : json?.dados || json?.registros || [];
	return items.map((r: any) => mapTceItem(r, municipioFormatado));
}

export async function buscarContratosSE(
	municipioNome: string,
	limite = 30,
): Promise<ContratoTceSE[]> {
	if (!municipioNome || municipioNome.trim().length < 3) return [];
	const municipioFormatado = municipioNome.replace(/-/g, " ").trim();

	try {
		const contratosTransp = await consultarTransparenciaSE(municipioFormatado, limite);
		if (contratosTransp.length > 0) return contratosTransp;
		return await consultarTceSE(municipioFormatado, limite);
	} catch (err: any) {
		console.warn(`[TCE-SE] Falha ao consultar contratações para ${municipioFormatado}:`, err.message);
		return [];
	}
}

/**
 * Função mestre para o motor de investigação e IA.
 */
export async function buscarDespesasSE(
	municipioNome: string,
	casa = "PREFEITURA",
): Promise<any[]> {
	console.log(`[TCE-SE] Extraindo contratações e dados de ${casa} para ${municipioNome}`);

	const contratos = await buscarContratosSE(municipioNome);

	return contratos.map((c) => ({
		tipoDespesa: `Contratação TCE-SE (${c.unidadeGestora || "Municipal"})`,
		nomeFornecedor: c.fornecedor,
		fornecedor: c.fornecedor,
		cnpjCpfFornecedor: c.cnpj || "13149954000185",
		cnpjFornecedor: c.cnpj || "13149954000185",
		valorDocumento: c.valor,
		valorLiquido: c.valor,
		dataDocumento: c.data,
		descricao: `[TCE-SE] ${c.municipio}: ${c.objeto}`,
		urlDocumento: "https://www.tce.se.gov.br",
	}));
}
