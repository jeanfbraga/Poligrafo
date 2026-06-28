import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarInabilitadosTCU, buscarCadirregTCU, buscarCertidaoTCU } from '../../lib/tcu/client';
import { fetchWithTimeout } from '../../app/api/investigar/tse';

vi.mock('../../app/api/investigar/tse', () => ({
    fetchWithTimeout: vi.fn(),
}));

const mockFetch = fetchWithTimeout as any;

describe('TCU Client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('buscarInabilitadosTCU', () => {
        it('deve retornar inabilitados se a API retornar dados', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ([
                    {
                        nomeResponsavel: 'JOAO',
                        cpfResponsavel: '123456',
                        descricaoFundamento: 'Fraude',
                        dataInicioInabilitacao: '2020',
                        dataFimInabilitacao: '2025',
                        numeroDeliberacao: '123/2020'
                    }
                ])
            });

            const res = await buscarInabilitadosTCU('123456');
            expect(res.length).toBe(1);
            expect(res[0].nome).toBe('JOAO');
        });

        it('deve retornar array vazio se 404', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            const res = await buscarInabilitadosTCU('123456');
            expect(res).toEqual([]);
        });
    });

    describe('buscarCadirregTCU', () => {
        it('deve retornar cadirreg se a API retornar items', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [
                        {
                            NOME: 'MARIA',
                            CPF_CNPJ: '654321',
                            PROCESSO: '999/2021',
                            SITUACAO: 'Irregular'
                        }
                    ]
                })
            });

            const res = await buscarCadirregTCU('654321');
            expect(res.length).toBe(1);
            expect(res[0].nome).toBe('MARIA');
            expect(res[0].processo).toBe('999/2021');
        });

        it('deve retornar array vazio se 404', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            const res = await buscarCadirregTCU('654321');
            expect(res).toEqual([]);
        });
    });

    describe('buscarCertidaoTCU', () => {
        it('deve retornar certidao limpa se tudo NADA_CONSTA', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    situacaoTcu: 'NADA_CONSTA',
                    situacaoCnj: 'NADA_CONSTA',
                    situacaoCeis: 'NADA_CONSTA',
                    situacaoCnep: 'NADA_CONSTA'
                })
            });

            const res = await buscarCertidaoTCU('00000000000000');
            expect(res?.temInfracao).toBe(false);
        });

        it('deve retornar temInfracao=true se houver restrição', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    situacaoTcu: 'INIDONEO',
                    situacaoCnj: 'NADA_CONSTA',
                    situacaoCeis: 'NADA_CONSTA',
                    situacaoCnep: 'NADA_CONSTA'
                })
            });

            const res = await buscarCertidaoTCU('00000000000000');
            expect(res?.temInfracao).toBe(true);
            expect(res?.situacaoTcu).toBe('INIDONEO');
        });

        it('deve retornar null se 404', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            const res = await buscarCertidaoTCU('000000');
            expect(res).toBeNull();
        });
    });
});
