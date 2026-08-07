import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarDespesasCamara, buscarDespesasSenado } from '../../src/app/api/investigar/etl_extractors';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

// Mocks
vi.mock('../../src/lib/supabase-admin', () => ({
    supabaseAdmin: {
        from: vi.fn()
    }
}));
global.fetch = vi.fn();

describe('ETL Extractors Cache-First Behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deve usar o cache do Supabase para despesas da Câmara (Cache Hit)', async () => {
        const mockDespesas = [
            {
                cnpj_cpf_fornecedor: "12345678901234",
                nome_fornecedor: "Empresa Falsa",
                tipo_despesa: "ALUGUEL",
                valor_documento: 5000,
                data_documento: "2024-01-01",
                url_documento: "http://example.com"
            }
        ];

        // Mock Supabase chain
        const selectMock = vi.fn().mockReturnThis();
        const eqMock = vi.fn().mockReturnThis();
        const orderMock = vi.fn().mockReturnThis();
        const limitMock = vi.fn().mockResolvedValue({ data: mockDespesas, error: null });

        (supabaseAdmin.from as any).mockReturnValue({
            select: selectMock,
            eq: eqMock,
            or: vi.fn().mockReturnThis(),
            order: orderMock,
            limit: limitMock
        });

        const sendEvent = vi.fn();
        const result = await buscarDespesasCamara(123, sendEvent);

        expect(supabaseAdmin.from).toHaveBeenCalledWith('ceap_despesas_cache');
        expect(sendEvent).toHaveBeenCalledWith('STATUS', expect.objectContaining({ msg: expect.stringContaining('[CACHE]') }));
        
        expect(result).toHaveLength(1);
        expect(result[0].cnpjCpfFornecedor).toBe("12345678901234");
        // Verifica se NÂO chamou fetch (foi direto do cache)
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('deve fazer fallback para a API quando houver Cache Miss na Câmara', async () => {
        // Mock Supabase miss (dados vazios)
        const selectMock = vi.fn().mockReturnThis();
        const eqMock = vi.fn().mockReturnThis();
        const orderMock = vi.fn().mockReturnThis();
        const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });

        (supabaseAdmin.from as any).mockReturnValue({
            select: selectMock,
            eq: eqMock,
            or: vi.fn().mockReturnThis(),
            order: orderMock,
            limit: limitMock
        });

        // Mock API success
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({
                dados: [
                    {
                        cnpjCpfFornecedor: "000",
                        nomeFornecedor: "API Fornecedor",
                        tipoDespesa: "COMBUSTIVEL",
                        valorDocumento: 100,
                        dataDocumento: "2024-02-02",
                        urlDocumento: ""
                    }
                ]
            })
        });

        const sendEvent = vi.fn();
        const result = await buscarDespesasCamara(123, sendEvent);

        expect(supabaseAdmin.from).toHaveBeenCalledWith('ceap_despesas_cache');
        expect(global.fetch).toHaveBeenCalled(); // Chamou a API
        expect(result).toHaveLength(1);
        expect(result[0].nomeFornecedor).toBe("API Fornecedor");
    });
});
