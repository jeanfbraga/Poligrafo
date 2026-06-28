import { buscarCpfNoTSE, fetchWithTimeout } from '../../tse';
import { buscarProxyOsint } from '../../proxy_osint';

// ==========================================
// Extrator NATIVO: TCE Ceará (CE)
// ==========================================

export async function buscarMunicipalCE(nomeBuscado: string): Promise<{
    ref: string;
    id: string;
    nome: string;
    cargo: string;
    uf: string;
    isCnpj?: boolean;
    casa: "CAMARA_MUNICIPAL" | "PREFEITURA";
}[]> {
    const termo = nomeBuscado.toLowerCase().trim();
    console.log(`[>> MUNICIPAL CE ENTRY] buscarMunicipalCE chamado para: ${nomeBuscado}`);
    const resultados: any[] = [];

    // Tenta achar Vereador (13)
    let tseResult = await buscarCpfNoTSE(termo, "CE", "13");
    let tipoCargo: "CAMARA_MUNICIPAL" | "PREFEITURA" = "CAMARA_MUNICIPAL";
    let tituloCargo = "Vereador";

    if (!tseResult) {
        // Tenta achar Prefeito (11)
        tseResult = await buscarCpfNoTSE(termo, "CE", "11");
        if (tseResult) {
            tipoCargo = "PREFEITURA";
            tituloCargo = "Prefeito";
        }
    }

    if (tseResult) {
        const nomeCompleto = tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
        const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
        const nomeExibicao = (nomeUrna && nomeUrna !== nomeCompleto)
            ? `${nomeCompleto} (${nomeUrna})`
            : nomeCompleto;
        resultados.push({
            ref: `CE:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
            id: tseResult.documentoPrincipal,
            nome: nomeExibicao,
            cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, ' ').toUpperCase()}`,
            uf: "CE",
            isCnpj: tseResult.isCnpj,
            casa: tipoCargo
        });
    }

    return resultados;
}

const API_BASE = "https://dados.tce.ce.gov.br/api";
const TIMEOUT_CEARA = 15000;

let municipiosCache: Record<string, string> | null = null;

export async function buscarCodigoMunicipioCE(nomeMunicipio: string): Promise<string | null> {
    const nomeLimpo = nomeMunicipio.toLowerCase().trim();

    if (!municipiosCache) {
        try {
            const res = await fetchWithTimeout(`${API_BASE}/municipios`, { timeout: TIMEOUT_CEARA });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            
            const raw = await res.json();
            const data = raw.data?.data || raw.data || [];
            
            municipiosCache = {};
            data.forEach((m: any) => {
                if (m.nome_municipio && m.codigo_municipio) {
                    municipiosCache![m.nome_municipio.toLowerCase().trim()] = String(m.codigo_municipio);
                }
            });
        } catch (e) {
            console.warn(`[TCE-CE] Falha ao carregar lista de municípios:`, e);
            return null;
        }
    }
    return municipiosCache[nomeLimpo] || null;
}

export async function buscarContratosTceCE(codigoMunicipio: string, dataInicio: string): Promise<any[]> {
    const hoje = new Date().toISOString().split('T')[0];
    const rangeData = `${dataInicio}_${hoje}`;
    const url = `${API_BASE}/contrato?codigo_municipio=${codigoMunicipio}&data_contrato=${rangeData}&quantidade=100`;

    try {
        const res = await fetchWithTimeout(url, { timeout: TIMEOUT_CEARA });
        if (!res.ok) return [];
        const raw = await res.json();
        const items = Array.isArray(raw.data) ? raw.data : (raw.data?.data || []);

        return items.map((c: any) => ({
            id: `contrato-ce-${c.numero_contrato}`,
            numero_contrato: c.numero_contrato,
            data_contrato: c.data_contrato,
            modalidade: c.modalidade_contrato || c.tipo_contrato,
            objeto: c.descricao_objeto_contrato,
            valor: parseFloat(c.valor_total_contrato || '0'),
            inicio_vigencia: c.data_inicio_vigencia_contrato,
            fim_vigencia: c.data_fim_vigencia_contrato
        }));
    } catch (e) {
        console.warn(`[TCE-CE] Falha ao buscar contratos:`, e);
        return [];
    }
}

export async function buscarEmpenhosTceCE(codigoMunicipio: string, anoMesRef: string, codigoOrgao: string = "02"): Promise<any[]> {
    const url = `${API_BASE}/notas_empenhos?codigo_municipio=${codigoMunicipio}&data_referencia_empenho=${anoMesRef}&codigo_orgao=${codigoOrgao}&quantidade=100`;

    try {
        const res = await fetchWithTimeout(url, { timeout: TIMEOUT_CEARA });
        if (!res.ok) return [];
        const raw = await res.json();
        const items = Array.isArray(raw.data) ? raw.data : (raw.data?.data || []);

        return items.map((e: any) => ({
            id: `empenho-ce-${e.numero_empenho}`,
            numero_empenho: e.numero_empenho,
            data_emissao: e.data_emissao_empenho,
            valor: parseFloat(e.valor_empenho || '0'),
            fornecedor_nome: e.nome_negociante,
            fornecedor_cnpj: e.numero_documento_negociante,
            historico: `${e.historico1_empenho || ''} ${e.historico2_empenho || ''}`.trim()
        }));
    } catch (e) {
        console.warn(`[TCE-CE] Falha ao buscar empenhos:`, e);
        return [];
    }
}

export async function buscarDespesasMunicipalCE(identificador: string, nomeParaBusca?: string, municipioUri?: string, casa?: string): Promise<any[]> {
    if (!municipioUri) {
        console.log(`[TCE-CE] Redirecionando ${identificador} para Proxy OSINT (Faltou URI Geográfica).`);
        const payload = await buscarProxyOsint(identificador, nomeParaBusca);
        return payload.despesasFederais;
    }

    console.log(`[TCE-CE] Iniciando extração nativa para ${casa} de ${municipioUri}`);
    
    const codigoMunicipio = await buscarCodigoMunicipioCE(municipioUri.replace(/-/g, ' '));
    if (!codigoMunicipio) {
        console.warn(`[TCE-CE] Município ${municipioUri} não localizado. Caindo pro Proxy.`);
        const payload = await buscarProxyOsint(identificador, nomeParaBusca);
        return payload.despesasFederais;
    }

    const anoAtual = new Date().getFullYear();
    const dataInicioAnual = `${anoAtual}-01-01`;
    const mesAtual = new Date().getMonth() + 1;
    const anoMesRef = `${anoAtual}${mesAtual.toString().padStart(2, '0')}`;

    const orgao = casa === 'PREFEITURA' ? '02' : '01';

    const [contratos, empenhos] = await Promise.all([
        buscarContratosTceCE(codigoMunicipio, dataInicioAnual),
        buscarEmpenhosTceCE(codigoMunicipio, anoMesRef, orgao)
    ]);

    const formatados: any[] = [];

    contratos.forEach(c => {
        formatados.push({
            tipoDespesa: `Contrato: ${c.modalidade}`,
            nomeFornecedor: "MÚLTIPLOS",
            cnpjCpfFornecedor: "", 
            valorDocumento: c.valor,
            dataDocumento: c.data_contrato,
            descricao: `CONTRATO Nº ${c.numero_contrato}: ${c.objeto}. Vigência: ${c.inicio_vigencia} a ${c.fim_vigencia}`,
            urlDocumento: `https://dados.tce.ce.gov.br`
        });
    });

    empenhos.forEach(e => {
        formatados.push({
            tipoDespesa: "Nota de Empenho (TCE-CE)",
            nomeFornecedor: e.fornecedor_nome || "NÃO INFORMADO",
            cnpjCpfFornecedor: e.fornecedor_cnpj || "",
            valorDocumento: e.valor,
            dataDocumento: e.data_emissao,
            descricao: `EMPENHO Nº ${e.numero_empenho}: ${e.historico}`,
            urlDocumento: `https://dados.tce.ce.gov.br`
        });
    });

    if (formatados.length === 0) {
        console.log(`[TCE-CE] Zero despesas locais. Somando com o Proxy OSINT...`);
        const payload = await buscarProxyOsint(identificador, nomeParaBusca);
        return payload.despesasFederais;
    }

    console.log(`[TCE-CE] Extração concluída. Total de docs nativos para IA: ${formatados.length}`);
    return formatados;
}
