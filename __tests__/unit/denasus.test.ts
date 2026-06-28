import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listarAtividadesAuditoria } from '../../lib/denasus/client';

describe('DENASUS Cheerio Scraper Client', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('deve parsear a estrutura HTML do gov.br (h2 com links) e extrair as atividades', async () => {
        const mockHtml = `
            <html>
                <body>
                    <div id="content-core">
                        <h2><a href="/saude/pt-br/composicao/denasus/atividades/auditoria-1234-sp">Auditoria 1234 SP - Hospital de Clinicas</a></h2>
                        <p>Atividade realizada em 15/05/2026. Constatou-se irregularidades no repasse.</p>
                        
                        <h2><a href="/saude/pt-br/composicao/denasus/atividades/verificacao-5678-rj">Verificação 5678 RJ - UPA de Copacabana</a></h2>
                        <dd>Atividade concluída em 10/04/2026. Relatório final emitido.</dd>
                    </div>
                </body>
            </html>
        `;

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => mockHtml
        });

        const atividades = await listarAtividadesAuditoria();

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('criacao-de-atividades-de-auditoria'),
            expect.any(Object)
        );

        expect(atividades).toHaveLength(2);
        
        // Primeira Atividade (Auditoria SP)
        expect(atividades[0].titulo).toBe('Auditoria 1234 SP - Hospital de Clinicas');
        expect(atividades[0].uf).toBe('SP');
        expect(atividades[0].tipo).toBe('Auditoria');
        expect(atividades[0].data).toBe('15/05/2026');
        expect(atividades[0].url_detalhe).toBe('/saude/pt-br/composicao/denasus/atividades/auditoria-1234-sp');
        expect(atividades[0].resumo).toContain('irregularidades no repasse');

        // Segunda Atividade (Verificação RJ)
        expect(atividades[1].titulo).toBe('Verificação 5678 RJ - UPA de Copacabana');
        expect(atividades[1].uf).toBe('RJ');
        expect(atividades[1].tipo).toBe('Verificação');
        expect(atividades[1].data).toBe('10/04/2026');
    });

    it('deve retornar array vazio em caso de erro HTTP na página do DENASUS', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404
        });

        const atividades = await listarAtividadesAuditoria();
        expect(atividades).toEqual([]);
    });

    it('deve lidar com falha de rede ou timeout e retornar array vazio', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

        const atividades = await listarAtividadesAuditoria();
        expect(atividades).toEqual([]);
    });
});
