import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchJson } = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn() })) }));
vi.mock('../../scripts/etl/camara-http', async importOriginal => ({
    ...await importOriginal<typeof import('../../scripts/etl/camara-http')>(),
    fetchCamaraJson: fetchJson,
}));

const pagina = (ids: number[], next?: string) => ({
    dados: ids.map(id => ({ id })),
    links: next ? [{ rel: 'next', href: next }] : [],
});

describe('buscarProposicoesDoDeputado (produção legislativa)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_PERFIL_URL', 'https://perfil-teste.supabase.co');
        vi.stubEnv('SUPABASE_PERFIL_SERVICE_ROLE_KEY', 'chave-perfil-teste');
    });
    afterEach(() => vi.unstubAllEnvs());

    it('segue o link "next" em vez de parar nas 100 primeiras', async () => {
        const cem = Array.from({ length: 100 }, (_, i) => i + 1);
        fetchJson
            .mockResolvedValueOnce(pagina(cem, 'https://api/p2'))
            .mockResolvedValueOnce(pagina([101, 102, 103, 104, 105]));
        const { buscarProposicoesDoDeputado } = await import('../../scripts/etl/producao-legislativa-sync');
        const todas = await buscarProposicoesDoDeputado(74044, 2026);
        expect(todas).toHaveLength(105);
        expect(fetchJson).toHaveBeenCalledTimes(2);
        expect(fetchJson.mock.calls[0][0]).toContain('idDeputadoAutor=74044&ano=2023&ano=2024&ano=2025&ano=2026');
        expect(fetchJson.mock.calls[1][0]).toBe('https://api/p2');
    });

    it('para quando a página não tem próximo', async () => {
        fetchJson.mockResolvedValueOnce(pagina([1, 2]));
        const { buscarProposicoesDoDeputado } = await import('../../scripts/etl/producao-legislativa-sync');
        expect(await buscarProposicoesDoDeputado(1, 2026)).toHaveLength(2);
        expect(fetchJson).toHaveBeenCalledTimes(1);
    });
});
