import { fetchWithTimeout } from "../tse";

// ==========================================
// Extrator NATIVO: TCM-SP (São Paulo - Capital)
// Portado do ecossistema mcp-brasil
// Foco: Contratos, Aditivos e Fornecedores da Capital Paulista
// ==========================================

const BASE_URL_TCM_SP = "https://www.tcm.sp.gov.br/api/public/contratos";
const TIMEOUT_TCM_SP = 12000;

export interface ContratoTcmSP {
	numeroContrato: string;
	objeto: string;
	contratado: string;
	cnpjContratado: string;
	valor: number;
	dataAssinatura?: string;
	orgao: string;
}

function fallbackTcm(val1: any, val2: any, def: string): string {
	if (val1) return String(val1);
	if (val2) return String(val2);
	return def;
}

function mapContratoTcmSP(c: any): ContratoTcmSP {
	const doc = fallbackTcm(c.cnpj, c.cnpjContratado, "").replace(/\D/g, "");
	const val = Number(c.valor || c.valorInicial) || 0;
	return {
		numeroContrato: fallbackTcm(c.numero, c.numeroContrato, "N/I"),
		objeto: fallbackTcm(c.objeto, c.descricaoObjeto, "Contratação Pública Municipal SP"),
		contratado: fallbackTcm(c.contratado, c.razaoSocial, "FORNECEDOR NÃO INFORMADO"),
		cnpjContratado: doc,
		valor: val,
		dataAssinatura: fallbackTcm(c.dataAssinatura, c.dataPublicacao, ""),
		orgao: fallbackTcm(c.orgao, c.secretaria, "Prefeitura de São Paulo"),
	};
}

/**
 * Consulta contratações fiscalizadas pelo Tribunal de Contas do Município de São Paulo (TCM-SP).
 */
export async function buscarContratosTcmSP(
	termoOuFornecedor?: string,
	limite = 30,
): Promise<ContratoTcmSP[]> {
	try {
		const query = termoOuFornecedor ? `?q=${encodeURIComponent(termoOuFornecedor)}&limit=${limite}` : `?limit=${limite}`;
		const url = `${BASE_URL_TCM_SP}${query}`;

		const res = await fetchWithTimeout(url, { timeout: TIMEOUT_TCM_SP });
		if (!res.ok) return [];

		const json = await res.json();
		const items = Array.isArray(json) ? json : json?.contratos || json?.dados || [];
		return items.map(mapContratoTcmSP);
	} catch (err: any) {
		console.warn("[TCM-SP] Erro ao consultar contratações:", err.message);
		return [];
	}
}

/**
 * Função mestre para o motor de investigação de São Paulo - Capital.
 */
export async function buscarDespesasTcmSP(
	fornecedorOuTermo?: string,
): Promise<any[]> {
	console.log(`[TCM-SP] Consultando contratações públicas de São Paulo Capital...`);

	const contratos = await buscarContratosTcmSP(fornecedorOuTermo);

	return contratos.map((c) => ({
		tipoDespesa: `Contrato TCM-SP (${c.orgao})`,
		fornecedor: c.contratado,
		cnpjFornecedor: c.cnpjContratado,
		valorLiquido: c.valor,
		dataDocumento: c.dataAssinatura,
		descricao: `[TCM-SP Contrato ${c.numeroContrato}] ${c.objeto}`,
		urlDocumento: "https://www.tcm.sp.gov.br",
	}));
}
