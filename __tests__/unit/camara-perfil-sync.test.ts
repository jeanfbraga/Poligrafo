import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchJson, from } = vi.hoisted(() => ({ fetchJson: vi.fn(), from: vi.fn() }));
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }));
vi.mock('../../scripts/etl/camara-http', async importOriginal => ({
    ...await importOriginal<typeof import('../../scripts/etl/camara-http')>(),
    fetchCamaraJson: fetchJson,
}));

describe('Falhas na listagem dos ETLs de perfil e produção', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://teste.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave-teste');
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it.each(['perfil', 'producao'])('não grava nem anuncia sucesso quando %s recebe resposta nula', async tipo => {
        fetchJson.mockResolvedValue(null);
        const { run } = tipo === 'perfil'
            ? await import('../../scripts/etl/perfil-politico-sync')
            : await import('../../scripts/etl/producao-legislativa-sync');
        await expect(run()).rejects.toThrow('Lista de deputados indisponível');
        expect(from).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Finalizado com sucesso'));
    });

    it('preserva o perfil existente quando uma consulta de frentes esgota as tentativas', async () => {
        fetchJson.mockResolvedValueOnce({ dados: [{ id: 1, nome: 'Deputado' }] })
            .mockResolvedValueOnce({ dados: { nomeCivil: 'Deputado' } })
            .mockRejectedValueOnce(new Error('Câmara indisponível'));
        const { run } = await import('../../scripts/etl/perfil-politico-sync');
        await expect(run()).rejects.toThrow('Câmara indisponível');
        expect(from).not.toHaveBeenCalled();
    });

    it('sinaliza falha parcial na produção em vez de registrar zero proposições', async () => {
        fetchJson.mockResolvedValueOnce({ dados: [{ id: 1, nome: 'Deputado' }] })
            .mockRejectedValueOnce(new Error('Câmara indisponível'));
        const { run } = await import('../../scripts/etl/producao-legislativa-sync');
        await expect(run()).rejects.toThrow('1 deputados com falha');
        expect(from).not.toHaveBeenCalled();
    });

    it('interrompe quando a gravação do perfil é rejeitada pelo banco', async () => {
        fetchJson.mockResolvedValueOnce({ dados: [{ id: 1, nome: 'Deputado' }] })
            .mockResolvedValueOnce({ dados: { nomeCivil: 'Deputado' } })
            .mockResolvedValue({ dados: [] });
        from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: 'permissão negada' } }) });
        const { run } = await import('../../scripts/etl/perfil-politico-sync');
        await expect(run()).rejects.toThrow('Erro ao salvar perfil 1: permissão negada');
        expect(from).toHaveBeenCalledTimes(1);
        expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Finalizado com sucesso'));
    });
});
