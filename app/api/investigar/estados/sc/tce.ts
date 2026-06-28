import { fetchWithTimeout, buscarCpfNoTSE } from '../../tse';
import { buscarProxyOsint } from '../../proxy_osint';

// ==========================================
// Extrator NATIVO: TCE Santa Catarina (SC)
// Lista Municípios e Unidades Gestoras
// ==========================================

const API_UG = "https://servicos.tcesc.tc.br/endpoints-portal-transparencia/unidades-gestoras.php";
const TIMEOUT_SC = 10000;

let ugCacheSC: any[] | null = null;

export async function listarUnidadesGestorasSC(): Promise<any[]> {
    if (ugCacheSC) return ugCacheSC;

    try {
        const res = await fetchWithTimeout(API_UG, { timeout: TIMEOUT_SC });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        
        const raw = await res.json();
        // Presume que vem um array ou objeto contendo a lista
        ugCacheSC = Array.isArray(raw) ? raw : (Object.values(raw).find(v => Array.isArray(v)) || []);
        return ugCacheSC || [];
    } catch (e) {
        console.warn(`[TCE-SC] Falha ao carregar lista de UGs:`, e);
        return [];
    }
}

export async function buscarMunicipalSC(nomeBuscado: string): Promise<{
    ref: string;
    id: string;
    nome: string;
    cargo: string;
    uf: string;
    isCnpj?: boolean;
    casa: "CAMARA_MUNICIPAL" | "PREFEITURA";
}[]> {
    const termo = nomeBuscado.toLowerCase().trim();
    console.log(`[>> MUNICIPAL SC ENTRY] buscarMunicipalSC chamado para: ${nomeBuscado}`);
    const resultados: any[] = [];

    // Tenta achar Vereador (13)
    let tseResult = await buscarCpfNoTSE(termo, "SC", "13");
    let tipoCargo: "CAMARA_MUNICIPAL" | "PREFEITURA" = "CAMARA_MUNICIPAL";
    let tituloCargo = "Vereador";

    if (!tseResult) {
        // Tenta achar Prefeito (11)
        tseResult = await buscarCpfNoTSE(termo, "SC", "11");
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
            ref: `SC:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
            id: tseResult.documentoPrincipal,
            nome: nomeExibicao,
            cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, ' ').toUpperCase()}`,
            uf: "SC",
            isCnpj: tseResult.isCnpj,
            casa: tipoCargo
        });
    }

    return resultados;
}

export async function buscarDespesasMunicipalSC(identificador: string, nomeParaBusca?: string, municipioUri?: string, casa?: string): Promise<any[]> {
    console.log(`[TCE-SC] Extraindo metadados de governança (Unidades Gestoras) e somando ao Proxy OSINT para ${municipioUri || 'Desconhecido'}`);
    
    let ugsLocais: any[] = [];
    
    if (municipioUri) {
        const normalizeStr = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const municipioNome = normalizeStr(municipioUri.replace(/-/g, ' '));
        const todasUgs = await listarUnidadesGestorasSC();
        
        const ugsFiltradas = todasUgs.filter((ug: any) => 
            ug.nome_municipio && normalizeStr(ug.nome_municipio) === municipioNome
        );

        if (ugsFiltradas.length > 0) {
            ugsLocais = ugsFiltradas.map((ug: any) => ({
                cnpjCpfFornecedor: "S/N",
                nomeFornecedor: ug.sigla_unidade ? `${ug.nome_unidade} (${ug.sigla_unidade})`.trim() : ug.nome_unidade,
                tipoDespesa: "Órgão Vinculado (Governança)",
                valorDocumento: 0,
                dataDocumento: new Date().toISOString().split('T')[0],
                urlDocumento: "https://servicos.tcesc.tc.br"
            }));
            console.log(`[TCE-SC] Identificadas ${ugsLocais.length} unidades gestoras para ${municipioNome}`);
        }
    }

    const payload = await buscarProxyOsint(identificador, nomeParaBusca);
    const despesasFederais = payload.despesasFederais || [];

    return [...ugsLocais, ...despesasFederais];
}
