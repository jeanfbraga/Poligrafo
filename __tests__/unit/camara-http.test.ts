import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exigirDeputados } from '../../scripts/etl/camara-http';
let fetchCamaraJson: typeof import('../../scripts/etl/camara-http').fetchCamaraJson;

const { curl } = vi.hoisted(() => ({ curl: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: curl }));

const url = 'https://dadosabertos.camara.leg.br/api/v2/deputados';
const payload = { dados: [{ id: 123, nome: 'Deputado' }] };

describe('Transporte dos ETLs da Câmara', () => {
    beforeEach(async () => {
        vi.resetModules();
        fetchCamaraJson = (await import('../../scripts/etl/camara-http')).fetchCamaraJson;
        vi.resetAllMocks();
        vi.stubGlobal('fetch', vi.fn());
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('usa fetch quando a API responde e dispensa curl', async () => {
        vi.mocked(fetch).mockResolvedValue(Response.json(payload));
        expect(await fetchCamaraJson(url)).toEqual(payload);
        expect(curl).not.toHaveBeenCalled();
    });

    it('recupera timeout nativo com curl e mantém HTTPS e argumentos separados', async () => {
        vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }));
        curl.mockImplementation((_file, _args, _options, callback) => callback(null, `${JSON.stringify(payload)}\n200`));
        expect(await fetchCamaraJson(url)).toEqual(payload);
        expect(curl).toHaveBeenCalledTimes(1);
        const [file, args, options] = curl.mock.calls[0];
        expect(file).toMatch(/^curl(?:\.exe)?$/);
        expect(args).toContain(url);
        expect(args).toContain('--proto-redir');
        expect(args).toContain('=https');
        expect(args).not.toContain('--insecure');
        expect(options.shell).toBeUndefined();
        expect(options.timeout).toBe(65_000);
    });

    it('repete falhas transitórias e se recupera na próxima tentativa', async () => {
        vi.useFakeTimers();
        vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }))
            .mockResolvedValueOnce(Response.json(payload));
        curl.mockImplementation((_file, _args, _options, callback) => callback(new Error('curl timeout')));
        const request = fetchCamaraJson(url, 3, 5000);
        await vi.advanceTimersByTimeAsync(5000);
        expect(await request).toEqual(payload);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('reutiliza curl após recuperar o timeout e volta a sondar fetch em cinco minutos', async () => {
        vi.useFakeTimers();
        vi.mocked(fetch).mockRejectedValueOnce(new Error('fetch failed'))
            .mockResolvedValueOnce(Response.json(payload));
        curl.mockImplementation((_file, _args, _options, callback) => callback(null, `${JSON.stringify(payload)}\n200`));
        await fetchCamaraJson(url);
        await fetchCamaraJson(`${url}/123`);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(curl).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(await fetchCamaraJson(url)).toEqual(payload);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('lança erro após esgotar ambos os transportes, sem retornar dados vazios', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('fetch failed'));
        curl.mockImplementation((_file, _args, _options, callback) => callback(new Error('curl timeout')));
        await expect(fetchCamaraJson(url, 2, 0)).rejects.toThrow('Câmara indisponível após 2 tentativas');
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(curl).toHaveBeenCalledTimes(2);
    });

    it('retorna null apenas quando o recurso realmente responde 404', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 404 }));
        expect(await fetchCamaraJson(url)).toBeNull();
        expect(curl).not.toHaveBeenCalled();
        vi.mocked(fetch).mockRejectedValueOnce(new Error('fetch failed'));
        curl.mockImplementation((_file, _args, _options, callback) => callback(null, 'não encontrado\n404'));
        expect(await fetchCamaraJson(url)).toBeNull();
    });

    it('não repete uma rejeição HTTP permanente', async () => {
        vi.mocked(fetch).mockResolvedValue(new Response('', { status: 403 }));
        await expect(fetchCamaraJson(url)).rejects.toThrow('HTTP 403');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(curl).not.toHaveBeenCalled();
    });

    it('rejeita JSON inválido ou sem dados também no fallback', async () => {
        vi.mocked(fetch).mockResolvedValue(Response.json({ mensagem: 'indisponível' }));
        curl.mockImplementation((_file, _args, _options, callback) => callback(null, '<html>manutenção</html>\n200'));
        await expect(fetchCamaraJson(url, 1)).rejects.toThrow('Câmara indisponível');
    });

    it('mantém o timeout ativo enquanto aguarda o corpo JSON', async () => {
        vi.useFakeTimers();
        vi.mocked(fetch).mockImplementation(async (_url, options) => ({
            ok: true,
            json: () => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('corpo expirou')))),
        } as Response));
        curl.mockImplementation((_file, _args, _options, callback) => callback(null, `${JSON.stringify(payload)}\n200`));
        const request = fetchCamaraJson(url);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(await request).toEqual(payload);
        expect(curl).toHaveBeenCalledTimes(1);
    });

    it('rejeita hosts e protocolos fora do endpoint oficial antes de acessar a rede', async () => {
        await expect(fetchCamaraJson('http://dadosabertos.camara.leg.br/api/v2/deputados')).rejects.toThrow('HTTPS oficial');
        await expect(fetchCamaraJson('https://example.com/api')).rejects.toThrow('HTTPS oficial');
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([null, {}, { dados: [] }, { dados: {} }])('interrompe listas de deputados indisponíveis: %j', resposta => {
        expect(() => exigirDeputados(resposta)).toThrow('antes das gravações');
    });
});
