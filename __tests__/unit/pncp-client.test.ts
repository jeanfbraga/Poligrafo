import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { fetchContratosByCNPJ } from '../../lib/pncp/client';

// O fetch global é mockado automaticamente pelo Next/Jest se usarmos window.fetch,
// mas para Node.js fetch, precisamos mockar o global.fetch
const unmockedFetch = global.fetch;

describe('PNCP Client', () => {
    beforeAll(() => {
        global.fetch = vi.fn();
    });

    afterAll(() => {
        global.fetch = unmockedFetch;
    });

    beforeEach(() => {
        (global.fetch as any).mockClear();
    });

    it('deve extrair array de contratos sob a chave "data" (formato legado)', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [{ numeroControlePNCP: '123', dataAssinatura: '2024-01-01' }]
            })
        });

        // Retorna 404 para os anos seguintes para não iterar muito
        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 404
        });

        const contratos = await fetchContratosByCNPJ('123456', 1);
        expect(contratos.length).toBe(1);
        expect(contratos[0].numeroControlePNCP).toBe('123');
    });

    it('deve extrair array de contratos sob a chave "content" (formato v0.14)', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                content: [{ numeroControlePNCP: '456', dataVigenciaInicio: '2023-01-01' }]
            })
        });

        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 404
        });

        const contratos = await fetchContratosByCNPJ('123456', 1);
        expect(contratos.length).toBe(1);
        expect(contratos[0].numeroControlePNCP).toBe('456');
    });

    it('deve ordenar os contratos por data decrescente', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [
                    { numeroControlePNCP: 'A', dataAssinatura: '2023-05-01' },
                    { numeroControlePNCP: 'B', dataVigenciaInicio: '2024-01-01' },
                    { numeroControlePNCP: 'C', dataAssinatura: '2023-12-01' }
                ]
            })
        });

        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 404
        });

        const contratos = await fetchContratosByCNPJ('123456', 1);
        expect(contratos.length).toBe(3);
        expect(contratos[0].numeroControlePNCP).toBe('B');
        expect(contratos[1].numeroControlePNCP).toBe('C');
        expect(contratos[2].numeroControlePNCP).toBe('A');
    });

    it('deve ignorar anos com 404', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 404
        });
        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 404
        });

        const contratos = await fetchContratosByCNPJ('123456', 2);
        expect(contratos.length).toBe(0);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});
