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

    it('deve tratar erro HTTP sem quebrar (retornando arrays vazios) e avisar no log', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500
        });

        const res = await buscarDiariosMunicipais({ termo: 'Fulano' });
        expect(res.total_gazettes).toBe(0);
        expect(res.gazettes).toEqual([]);
        expect(aviso).toHaveBeenCalledWith('[QUERIDO DIARIO] HTTP 500 ao buscar "Fulano"');
    });

    it('usa o endereço novo da API (o antigo api.queridodiario.ok.org.br não responde) e filtra pelo município', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total_gazettes: 0, gazettes: [] }) });
        await buscarDiariosMunicipais({ termo: 'Fulano', territoryIds: ['5103403'] });
        const url = new URL(String(vi.mocked(global.fetch).mock.calls[0][0]));
        expect(url.origin).toBe('https://api.queridodiario.org.br');
        expect(url.pathname).toBe('/gazettes');
        expect(url.searchParams.get('territory_ids')).toBe('5103403');
    });
});

describe('Diários Oficiais no pipe (osint-diarios)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('político municipal: busca só no município (código IBGE) e o log diz onde procurou', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total_gazettes: 0, gazettes: [] }) });
        const { investigarDiariosOficiais } = await import('../../src/app/api/investigar/scrapers/osint-diarios');
        const msgs: string[] = [];
        await investigarDiariosOficiais('Abilio Brunini', 'MT', 'p', (_t: string, p: any) => msgs.push(p.msg), [], '5103403');
        const url = new URL(String(vi.mocked(global.fetch).mock.calls[0][0]));
        expect(url.searchParams.get('territory_ids')).toBe('5103403');
        expect(msgs).toEqual([
            'Consultando Diários Oficiais via Querido Diário (no município (IBGE 5103403))...',
            '[DIÁRIOS] Nenhuma publicação com "Abilio Brunini" no município (IBGE 5103403).',
        ]);
    });

    it('sem município (federal/estadual): busca nacional', async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total_gazettes: 0, gazettes: [] }) });
        const { investigarDiariosOficiais } = await import('../../src/app/api/investigar/scrapers/osint-diarios');
        const msgs: string[] = [];
        await investigarDiariosOficiais('Fulano', 'SP', 'p', (_t: string, p: any) => msgs.push(p.msg), []);
        const url = new URL(String(vi.mocked(global.fetch).mock.calls[0][0]));
        expect(url.searchParams.has('territory_ids')).toBe(false);
        expect(msgs[0]).toBe('Consultando Diários Oficiais via Querido Diário (em todo o país)...');
    });
});
