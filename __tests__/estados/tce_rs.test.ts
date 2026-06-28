import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarCodigoMunicipioRS, buscarDespesasMunicipalRS } from '../../src/app/api/investigar/estados/rs/tce';
import { fetchWithTimeout } from '../../src/app/api/investigar/tse';
import { buscarProxyOsint } from '../../src/app/api/investigar/proxy_osint';

// Mock dependencies
vi.mock('../../app/api/investigar/tse', () => ({
    fetchWithTimeout: vi.fn(),
    buscarCpfNoTSE: vi.fn()
}));

vi.mock('../../app/api/investigar/proxy_osint', () => ({
    buscarProxyOsint: vi.fn()
}));

describe('TCE-RS Integrations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fetch and cache municipality codes', async () => {
        const mockMunicipios = {
            municipios: [
                { NOME_MUNICIPIO: 'PORTO ALEGRE', COD_MUNICIPIO: '4314902' },
                { NOME_MUNICIPIO: 'CAXIAS DO SUL', COD_MUNICIPIO: '4305108' }
            ]
        };

        vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
            ok: true,
            json: async () => mockMunicipios
        } as unknown as Response);

        const code1 = await buscarCodigoMunicipioRS('Porto Alegre');
        expect(code1).toBe('4314902');

        const code2 = await buscarCodigoMunicipioRS('Caxias do Sul');
        expect(code2).toBe('4305108');
        
        // Verifica se usou o cache (deve ter chamado fetch apenas uma vez)
        expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it('should return OSINT data + TCE indices correctly', async () => {
        const anoAtual = new Date().getFullYear();
        const anoAlvo = anoAtual - 1;
        
        // 1. Mock código do município
        vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ municipios: [{ NOME_MUNICIPIO: 'CANOAS', COD_MUNICIPIO: '12345' }] })
        } as unknown as Response);

        // 2. Mocks dos índices do TCE-RS para os dois anos (3 chamadas por ano = 6 chamadas)
        vi.mocked(fetchWithTimeout).mockImplementation(async (url: any) => {
            if (url.includes('municipios.json')) {
                return { ok: true, json: async () => ({ municipios: [{ NOME_MUNICIPIO: 'CAXIAS DO SUL', COD_MUNICIPIO: '4305108' }] }) } as Response;
            }
            if (url.includes('educacao-indice')) {
                return { ok: true, json: async () => ([{ CD_Orgao: '4305108', NM_Orgao: 'PREFEITURA DE CAXIAS DO SUL', VL_Despesa: '5000', VL_IndiceEducacao: '26.5', VL_Receita: '20000' }]) } as Response;
            }
            if (url.includes('saude-indice')) {
                return { ok: true, json: async () => ([{ CD_Orgao: '4305108', NM_Orgao: 'PREFEITURA DE CAXIAS DO SUL', VL_Despesa: '3000', VL_IndiceSaude: '16.5', VL_Receita: '20000' }]) } as Response;
            }
            if (url.includes('gastos-lrf-mde-asps')) {
                return { ok: true, json: async () => ([{ CD_Orgao: '4305108', NM_Orgao: 'PREFEITURA DE CAXIAS DO SUL', VL_ReceitaCorrenteLiquida: '50000', VL_DespesaPessoal: '25000', VL_DividaConsolidada: '1000' }]) } as Response;
            }
            return { ok: false } as Response;
        });

        // 3. Mock Proxy Osint
        vi.mocked(buscarProxyOsint).mockResolvedValue({
            despesasFederais: [{ tipoDespesa: "Nota de Empenho", valorLiquido: 100 }]
        } as any);

        const resultados = await buscarDespesasMunicipalRS("ID", "Prefeito Caxias", "Caxias do Sul", "PREFEITURA");

        expect(resultados.length).toBeGreaterThanOrEqual(1);
        expect(resultados.some(r => r.tipoDespesa.includes("Índice de Educação (TCE-RS)"))).toBe(true);
        expect(resultados.some(r => r.tipoDespesa.includes("Índice de Saúde (TCE-RS)"))).toBe(true);
        expect(resultados.some(r => r.tipoDespesa.includes("Gestão Fiscal LRF (TCE-RS)"))).toBe(true);
        expect(resultados.some(r => r.tipoDespesa === "Nota de Empenho")).toBe(true);
        
        // Verifica se incluiu os dados do proxy
        expect(resultados.some(r => r.tipoDespesa === "Nota de Empenho")).toBe(true);
    });
});
