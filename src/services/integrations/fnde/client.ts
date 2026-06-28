import { fetchWithTimeout } from '../../../app/api/investigar/tse';

const FNDE_OLINDA_BASE = "https://www.fnde.gov.br/olinda-ide/servico";
const FUNDEB_URL = `${FNDE_OLINDA_BASE}/FUNDEB_Matriculas/versao/v1/odata/FUNDEBMatriculas`;
const PNAE_URL = `${FNDE_OLINDA_BASE}/PNAE_Numero_Alunos_Atendidos/versao/v1/odata/Alunos_Atendidos`;
const PNATE_URL = `${FNDE_OLINDA_BASE}/PNATE_Alunos_Atendidos/versao/v1/odata/PNATEAlunosAtendidos`;

export interface FundebMatricula {
    ano?: number;
    uf?: string;
    municipio?: string;
    quantidadeMatriculas?: number;
    valorRepasseEstimado?: number;
}

export interface PnaeRepasse {
    ano?: string;
    estado?: string;
    municipio?: string;
    totalAlunos?: number;
    valorFnde?: number;
}

export interface PnateRepasse {
    uf?: string;
    municipio?: string;
    alunosAtendidos?: number;
}

function buildODataParams(filters: string[]): string {
    const params = new URLSearchParams();
    params.append('$format', 'json');
    params.append('$top', '100');
    if (filters.length > 0) {
        params.append('$filter', filters.join(' and '));
    }
    return params.toString();
}

// PNAE — Alimentação escolar (merenda): quanto o município recebe
export async function consultarPNAE(municipio: string, uf: string, ano?: number): Promise<PnaeRepasse[]> {
    try {
        const filters = [];
        if (ano) filters.push(`Ano eq '${ano}'`);
        if (uf) filters.push(`Estado eq '${uf.toUpperCase()}'`);
        if (municipio) filters.push(`contains(Municipio,'${municipio.toUpperCase()}')`);

        const url = `${PNAE_URL}?${buildODataParams(filters)}`;
        const res = await fetchWithTimeout(url, { timeout: 6000 });
        if (!res.ok) return [];
        const data = await res.json();
        const items = data.value || [];
        
        return items.map((item: any) => ({
            ano: item.Ano,
            estado: item.Estado,
            municipio: item.Municipio,
            totalAlunos: item.Total_Alunos_Atendidos,
            valorFnde: item.Valor_Repassado
        }));
    } catch (e: any) {
        console.warn(`[FNDE] Erro PNAE para ${municipio}/${uf}:`, e.message || e);
        return [];
    }
}

// FUNDEB — Matrículas ponderadas
export async function consultarFUNDEB(municipio: string, uf: string, ano?: number): Promise<FundebMatricula[]> {
    try {
        const filters = [];
        if (ano) filters.push(`AnoCenso eq ${ano}`);
        if (uf) filters.push(`Uf eq '${uf.toUpperCase()}'`);
        if (municipio) filters.push(`contains(MunicipioGe,'${municipio.toUpperCase()}')`);

        const url = `${FUNDEB_URL}?${buildODataParams(filters)}`;
        const res = await fetchWithTimeout(url, { timeout: 6000 });
        if (!res.ok) return [];
        const data = await res.json();
        const items = data.value || [];
        
        return items.map((item: any) => ({
            ano: item.AnoCenso,
            uf: item.Uf,
            municipio: item.MunicipioGe,
            quantidadeMatriculas: item.MatriculasPonderadas,
            valorRepasseEstimado: item.ValorEst
        }));
    } catch (e: any) {
        console.warn(`[FNDE] Erro FUNDEB para ${municipio}/${uf}:`, e.message || e);
        return [];
    }
}

// PNATE — Transporte escolar
export async function consultarPNATE(uf: string, municipio?: string): Promise<PnateRepasse[]> {
    try {
        const filters = [];
        if (uf) filters.push(`Uf eq '${uf.toUpperCase()}'`);
        if (municipio) filters.push(`contains(Municipio,'${municipio.toUpperCase()}')`);

        const url = `${PNATE_URL}?${buildODataParams(filters)}`;
        const res = await fetchWithTimeout(url, { timeout: 6000 });
        if (!res.ok) return [];
        const data = await res.json();
        const items = data.value || [];
        
        return items.map((item: any) => ({
            uf: item.Uf,
            municipio: item.Municipio,
            alunosAtendidos: item.AlunosAtendidos
        }));
    } catch (e: any) {
        console.warn(`[FNDE] Erro PNATE para ${municipio}/${uf}:`, e.message || e);
        return [];
    }
}
