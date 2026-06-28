import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarDiariosMunicipais } from '../../src/services/integrations/dou/queridodiario';

describe('Querido Diário Client', () => {

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('deve formatar corretamente os parâmetros e parsear a resposta', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                total_gazettes: 1,
                gazettes: [
                    {
                        territory_name: 'Florianópolis',
                        state_code: 'SC',
                        excerpts: ['NOMEAÇÃO de Fulano para o cargo de assessor']
                    }
                ]
            })
        });

        const res = await buscarDiariosMunicipais({ termo: 'Fulano' });
        
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('querystring=%22Fulano%22'),
            expect.any(Object)
        );
        expect(res.total_gazettes).toBe(1);
        expect(res.gazettes[0].territory_name).toBe('Florianópolis');
    });

    it('deve tratar erro HTTP sem quebrar (retornando arrays vazios)', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500
        });

        const res = await buscarDiariosMunicipais({ termo: 'Fulano' });
        expect(res.total_gazettes).toBe(0);
        expect(res.gazettes).toEqual([]);
    });
});
