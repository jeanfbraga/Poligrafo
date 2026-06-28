import { fetchWithTimeout } from '../../tse';

// ==========================================
// Extrator NATIVO: TCE Espírito Santo (ES)
// Engenharia Reversa do pacote mcp-brasil
// Foco: Contratações Municipais via API CKAN
// ==========================================

const CKAN_BASE = "https://dados.es.gov.br/api/3/action/datastore_search";
const RESOURCE_CONTRATACOES_MUNICIPIOS = "bdc86561-cb94-4da9-9131-42ebe5d6c5ac";
const RESOURCE_OBRAS = "f5fb83a1-361d-4169-999b-b7d65d81689a";
const TIMEOUT_ES = 15000;

/**
 * Busca contratações municipais do ES via CKAN (dados.es.gov.br).
 * A API suporta busca textual por nome do município.
 */
export async function buscarContratacoesMunicipaisES(municipioNome: string, ano?: number): Promise<any[]> {
    const anoRef = ano || new Date().getFullYear();
    const filters = JSON.stringify({ AnoReferencia: anoRef, NomeEsferaAdministrativa: "Municipal" });
    const url = `${CKAN_BASE}?resource_id=${RESOURCE_CONTRATACOES_MUNICIPIOS}&q=${encodeURIComponent(municipioNome)}&filters=${encodeURIComponent(filters)}&limit=100`;

    try {
        const res = await fetchWithTimeout(url, { timeout: TIMEOUT_ES });
        if (!res.ok) return [];
        const raw = await res.json();
        const records = raw?.result?.records || [];

        return records.map((r: any) => ({
            objeto: r.ObjetoContratacao || r.DescricaoObjeto || "N/I",
            fornecedor: r.NomeFornecedor || r.RazaoSocialFornecedor || "N/I",
            cnpj: r.CnpjCpfFornecedor || "",
            valor: parseFloat(r.ValorContratado || r.ValorTotal || '0'),
            data: r.DataContratacao || r.DataPublicacao || "",
            unidadeGestora: r.NomeUnidadeGestora || "",
            modalidade: r.ModalidadeLicitacao || ""
        }));
    } catch (e) {
        console.warn(`[TCE-ES] Falha ao buscar contratações municipais:`, e);
        return [];
    }
}

/**
 * Busca obras públicas do ES via CKAN.
 */
export async function buscarObrasES(municipioNome: string): Promise<any[]> {
    const url = `${CKAN_BASE}?resource_id=${RESOURCE_OBRAS}&q=${encodeURIComponent(municipioNome)}&limit=50`;

    try {
        const res = await fetchWithTimeout(url, { timeout: TIMEOUT_ES });
        if (!res.ok) return [];
        const raw = await res.json();
        const records = raw?.result?.records || [];

        return records.map((r: any) => ({
            objeto: r.Objeto || r.DescricaoObjeto || "Obra Pública",
            fornecedor: r.Empresa || r.Contratado || "N/I",
            cnpj: r.CnpjEmpresa || "",
            valor: parseFloat(r.ValorContrato || r.ValorOrcado || '0'),
            situacao: r.Situacao || "N/I",
            municipio: r.Municipio || municipioNome
        }));
    } catch (e) {
        console.warn(`[TCE-ES] Falha ao buscar obras:`, e);
        return [];
    }
}

/**
 * Função principal: Reúne contratações + obras e formata para o Motor de IA.
 */
export async function buscarDespesasES(municipioNome: string, casa: string): Promise<any[]> {
    console.log(`[TCE-ES] Iniciando extração nativa para ${casa} de ${municipioNome}`);

    const nomeFormatado = municipioNome.replace(/-/g, ' ');

    const [contratacoes, obras] = await Promise.all([
        buscarContratacoesMunicipaisES(nomeFormatado),
        buscarObrasES(nomeFormatado)
    ]);

    const formatados: any[] = [];

    contratacoes.forEach(c => {
        formatados.push({
            tipoDespesa: `Contratação Municipal: ${c.modalidade}`,
            fornecedor: c.fornecedor,
            cnpjFornecedor: c.cnpj,
            valorLiquido: c.valor,
            dataDocumento: c.data,
            descricao: `CONTRATAÇÃO (${c.unidadeGestora}): ${c.objeto}`,
            urlDocumento: `https://dados.es.gov.br`
        });
    });

    obras.forEach(o => {
        formatados.push({
            tipoDespesa: `Obra Pública (${o.situacao})`,
            fornecedor: o.fornecedor,
            cnpjFornecedor: o.cnpj,
            valorLiquido: o.valor,
            dataDocumento: "",
            descricao: `OBRA em ${o.municipio}: ${o.objeto}`,
            urlDocumento: `https://dados.es.gov.br`
        });
    });

    console.log(`[TCE-ES] Extração concluída. Total de docs para IA: ${formatados.length}`);
    return formatados;
}
