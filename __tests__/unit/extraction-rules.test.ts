import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tse from '../../src/app/api/investigar/tse';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { 
    buscarDespesasCamara,
    buscarDespesasSenado,
    buscarEmendas
} from '../../src/app/api/investigar/etl_extractors';

// Mock do fetchWithTimeout para não lidar com global.fetch
vi.spyOn(tse, 'fetchWithTimeout');

// Mock do Supabase para forçar cache miss e testar a lógica da API
vi.mock('../../src/lib/supabase-admin', () => ({
    supabaseAdmin: {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: null })
    }
}));

describe('🔍 Regras de Extração e Ordenação (ETL)', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. Câmara dos Deputados (buscarDespesasCamara)', () => {
        it('deve ordenar despesas matematicamente e driblar a ordem alfabética da API', async () => {
            const mockApiResposta = {
                dados: [
                    { tipoDespesa: 'MANUTENÇÃO', valorDocumento: 992.10, dataDocumento: '2025-01-01' },
                    { tipoDespesa: 'TÁXI', valorDocumento: 950.00, dataDocumento: '2025-01-02' },
                    { tipoDespesa: 'LOCAÇÃO DE VEÍCULO', valorDocumento: 6780.06, dataDocumento: '2025-01-03' },
                    { tipoDespesa: 'CONSULTORIA', valorDocumento: 800.00, dataDocumento: '2025-01-04' },
                    { tipoDespesa: 'FRETAMENTO DE AERONAVE', valorDocumento: 15000.00, dataDocumento: '2025-01-05' }
                ]
            };

            // @ts-ignore
            tse.fetchWithTimeout.mockResolvedValueOnce({
                ok: true,
                json: async () => mockApiResposta
            });

            const resultados = await buscarDespesasCamara(220560);

            expect(resultados).toHaveLength(5);
            expect(resultados[0].valorDocumento).toBe(15000);
            expect(resultados[0].tipoDespesa).toBe('FRETAMENTO DE AERONAVE');
            expect(resultados[1].valorDocumento).toBe(6780.06);
            expect(resultados[2].valorDocumento).toBe(992.1);
            expect(resultados[4].valorDocumento).toBe(800);
        });
    });

    describe('2. Senado Federal (buscarDespesasSenado)', () => {
        it('deve extrair do CSV e ordenar matematicamente pelo valor reembolsado', async () => {
            const mockCSV = `ANO_EXERCICIO;MES_EXERCICIO;SENADOR;NOME_SENADOR;TIPO_DESPESA;CNPJ_CPF;NOME_FORNECEDOR;DATA;VALOR_REEMBOLSADO
2025;01;12345;FULANO DE TAL;TAXI;000000;UBER;10/01/2025;50,00
2025;01;12345;FULANO DE TAL;ALIMENTACAO;000000;RESTAURANTE;11/01/2025;120,55
2025;01;12345;FULANO DE TAL;FRETAMENTO;000000;TAXI AEREO;12/01/2025;85000,00
2025;01;99999;OUTRO SENADOR;ALIMENTACAO;000000;BAR;13/01/2025;10,00
2025;01;12345;FULANO DE TAL;COMBUSTIVEL;000000;POSTO;14/01/2025;300,00`;

            // @ts-ignore
            tse.fetchWithTimeout.mockResolvedValueOnce({
                ok: true,
                text: async () => mockCSV
            });

            const resultados = await buscarDespesasSenado(12345, 'FULANO DE TAL');

            expect(resultados).toHaveLength(4);
            expect(resultados[0].valorDocumento).toBe(85000); // Maior valor (Fretamento)
            expect(resultados[1].valorDocumento).toBe(300); // Combustível
            expect(resultados[2].valorDocumento).toBe(120.55); // Restaurante
            expect(resultados[3].valorDocumento).toBe(50); // Táxi
        });
    });

    describe('3. Emendas Parlamentares (buscarEmendas)', () => {
        it('deve bater nas páginas, enriquecer e ordenar pelo maior empenho', async () => {
            process.env.TRANSPARENCIA_API_KEY = 'mock_key';

            const mockPage = [
                { codigoEmenda: '1', tipoEmenda: 'Emenda Individual', valorEmpenhado: '50.000,00', valorLiquidado: '0', valorPago: '0', valorRestoInscrito: '0', valorRestoCancelado: '0', valorRestoPago: '0' },
                { codigoEmenda: '2', tipoEmenda: 'Emenda de Relator', valorEmpenhado: '1.500.000,00', valorLiquidado: '0', valorPago: '0', valorRestoInscrito: '0', valorRestoCancelado: '0', valorRestoPago: '0' },
                { codigoEmenda: '3', tipoEmenda: 'Emenda de Bancada', valorEmpenhado: '500.000,00', valorLiquidado: '0', valorPago: '0', valorRestoInscrito: '0', valorRestoCancelado: '0', valorRestoPago: '0' }
            ];

            // @ts-ignore
            tse.fetchWithTimeout.mockResolvedValueOnce({
                ok: true,
                json: async () => mockPage
            });

            const resultados = await buscarEmendas('Beltrano');

            expect(resultados.emendas).toHaveLength(3);
            
            // Ordem decrescente de valorEmpenhado
            expect(resultados.emendas[0]._empenhado).toBe(1500000); // Relator
            expect(resultados.emendas[0]._riscoTipo.nivel).toBe('CRÍTICO');
            
            expect(resultados.emendas[1]._empenhado).toBe(500000); // Bancada
            expect(resultados.emendas[2]._empenhado).toBe(50000); // Individual
        });
    });
});
