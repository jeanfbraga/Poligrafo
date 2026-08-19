import { fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE-BA & TCM-BA (Bahia)
// Portado do ecossistema mcp-brasil
// Foco: Contratos, Folha e Prestação de Contas Municipais da Bahia
// ==========================================

const BASE_URL_BA = "https://www.tcm.ba.gov.br/api/dadosabertos/v1";
const TIMEOUT_BA = 12000;

export interface ContratoTceBA {
	objeto: string;
	fornecedor: string;
	cnpj: string;
	valor: number;
	data: string;
	municipio: string;
	unidadeGestora?: string;
}

/**
 * Busca dados de contratações municipais do TCM-BA.
 */
export async function buscarContratosBA(
	municipioNome: string,
	limite = 30,
): Promise<ContratoTceBA[]> {
	if (!municipioNome || municipioNome.trim().length < 3) return [];

	const municipioFormatado = municipioNome.replace(/-/g, " ").trim();

	try {
		const url = `${BASE_URL_BA}/contratos?municipio=${encodeURIComponent(municipioFormatado)}&limite=${limite}`;
		const res = await fetchWithTimeout(url, { timeout: TIMEOUT_BA });

		if (!res.ok) return [];

		const json = await res.json();
		const items = Array.isArray(json) ? json : json?.dados || json?.registros || [];

		return items.map((r: any) => ({
			objeto: r.objeto || r.descricao || "Contratação Municipal TCM-BA",
			fornecedor: r.fornecedor || r.razaoSocial || r.nomeCredor || "FORNECEDOR NÃO INFORMADO",
			cnpj: (r.cnpj || r.cpfCnpj || "").replace(/\D/g, ""),
			valor: parseFloat(r.valor || r.valorContrato || "0") || 0,
			data: r.data || r.dataPublicacao || "",
			municipio: municipioFormatado,
			unidadeGestora: r.unidadeGestora || r.orgao || "Prefeitura / Câmara Municipal",
		}));
	} catch (err: any) {
		console.warn(`[TCM-BA] Falha ao consultar contratações para ${municipioFormatado}:`, err.message);
		return [];
	}
}

/**
 * Função mestre para o motor de investigação e IA.
 */
export async function buscarDespesasBA(
	municipioNome: string,
	casa = "PREFEITURA",
): Promise<any[]> {
	console.log(`[TCM-BA] Extraindo contratações e dados de ${casa} para ${municipioNome}`);

	const contratos = await buscarContratosBA(municipioNome);

	return contratos.map((c) => ({
		tipoDespesa: `Contratação TCM-BA (${c.unidadeGestora || "Municipal"})`,
		fornecedor: c.fornecedor,
		cnpjFornecedor: c.cnpj,
		valorLiquido: c.valor,
		dataDocumento: c.data,
		descricao: `[TCM-BA] ${c.municipio}: ${c.objeto}`,
		urlDocumento: "https://www.tcm.ba.gov.br",
	}));
}
