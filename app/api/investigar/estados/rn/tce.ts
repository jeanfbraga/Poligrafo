import { fetchWithTimeout } from '../../tse';

// ==========================================
// Extrator NATIVO: TCE Rio Grande do Norte (RN)
// Engenharia Reversa do pacote mcp-brasil
// Foco: Licitações e Contratos com CNPJ
// ==========================================

const API_BASE = "https://apidadosabertos.tce.rn.gov.br/api";
const TIMEOUT_RN = 15000;

let jurisdicionadosCacheRN: Record<string, number> | null = null;

export async function buscarIdUnidadeRN(nomeMunicipio: string): Promise<number | null> {
    const nomeLimpo = nomeMunicipio.toLowerCase().trim();

    if (!jurisdicionadosCacheRN) {
        try {
            const res = await fetchWithTimeout(`${API_BASE}/InformacoesBasicasApi/JurisdicionadosTCE/Json`, { timeout: TIMEOUT_RN });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();
            jurisdicionadosCacheRN = {};
            (Array.isArray(data) ? data : []).forEach((j: any) => {
                if (j.nomeOrgao && j.identificadorUnidade) {
                    jurisdicionadosCacheRN![j.nomeOrgao.toLowerCase().trim()] = j.identificadorUnidade;
                }
            });
        } catch (e) {
            console.warn(`[TCE-RN] Falha ao carregar jurisdicionados:`, e);
            return null;
        }
    }

    // Tentar match direto, senão procurar substring (ex: "PREFEITURA MUNICIPAL DE NATAL")
    if (jurisdicionadosCacheRN[nomeLimpo]) return jurisdicionadosCacheRN[nomeLimpo];
    for (const [key, val] of Object.entries(jurisdicionadosCacheRN)) {
        if (key.includes(nomeLimpo) || nomeLimpo.includes(key.replace('prefeitura municipal de ', ''))) {
            return val;
        }
    }
    return null;
}

export async function buscarContratosRN(idUnidade: number): Promise<any[]> {
    const url = `${API_BASE}/ContratosApi/Contratos/Json/${idUnidade}/false`;
    try {
        const res = await fetchWithTimeout(url, { timeout: TIMEOUT_RN });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn(`[TCE-RN] Falha ao buscar contratos:`, e);
        return [];
    }
}

export async function buscarLicitacoesRN(idUnidade: number): Promise<any[]> {
    const anoAtual = new Date().getFullYear();
    const dataInicio = `${anoAtual}-01-01`;
    const dataFim = new Date().toISOString().split('T')[0];
    const url = `${API_BASE}/ProcedimentosLicitatoriosApi/LicitacaoPublica/Json/${idUnidade}/${dataInicio}/${dataFim}`;
    try {
        const res = await fetchWithTimeout(url, { timeout: TIMEOUT_RN });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn(`[TCE-RN] Falha ao buscar licitações:`, e);
        return [];
    }
}

export async function buscarDespesasRN(municipioNome: string, casa: string): Promise<any[]> {
    console.log(`[TCE-RN] Iniciando extração nativa para ${casa} de ${municipioNome}`);
    
    const idUnidade = await buscarIdUnidadeRN(municipioNome.replace(/-/g, ' '));
    if (!idUnidade) {
        console.warn(`[TCE-RN] Município ${municipioNome} não localizado nos jurisdicionados.`);
        return [];
    }

    const [contratos, licitacoes] = await Promise.all([
        buscarContratosRN(idUnidade),
        buscarLicitacoesRN(idUnidade)
    ]);

    const formatados: any[] = [];

    contratos.forEach((c: any) => {
        formatados.push({
            tipoDespesa: "Contrato (TCE-RN)",
            fornecedor: c.nomeContratado || "N/I",
            cnpjFornecedor: c.cpfcnpjContratado || "",
            valorLiquido: parseFloat(c.valorContrato || '0'),
            dataDocumento: c.dataInicioVigencia || "",
            descricao: `CONTRATO Nº ${c.numeroContrato}/${c.anoContrato}: ${c.objetoContrato || "N/I"}. Vigência: ${c.dataInicioVigencia} a ${c.dataTerminoVigencia}`,
            urlDocumento: `https://apidadosabertos.tce.rn.gov.br`
        });
    });

    licitacoes.forEach((l: any) => {
        formatados.push({
            tipoDespesa: `Licitação ${l.modalidade || ""} (TCE-RN)`,
            fornecedor: l.nomeJurisdicionado || "N/I",
            cnpjFornecedor: "",
            valorLiquido: parseFloat(l.valorTotalOrcado || '0'),
            dataDocumento: `${l.anoLicitacao || ""}`,
            descricao: `LICITAÇÃO Nº ${l.numeroLicitacao}: ${l.descricaoObjeto || "N/I"} | Tipo: ${l.tipoObjeto || "N/I"} | Situação: ${l.situacaoProcedimentoLicitacao || "N/I"}`,
            urlDocumento: `https://apidadosabertos.tce.rn.gov.br`
        });
    });

    console.log(`[TCE-RN] Extração concluída. Total de docs para IA: ${formatados.length}`);
    return formatados;
}
