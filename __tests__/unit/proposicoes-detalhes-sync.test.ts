import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn() })) }));

describe('Concorrência dos detalhes de proposições', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('processa todos os itens respeitando o limite informado', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://teste.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave-teste');
        const { processarEmLotes } = await import('../../scripts/etl/proposicoes-detalhes-sync');
        let simultaneas = 0;
        let maximo = 0;
        const concluídos: number[] = [];

        await processarEmLotes([1, 2, 3, 4, 5, 6, 7], 3, async item => {
            simultaneas++;
            maximo = Math.max(maximo, simultaneas);
            await new Promise(resolve => setTimeout(resolve, 5));
            concluídos.push(item);
            simultaneas--;
        }, 0);

        expect(maximo).toBe(3);
        expect(concluídos.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('rejeita limite de concorrência inválido', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://teste.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave-teste');
        const { processarEmLotes } = await import('../../scripts/etl/proposicoes-detalhes-sync');
        await expect(processarEmLotes([1], 0, async () => {}, 0)).rejects.toThrow('Concorrência inválida');
    });
});
