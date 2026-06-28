import { fetchWithTimeout } from '../../app/api/investigar/tse';

const TCU_DADOS_ABERTOS = 'https://dados-abertos.apps.tcu.gov.br/api';
const TCU_CONTAS_ORDS = 'https://contas.tcu.gov.br/ords';
const TCU_CERTIDOES = 'https://certidoes-apf.apps.tcu.gov.br/api/rest/publico';

export interface InabilitadoTCU {
    nome: string;
    cpf: string;
    motivo?: string;
    dataInicio?: string;
    dataFim?: string;
    deliberacao?: string;
}

export interface CadirregTCU {
    nome: string;
    cpf: string;
    processo?: string;
    situacao?: string;
}

export interface CertidaoTCU {
    cnpj: string;
    situacaoTcu: string;
    situacaoCnj: string;
    situacaoCeis: string;
    situacaoCnep: string;
    temInfracao: boolean;
}

// 1. Inabilitados: GET /condenacao/consulta/inabilitados/{cpf}
export async function buscarInabilitadosTCU(cpf: string): Promise<InabilitadoTCU[]> {
    const cpfLimpo = cpf.replace(/\D/g, '');
    try {
        const url = `${TCU_DADOS_ABERTOS}/condenacao/consulta/inabilitados/${cpfLimpo}`;
        const res = await fetchWithTimeout(url, { timeout: 6000 });
        if (!res.ok) {
            if (res.status === 404) return [];
            throw new Error(`TCU Inabilitados HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        
        return data.map((item: any) => ({
            nome: item.nomeResponsavel || '',
            cpf: item.cpfResponsavel || cpfLimpo,
            motivo: item.descricaoFundamento || '',
            dataInicio: item.dataInicioInabilitacao || '',
            dataFim: item.dataFimInabilitacao || '',
            deliberacao: item.numeroDeliberacao || ''
        }));
    } catch (e: any) {
        console.warn(`[TCU] Erro ao buscar inabilitados para ${cpfLimpo}:`, e.message || e);
        return [];
    }
}

// 2. CADIRREG: GET /recuperapessoacadirreg/{cpf}
export async function buscarCadirregTCU(cpf: string): Promise<CadirregTCU[]> {
    const cpfLimpo = cpf.replace(/\D/g, '');
    try {
        const url = `${TCU_CONTAS_ORDS}/recuperapessoacadirreg/${cpfLimpo}`;
        const res = await fetchWithTimeout(url, { timeout: 6000 });
        if (!res.ok) {
            if (res.status === 404) return [];
            throw new Error(`TCU CADIRREG HTTP ${res.status}`);
        }
        const data = await res.json();
        // A API ORDS geralmente retorna os itens dentro de 'items'
        const items = data.items || [];
        
        return items.map((item: any) => ({
            nome: item.NOME || '',
            cpf: item.CPF_CNPJ || cpfLimpo,
            processo: item.PROCESSO || '',
            situacao: item.SITUACAO || ''
        }));
    } catch (e: any) {
        console.warn(`[TCU] Erro ao buscar CADIRREG para ${cpfLimpo}:`, e.message || e);
        return [];
    }
}

// 3. Certidões APF: GET /certidoes/{cnpj}
export async function buscarCertidaoTCU(cnpj: string): Promise<CertidaoTCU | null> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    try {
        const url = `${TCU_CERTIDOES}/certidoes/${cnpjLimpo}`;
        const res = await fetchWithTimeout(url, { timeout: 6000 });
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error(`TCU Certidões HTTP ${res.status}`);
        }
        const data = await res.json();
        
        const situacaoTcu = data.situacaoTcu || 'NADA_CONSTA';
        const situacaoCnj = data.situacaoCnj || 'NADA_CONSTA';
        const situacaoCeis = data.situacaoCeis || 'NADA_CONSTA';
        const situacaoCnep = data.situacaoCnep || 'NADA_CONSTA';

        const temInfracao = situacaoTcu !== 'NADA_CONSTA' || 
                            situacaoCnj !== 'NADA_CONSTA' || 
                            situacaoCeis !== 'NADA_CONSTA' || 
                            situacaoCnep !== 'NADA_CONSTA';

        return {
            cnpj: cnpjLimpo,
            situacaoTcu,
            situacaoCnj,
            situacaoCeis,
            situacaoCnep,
            temInfracao
        };
    } catch (e: any) {
        console.warn(`[TCU] Erro ao buscar certidão para ${cnpjLimpo}:`, e.message || e);
        return null;
    }
}
