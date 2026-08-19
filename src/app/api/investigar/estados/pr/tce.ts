import { fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Paraná (PR)
// Portado do ecossistema mcp-brasil
// Foco: Licitações, Contratos e Atos Municipais do Paraná
// ==========================================

const BASE_URL_PR = "https://servicos.tce.pr.gov.br/TCEPR/Tribunal/Relatorios/DadosAbertos";
const TIMEOUT_PR = 12000;

export interface ContratoTcePR {
	objeto: string;
	fornecedor: string;
	cnpj: string;
	valor: number;
	data: string;
	municipio: string;
	entidade?: string;
}

/**
 * Busca contratações municipais do Paraná via dados abertos do TCE-PR.
 */
export async function buscarContratosPR(
	municipioNome: string,
	limite = 30,
): Promise<ContratoTcePR[]> {
	if (!municipioNome || municipioNome.trim().length < 3) return [];

	const municipioFormatado = municipioNome.replace(/-/g, " ").trim();

	try {
		const url = `${BASE_URL_PR}/LicitacoesContratos?municipio=${encodeURIComponent(municipioFormatado)}&itens=${limite}`;
		const res = await fetchWithTimeout(url, { timeout: TIMEOUT_PR });

		if (!res.ok) return [];

		const json = await res.json();
		const items = Array.isArray(json) ? json : json?.dados || json?.licitacoes || [];

		return items.map((r: any) => ({
			objeto: r.objeto || r.dsc_objeto || "Contratação Municipal TCE-PR",
			fornecedor: r.fornecedor || r.nom_vencedor || r.razao_social || "FORNECEDOR NÃO INFORMADO",
			cnpj: (r.cnpj || r.num_cnpj_cpf || "").replace(/\D/g, ""),
			valor: parseFloat(r.valor || r.vlr_homologado || "0") || 0,
			data: r.data || r.dta_homologacao || "",
			municipio: municipioFormatado,
			entidade: r.entidade || r.nom_entidade || "Prefeitura Municipal",
		}));
	} catch (err: any) {
		console.warn(`[TCE-PR] Falha ao consultar contratações para ${municipioFormatado}:`, err.message);
		return [];
	}
}

/**
 * Função mestre para o motor de investigação e IA.
 */
export async function buscarDespesasPR(
	municipioNome: string,
	casa = "PREFEITURA",
): Promise<any[]> {
	console.log(`[TCE-PR] Extraindo contratações e dados de ${casa} para ${municipioNome}`);

	const contratos = await buscarContratosPR(municipioNome);

	return contratos.map((c) => ({
		tipoDespesa: `Contrato TCE-PR (${c.entidade || "Municipal"})`,
		fornecedor: c.fornecedor,
		cnpjFornecedor: c.cnpj,
		valorLiquido: c.valor,
		dataDocumento: c.data,
		descricao: `[TCE-PR] ${c.municipio}: ${c.objeto}`,
		urlDocumento: "https://www1.tce.pr.gov.br",
	}));
}
