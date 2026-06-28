import { describe, it, expect, vi } from 'vitest';
import { fetchImageAsBase64 } from '../../lib/image-proxy';

describe('🖼️ Image Proxy Utils', () => {
    it('deve converter uma URL de imagem para base64 com sucesso usando domínio permitido', async () => {
        // Simula o fetch global
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({
                'content-type': 'image/png'
            }),
            arrayBuffer: async () => Buffer.from('fake-image-data').buffer
        });

        const allowedUrl = 'https://www.camara.leg.br/internet/deputado/bandeira/204379.jpg';
        const result = await fetchImageAsBase64(allowedUrl);
        
        expect(global.fetch).toHaveBeenCalledWith(allowedUrl, {
            headers: {
                'User-Agent': 'Poligrafo-Bot/1.0',
                'Accept': 'image/*'
            }
        });
        expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('deve lançar erro se a resposta HTTP não for ok com domínio permitido', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            statusText: 'Forbidden'
        });

        const allowedUrl = 'https://www.camara.leg.br/internet/deputado/bandeira/204379.jpg';
        await expect(fetchImageAsBase64(allowedUrl))
            .rejects
            .toThrow('Failed to fetch image: HTTP 403');
    });

    it('deve utilizar image/jpeg como fallback para o content-type com domínio permitido', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers(), // Sem content-type
            arrayBuffer: async () => Buffer.from('fake-image-data').buffer
        });

        const allowedUrl = 'https://www.camara.leg.br/internet/deputado/bandeira/204379.jpg';
        const result = await fetchImageAsBase64(allowedUrl);
        expect(result).toMatch(/^data:image\/jpeg;base64,/);
    });

    describe('🔒 SSRF Prevention & Domain Whitelist', () => {
        it('deve bloquear domínios não permitidos', async () => {
            const forbiddenUrl = 'http://fakeurl.com/image.png';
            await expect(fetchImageAsBase64(forbiddenUrl))
                .rejects
                .toThrow('Forbidden domain for proxy image: fakeurl.com');
        });

        it('deve bloquear localhost e IPs locais', async () => {
            const localhostUrl = 'http://localhost:3000/api/investigar';
            await expect(fetchImageAsBase64(localhostUrl))
                .rejects
                .toThrow('Forbidden domain for proxy image: localhost');

            const ipv4Url = 'http://127.0.0.1:3000/api/investigar';
            await expect(fetchImageAsBase64(ipv4Url))
                .rejects
                .toThrow('Forbidden domain for proxy image: 127.0.0.1');

            const metadataUrl = 'http://169.254.169.254/latest/meta-data/';
            await expect(fetchImageAsBase64(metadataUrl))
                .rejects
                .toThrow('Forbidden domain for proxy image: 169.254.169.254');
        });

        it('deve bloquear protocolos inválidos', async () => {
            const ftpUrl = 'ftp://raw.githubusercontent.com/image.png';
            await expect(fetchImageAsBase64(ftpUrl))
                .rejects
                .toThrow('Invalid protocol: ftp:');
        });
    });
});