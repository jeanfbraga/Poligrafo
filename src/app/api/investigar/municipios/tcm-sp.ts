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

		return items.map((c: any) => ({
			numeroContrato: c.numero || c.numeroContrato || "N/I",
			objeto: c.objeto || c.descricaoObjeto || "Contratação Pública Municipal SP",
			contratado: c.contratado || c.razaoSocial || "FORNECEDOR NÃO INFORMADO",
			cnpjContratado: (c.cnpj || c.cnpjContratado || "").replace(/\D/g, ""),
			valor: parseFloat(c.valor || c.valorInicial || "0") || 0,
			dataAssinatura: c.dataAssinatura || c.dataPublicacao || "",
			orgao: c.orgao || c.secretaria || "Prefeitura de São Paulo",
		}));
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
