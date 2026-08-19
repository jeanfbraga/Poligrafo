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
export async function buscarContratosSE(
	municipioNome: string,
	limite = 30,
): Promise<ContratoTceSE[]> {
	if (!municipioNome || municipioNome.trim().length < 3) return [];

	const municipioFormatado = municipioNome.replace(/-/g, " ").trim();

	try {
		// 1. Consulta à API de Transparência de Sergipe (despesas e contratos consolidados)
		const urlTransparencia = `${BASE_URL_SE_TRANSPARENCIA}/despesas/consolidadas?q=${encodeURIComponent(municipioFormatado)}&limit=${limite}`;
		const resTransparencia = await fetchWithTimeout(urlTransparencia, { timeout: TIMEOUT_SE });

		if (resTransparencia.ok) {
			const json = await resTransparencia.json();
			const items = Array.isArray(json) ? json : json?.dados || json?.data || json?.registros || [];

			if (items.length > 0) {
				return items.map((r: any) => ({
					objeto: r.objeto || r.descricao || r.historico || "Contratação / Despesa Pública SE",
					fornecedor: r.fornecedor || r.razaoSocial || r.nomeCredor || r.favorecido || "FORNECEDOR NÃO INFORMADO",
					cnpj: (r.cnpj || r.cpfCnpj || r.cpf_cnpj || "").replace(/\D/g, ""),
					valor: parseFloat(r.valor || r.valorPago || r.valorLiquidado || r.valorEmpenhado || "0") || 0,
					data: r.data || r.dataPagamento || r.dataPublicacao || "",
					municipio: municipioFormatado,
					unidadeGestora: r.unidadeGestora || r.orgao || "Órgão Estadual / Municipal SE",
					modalidade: r.modalidade || "Despesa Consolidada",
				}));
			}
		}

		// 2. Fallback: API de Dados Abertos do TCE-SE / SAGRES
		const urlTce = `${BASE_URL_SE_TCE}/contratos?municipio=${encodeURIComponent(municipioFormatado)}&limite=${limite}`;
		const resTce = await fetchWithTimeout(urlTce, { timeout: TIMEOUT_SE });

		if (resTce.ok) {
			const jsonTce = await resTce.json();
			const itemsTce = Array.isArray(jsonTce) ? jsonTce : jsonTce?.dados || jsonTce?.registros || [];

			return itemsTce.map((r: any) => ({
				objeto: r.objeto || r.descricao || "Contratação Pública TCE-SE",
				fornecedor: r.fornecedor || r.razaoSocial || r.nomeCredor || "FORNECEDOR NÃO INFORMADO",
				cnpj: (r.cnpj || r.cpfCnpj || "").replace(/\D/g, ""),
				valor: parseFloat(r.valor || r.valorContrato || "0") || 0,
				data: r.data || r.dataPublicacao || "",
				municipio: municipioFormatado,
				unidadeGestora: r.unidadeGestora || r.orgao || "Prefeitura / Câmara Municipal SE",
				modalidade: r.modalidade || "Contrato TCE-SE",
			}));
		}

		return [];
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
		fornecedor: c.fornecedor,
		cnpjFornecedor: c.cnpj,
		valorLiquido: c.valor,
		dataDocumento: c.data,
		descricao: `[TCE-SE] ${c.municipio}: ${c.objeto}`,
		urlDocumento: "https://www.tce.se.gov.br",
	}));
}
