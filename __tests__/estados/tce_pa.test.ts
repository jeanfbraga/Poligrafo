import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarDespesasPA } from '../../app/api/investigar/estados/pa/tce';

describe('TCE-PA: Extrator de Despesas (Diário Oficial)', () => {

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('deve extrair o valor monetário de uma ementa contendo "R$ 10.000,00"', async () => {
        global.fetch = vi.fn().mockImplementation(async (url: any) => {
            if (url.includes('tipo_ato=CONTRATOS')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: [
                            {
                                id: 1234,
                                tipo_ato: "CONTRATO",
                                numeroPublicacao: "123/2026",
                                ementa: "Extrato de Contrato com a EMPRESA TESTE CNPJ 11.222.333/0001-44 no valor de R$ 15.500,50 para prestação de serviços.",
                                dataPublicacao: "2026-05-22"
                            }
                        ]
                    })
                };
            }
            return {
                ok: true,
                json: async () => ({ data: [] })
            };
        });

        // Test with the word "TESTE" which matches the ementa
        const despesas = await buscarDespesasPA("EMPRESA TESTE", "belem", "EMPRESA TESTE");

        expect(despesas).toHaveLength(1);
        expect(despesas[0].valorDocumento).toBe(15500.50);
        expect(despesas[0].nomeFornecedor).toContain('123/2026');
        expect(despesas[0].tipoDespesa).toContain('Extrato de Contrato');
        
        // Verifica se fez as duas chamadas (CONTRATOS e LICITACOES)
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('deve ignorar atos que não mencionem o alvo', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    {
                        id: 5678,
                        tipo_ato: "LICITACOES",
                        numeroPublicacao: "999",
                        ementa: "Abertura de pregão presencial para aquisição de papel.",
                        dataPublicacao: "2026-05-20"
                    }
                ]
            })
        });

        const despesas = await buscarDespesasPA("Fulano de Tal", "santarem");

        expect(despesas).toHaveLength(0);
    });
});
