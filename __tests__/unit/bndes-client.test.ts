import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarOperacoesBNDES } from '../../src/services/integrations/bndes/client';

// =====================================================
// BNDES CKAN Client Unit Tests
// =====================================================

describe('BNDES Client — buscarOperacoesBNDES', () => {
    beforeEach(() => {
        global.fetch = vi.fn();
        vi.restoreAllMocks();
    });

    const mockRecord = {
        cliente: 'EMPRESA TESTE LTDA',
        cnpj: '12345678000195',
        uf: 'SP',
        municipio: 'SÃO PAULO',
        valor_da_operacao_em_reais: '5000000',
        situacao_da_operacao: 'Contratada',
        data_da_contratacao: '2022-03-15',
        produto: 'BNDES Automático',
        instrumento_financeiro: 'Finem',
        setor_cnae: 'Construção Civil'
    };

    it('deve retornar operações mapeadas de ambos os resources (automáticas e não automáticas)', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                result: { records: [mockRecord] }
            })
        });

        const ops = await buscarOperacoesBNDES('12345678000195');

        // Duas chamadas (automáticas + não-automáticas)
        expect(global.fetch).toHaveBeenCalledTimes(2);

        // Ambos os datasets retornam 1 registro → 2 resultados
        expect(ops).toHaveLength(2);

        expect(ops[0]).toMatchObject({
            cliente: 'EMPRESA TESTE LTDA',
            cnpj: '12345678000195',
            uf: 'SP',
            municipio: 'SÃO PAULO',
            valor: 5000000,
            situacao: 'Contratada',
            data: '2022-03-15',
            produto: 'BNDES Automático',
            instrumento: 'Finem',
            setor: 'Construção Civil'
        });
    });

    it('deve retornar array vazio para string vazia', async () => {
        const ops = await buscarOperacoesBNDES('');
        expect(ops).toEqual([]);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('deve retornar array vazio quando a API retorna success: false', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: false, result: null })
        });

        const ops = await buscarOperacoesBNDES('12345678000195');
        expect(ops).toEqual([]);
    });

    it('deve retornar array vazio quando a API retorna HTTP 500', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500
        });

        const ops = await buscarOperacoesBNDES('12345678000195');
        expect(ops).toEqual([]);
    });

    it('deve retornar array vazio em caso de falha de rede', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        const ops = await buscarOperacoesBNDES('algumCNPJ');
        expect(ops).toEqual([]);
    });

    it('deve lidar com registros com campos alternativos (valor_contratado_reais)', async () => {
        const altRecord = {
            nome_do_cliente: 'OUTRA EMPRESA S.A.',
            cnpj_do_cliente: '98765432000100',
            uf_do_cliente: 'RJ',
            municipio_do_cliente: 'RIO DE JANEIRO',
            valor_contratado_reais: '2500000',
            situacao_do_contrato: 'Em execução',
            data_do_contrato: '2023-07-01',
            produto: 'Finame',
            instrumento_financeiro: 'Finame',
            setor_cnae: 'Indústria'
        };

        global.fetch = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, result: { records: [altRecord] } })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, result: { records: [] } })
            });

        const ops = await buscarOperacoesBNDES('OUTRA EMPRESA');
        expect(ops).toHaveLength(1);
        expect(ops[0].cliente).toBe('OUTRA EMPRESA S.A.');
        expect(ops[0].valor).toBe(2500000);
    });
});
