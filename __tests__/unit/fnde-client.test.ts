import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consultarPNAE, consultarFUNDEB, consultarPNATE } from '../../src/services/integrations/fnde/client';
import { fetchWithTimeout } from '../../src/app/api/investigar/tse';

vi.mock('../../app/api/investigar/tse', () => ({
    fetchWithTimeout: vi.fn(),
}));

const mockFetch = fetchWithTimeout as any;

describe('FNDE Client', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('consultarPNAE', () => {
        it('deve retornar dados do PNAE corretamente', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    value: [
                        {
                            Ano: '2024',
                            Estado: 'SP',
                            Municipio: 'SAO PAULO',
                            Total_Alunos_Atendidos: 1000,
                            Valor_Repassado: 500000
                        }
                    ]
                })
            });

            const res = await consultarPNAE('SAO PAULO', 'SP', 2024);
            expect(res.length).toBe(1);
            expect(res[0].totalAlunos).toBe(1000);
            expect(res[0].valorFnde).toBe(500000);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('PNAE_Numero_Alunos_Atendidos'),
                expect.any(Object)
            );
        });

        it('deve retornar vazio se 404', async () => {
            mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
            const res = await consultarPNAE('SAO PAULO', 'SP', 2024);
            expect(res).toEqual([]);
        });
    });

    describe('consultarFUNDEB', () => {
        it('deve retornar dados do FUNDEB', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    value: [
                        {
                            AnoCenso: 2024,
                            Uf: 'RJ',
                            MunicipioGe: 'RIO DE JANEIRO',
                            MatriculasPonderadas: 5000,
                            ValorEst: 1000000
                        }
                    ]
                })
            });

            const res = await consultarFUNDEB('RIO DE JANEIRO', 'RJ', 2024);
            expect(res.length).toBe(1);
            expect(res[0].quantidadeMatriculas).toBe(5000);
        });
    });

    describe('consultarPNATE', () => {
        it('deve retornar dados do PNATE', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    value: [
                        {
                            Uf: 'MG',
                            Municipio: 'BELO HORIZONTE',
                            AlunosAtendidos: 300
                        }
                    ]
                })
            });

            const res = await consultarPNATE('MG', 'BELO HORIZONTE');
            expect(res.length).toBe(1);
            expect(res[0].alunosAtendidos).toBe(300);
        });
    });
});
