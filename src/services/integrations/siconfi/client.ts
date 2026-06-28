import { fetchWithTimeout } from '../../../app/api/investigar/tse';

const SICONFI_API_BASE = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt";

export interface EnteSiconfi {
    cod_ibge: number;
    ente: string;
    uf: string;
    esfera: string;
    populacao: number;
    cnpj: string;
}

export interface IndicadoresLRF {
    exercicio: number;
    periodo: number;
    periodicidade: string;
    receitaCorrenteLiquidaAjustada: number;
    despesaPessoalTotal: number;
    percentualDespesaPessoal: number;
    limiteMaximoPercentual: number;
    situacaoLimite: 'NORMAL' | 'ALERTA' | 'PRUDENCIAL' | 'EXCEDIDO';
}

function normalize(str: string): string {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .trim();
}

export async function buscarEnteSiconfi(uf: string, nomeMunicipio: string): Promise<EnteSiconfi | null> {
    try {
        const url = `${SICONFI_API_BASE}/entes?q=${encodeURIComponent(JSON.stringify({ uf: uf.toUpperCase(), esfera: "M" }))}`;
        const res = await fetchWithTimeout(url, { timeout: 6000 });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.items || !Array.isArray(json.items)) return null;

        const normBusca = normalize(nomeMunicipio);
        const match = json.items.find((e: any) => normalize(e.ente) === normBusca);
        if (match) {
            return {
                cod_ibge: Number(match.cod_ibge),
                ente: match.ente,
                uf: match.uf,
                esfera: match.esfera,
                populacao: Number(match.populacao || 0),
                cnpj: match.cnpj || ""
            };
        }
        return null;
    } catch (e: any) {
        console.warn("[SICONFI] Erro ao buscar ente:", e.message || e);
        return null;
    }
}

async function queryRGF(enteId: number, ano: number, periodo: number): Promise<IndicadoresLRF | null> {
    try {
        const url = `${SICONFI_API_BASE}/rgf?an_exercicio=${ano}&in_periodicidade=Q&nr_periodo=${periodo}&co_tipo_demonstrativo=RGF&co_poder=E&id_ente=${enteId}&no_anexo=RGF-Anexo%2001`;
        const res = await fetchWithTimeout(url, { timeout: 8000 });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.items || json.items.length === 0) return null;

        const items = json.items;

        let rcl = 0;
        let dtp = 0;
        let pct = 0;
        let limiteMax = 54; // Default LRF limit for Executive

        for (const item of items) {
            const codConta = item.cod_conta;
            const coluna = item.coluna;
            const valor = Number(item.valor || 0);

            if (codConta === 'ReceitaCorrenteLiquidaAjustada' && coluna === 'Valor') {
                rcl = valor;
            } else if (codConta === 'DespesaComPessoalTotal') {
                if (coluna === 'Valor') {
                    dtp = valor;
                } else if (coluna === '% sobre a RCL Ajustada') {
                    pct = valor;
                }
            } else if (codConta === 'LimiteMaximoDespesaComPessoalTotal' && coluna === '% sobre a RCL Ajustada') {
                limiteMax = valor;
            }
        }

        if (rcl === 0 && dtp === 0 && pct === 0) return null;

        // Se o percentual não veio preenchido, calcula
        if (pct === 0 && rcl > 0) {
            pct = (dtp / rcl) * 100;
        }

        let situacaoLimite: 'NORMAL' | 'ALERTA' | 'PRUDENCIAL' | 'EXCEDIDO' = 'NORMAL';
        const prudencial = limiteMax * 0.95;
        const alerta = limiteMax * 0.90;

        if (pct >= limiteMax) {
            situacaoLimite = 'EXCEDIDO';
        } else if (pct >= prudencial) {
            situacaoLimite = 'PRUDENCIAL';
        } else if (pct >= alerta) {
            situacaoLimite = 'ALERTA';
        }

        return {
            exercicio: ano,
            periodo,
            periodicidade: 'Q',
            receitaCorrenteLiquidaAjustada: rcl,
            despesaPessoalTotal: dtp,
            percentualDespesaPessoal: Number(pct.toFixed(2)),
            limiteMaximoPercentual: limiteMax,
            situacaoLimite
        };
    } catch {
        return null;
    }
}

export async function consultarIndicadoresLRF(enteId: number, ano: number): Promise<IndicadoresLRF | null> {
    // Tenta obter o último quadrimestre disponível (3, depois 2, depois 1)
    for (const periodo of [3, 2, 1]) {
        const res = await queryRGF(enteId, ano, periodo);
        if (res) return res;
    }
    // Tenta ano anterior como fallback
    for (const periodo of [3, 2, 1]) {
        const res = await queryRGF(enteId, ano - 1, periodo);
        if (res) return res;
    }
    return null;
}
