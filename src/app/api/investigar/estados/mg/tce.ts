import { fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Minas Gerais (MG)
// Portado do ecossistema mcp-brasil
// Foco: Contratações, Empenhos e Fornecedores Municipais de MG
// ==========================================

const BASE_URL_MG = "https://dados.tce.mg.gov.br/api/3/action/datastore_search";
const TIMEOUT_MG = 12000;

export interface ContratoTceMG {
	objeto: string;
	fornecedor: string;
	cnpj: string;
	valor: number;
	data: string;
	municipio: string;
	modalidade?: string;
}

/**
 * Busca contratações e compras municipais via portal de Dados Abertos do TCE-MG.
 */
export async function buscarContratosMG(
	municipioNome: string,
	limite = 30,
): Promise<ContratoTceMG[]> {
	if (!municipioNome || municipioNome.trim().length < 3) return [];

	const municipioFormatado = municipioNome.replace(/-/g, " ").trim();

	try {
		// Busca textual pelo nome do município nos registros abertos do TCE-MG
		const url = `${BASE_URL_MG}?q=${encodeURIComponent(municipioFormatado)}&limit=${limite}`;
		const res = await fetchWithTimeout(url, { timeout: TIMEOUT_MG });

		if (!res.ok) return [];

		const json = await res.json();
		const records = json?.result?.records || [];

		return records.map((r: any) => ({
			objeto: r.objeto || r.dsc_objeto || r.DescricaoObjeto || "Contratação Pública Municipal",
			fornecedor: r.fornecedor || r.nom_fornecedor || r.NomeRazaoSocial || "FORNECEDOR NÃO INFORMADO",
			cnpj: (r.cnpj || r.num_documento || r.CpfCnpj || "").replace(/\D/g, ""),
			valor: parseFloat(r.vlr_contrato || r.valor || r.ValorContrato || "0") || 0,
			data: r.data_publicacao || r.dta_publicacao || r.DataPublicacao || "",
			municipio: municipioFormatado,
			modalidade: r.modalidade || r.nom_modalidade || "Licitação / Contrato",
		}));
	} catch (err: any) {
		console.warn(`[TCE-MG] Falha ao consultar contratações para ${municipioFormatado}:`, err.message);
		return [];
	}
}

/**
 * Função mestre para o motor de investigação e IA.
 */
export async function buscarDespesasMG(
	municipioNome: string,
	casa = "PREFEITURA",
): Promise<any[]> {
	console.log(`[TCE-MG] Extraindo contratações e dados de ${casa} para ${municipioNome}`);

	const contratos = await buscarContratosMG(municipioNome);

	return contratos.map((c) => ({
		tipoDespesa: `Contrato TCE-MG (${c.modalidade || "Municipal"})`,
		fornecedor: c.fornecedor,
		cnpjFornecedor: c.cnpj,
		valorLiquido: c.valor,
		dataDocumento: c.data,
		descricao: `[TCE-MG] ${c.municipio}: ${c.objeto}`,
		urlDocumento: "https://dados.tce.mg.gov.br",
	}));
}
