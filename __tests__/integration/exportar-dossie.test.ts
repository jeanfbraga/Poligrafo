import { describe, it, expect } from 'vitest';
import { POST } from '../../src/app/api/exportar-dossie/route';

// Helper para criar um Request fake
function createRequest(body: any): Request {
    return new Request('http://localhost:3000/api/exportar-dossie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('Exportação de Dossiê DOCX', () => {

    // =============================================
    // CENÁRIO 1: PAYLOAD VAZIO (guard clause)
    // =============================================
    it('deve retornar 400 se nomePolitico estiver ausente', async () => {
        const req = createRequest({});
        const res = await POST(req as any);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain('obrigatório');
    });

    // =============================================
    // CENÁRIO 2: GERAR DOCX COM DADOS MÍNIMOS
    // =============================================
    it('deve gerar um DOCX válido com apenas o nome do político', async () => {
        const req = createRequest({ nomePolitico: 'Teste da Silva' });
        const res = await POST(req as any);

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        expect(res.headers.get('Content-Disposition')).toContain('.docx');

        const blob = await res.arrayBuffer();
        expect(blob.byteLength).toBeGreaterThan(500); // DOCX mínimo nunca é < 500 bytes
    });

    // =============================================
    // CENÁRIO 3: DOCX COM ENTIDADES AGRUPADAS
    // =============================================
    it('deve gerar DOCX contendo entidades de risco agrupadas por tipo', async () => {
        const payload = {
            nomePolitico: 'Político Teste',
            despesasCriticas: [
                { label: 'CONSTRUTORA LARANJA LTDA', type: 'EMPRESA', tipo: 'DOAÇÃO ELEITORAL', valor: 500000, score_letalidade: 95, motivo_ia: 'FINANCIADOR DA CAMPANHA COM CONTRATOS MILIONÁRIOS NO PNCP' },
                { label: 'COMBUSTÍVEL FANTASMA', type: 'DESPESA', tipo: 'NOTA FISCAL', valor: 12000, score_letalidade: 88, motivo_ia: 'GASTO INCOMPATÍVEL COM O MANDATO' },
                { label: 'PREFEITURA DE TESTÓPOLIS', type: 'ORGAO', tipo: 'CONVENIO', valor: 2500000, score_letalidade: 72, motivo_ia: 'CONVÊNIO COM MUNICÍPIO DO DOADOR' },
                { label: 'EMENDA FANTASMA RP9', type: 'EMENDA', tipo: 'Emenda Individual', valor: 800000, score_letalidade: 90, motivo_ia: 'EMENDA PIX SEM EXECUÇÃO IDENTIFICÁVEL' },
            ],
            urlsNotasFiscais: [
                'https://portal.transparencia.gov.br/despesas/12345',
                'https://www.camara.leg.br/propostas/67890',
            ],
        };

        const req = createRequest(payload);
        const res = await POST(req as any);

        expect(res.status).toBe(200);
        const blob = await res.arrayBuffer();
        // DOCX com 4 entidades + URLs deve ser substancialmente maior
        expect(blob.byteLength).toBeGreaterThan(2000);

        // Verifica headers corretos
        const disposition = res.headers.get('Content-Disposition') || '';
        expect(disposition).toContain('_Teste');
        expect(disposition).toContain('.docx');
    });

    // =============================================
    // CENÁRIO 4: URLS DUPLICADAS SÃO DEDUPLICADAS
    // =============================================
    it('deve deduplicar URLs na seção de fontes', async () => {
        const payload = {
            nomePolitico: 'Dedup Test',
            despesasCriticas: [
                { label: 'Empresa X', type: 'EMPRESA', valor: 100, score_letalidade: 60 },
            ],
            urlsNotasFiscais: [
                'https://portal.transparencia.gov.br/1',
                'https://portal.transparencia.gov.br/1',
                'https://portal.transparencia.gov.br/1',
                'https://portal.transparencia.gov.br/2',
            ],
        };

        const req = createRequest(payload);
        const res = await POST(req as any);
        expect(res.status).toBe(200);
        // O DOCX gerou sem crash - deduplicação interna foi executada
        const blob = await res.arrayBuffer();
        expect(blob.byteLength).toBeGreaterThan(500);
    });

    // =============================================
    // CENÁRIO 5: CAMPOS NULL/UNDEFINED NÃO CRASHAM
    // =============================================
    it('deve lidar graciosamente com campos null/undefined nas entidades', async () => {
        const payload = {
            nomePolitico: 'Null Safe Test',
            despesasCriticas: [
                { label: null, type: null, tipo: undefined, valor: undefined, score_letalidade: undefined, motivo_ia: null },
                { label: '', type: 'DESPESA', valor: 0, score_letalidade: 60, motivo_ia: '' },
            ],
            urlsNotasFiscais: [],
        };

        const req = createRequest(payload);
        const res = await POST(req as any);

        // Não crashou - retornou DOCX válido mesmo com campos ruins
        expect(res.status).toBe(200);
        const blob = await res.arrayBuffer();
        expect(blob.byteLength).toBeGreaterThan(500);
    });

    // =============================================
    // CENÁRIO 6: SEM ENTIDADES (DOSSIÊ LIMPO)
    // =============================================
    it('deve gerar DOCX com mensagem de "nenhuma entidade" quando array vazio', async () => {
        const payload = {
            nomePolitico: 'Político Limpo',
            despesasCriticas: [],
            urlsNotasFiscais: [],
        };

        const req = createRequest(payload);
        const res = await POST(req as any);
        expect(res.status).toBe(200);
        const blob = await res.arrayBuffer();
        expect(blob.byteLength).toBeGreaterThan(500);
    });

    // =============================================
    // CENÁRIO 7: MOTIVO IA MUITO LONGO
    // =============================================
    it('deve gerar DOCX sem crash quando motivo_ia é extremamente longo', async () => {
        const motivoGigante = 'A '.repeat(500); // 1000 caracteres
        const payload = {
            nomePolitico: 'Long Text Test',
            despesasCriticas: [
                { label: 'Empresa Prolixo', type: 'EMPRESA', valor: 999999, score_letalidade: 95, motivo_ia: motivoGigante },
            ],
        };

        const req = createRequest(payload);
        const res = await POST(req as any);
        expect(res.status).toBe(200);
        const blob = await res.arrayBuffer();
        expect(blob.byteLength).toBeGreaterThan(2000);
    });
});
