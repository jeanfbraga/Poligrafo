import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3000';

async function consumeStream(url: string, timeoutMs = 120000): Promise<any[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error('No body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const eventos: any[] = [];
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(line.slice(6));
                        eventos.push(parsed);
                    } catch { }
                }
            }
        }
        return eventos;
    } finally {
        clearTimeout(timer);
    }
}

function getEventsByType(eventos: any[], tipo: string) {
    return eventos.filter(e => e.tipo === tipo);
}

function extractNodes(eventos: any[], nodeType?: string) {
    const nodesNovos = getEventsByType(eventos, 'NODE_NOVO');
    if (!nodeType) return nodesNovos;
    return nodesNovos.filter(n => n.payload?.type === nodeType);
}

describe('🌎 E2E — Integração TSE para Deputados Estaduais (Fora do Eixo SP/RJ)', () => {

    it('deve processar busca para "Alex Brasil" (SC) e encontrar no TSE Estadual', async () => {
        const eventos = await consumeStream(`${BASE_URL}/api/investigar?nome=Alex%20Brasil&uf=SC`);

        const erros = getEventsByType(eventos, 'ERROR');
        if (erros.length > 0) {
            console.log(`❌ Erro reportado pelo servidor: ${erros[0].payload.mensagem}`);
        }
        
        expect(erros.length).toBe(0);

        // Deve retornar candidato para desambiguação ou emitir nó pessoa direto
        const finalizouOuDesambiguou = eventos.some(e => e.tipo === 'DONE' || e.tipo === 'CANDIDATOS_ENCONTRADOS' || e.tipo === 'NODE_NOVO');
        expect(finalizouOuDesambiguou).toBe(true);

        const candEvent = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        const nodesPessoa = extractNodes(eventos, 'PESSOA');

        let pessoaEncontrada = null;

        if (candEvent.length > 0) {
            const candidatos = candEvent[0].payload.candidatos;
            pessoaEncontrada = candidatos.find((c: any) => c.nome.includes('ALEX BRASIL') && c.uf === 'SC');
            console.log(`[ALEX BRASIL SC] Candidato retornado na desambiguação: ${pessoaEncontrada?.nome} | ${pessoaEncontrada?.cargo}`);
        } else if (nodesPessoa.length > 0) {
            pessoaEncontrada = nodesPessoa.find(n => n.payload.label.includes('ALEX BRASIL') && n.payload.details?.uf === 'SC');
            console.log(`[ALEX BRASIL SC] Nó Pessoa retornado diretamente: ${pessoaEncontrada?.payload.label}`);
        }

        expect(pessoaEncontrada).toBeDefined();
        if (candEvent.length > 0) {
            expect(pessoaEncontrada.cargo).toContain('Deputado Estadual');
            expect(pessoaEncontrada.uf).toBe('SC');
        }

    }, 120000);

});
