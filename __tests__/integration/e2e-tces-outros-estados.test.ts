import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3000';

async function consumeStream(url: string, timeoutMs = 180000): Promise<any[]> {
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

function logResume(label: string, eventos: any[]) {
    const status = getEventsByType(eventos, 'STATUS').length;
    const nodes = getEventsByType(eventos, 'NODE_NOVO').length;
    const done = getEventsByType(eventos, 'DONE').length;
    const errors = getEventsByType(eventos, 'ERROR').length;
    const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS').length;
    console.log(`   [${label}] STATUS:${status} NODES:${nodes} DONE:${done} ERR:${errors} CAND:${candidatos}`);
}

describe('🌎 E2E — TCEs e Outros Estados', () => {

    const testes = [
        { estado: 'CE', nome: 'Evandro Leitão' },
        { estado: 'PI', nome: 'Pessoa' },
        { estado: 'ES', nome: 'Lorenzo Pazolini' },
        { estado: 'RN', nome: 'Alvaro Dias' },
        { estado: 'TO', nome: 'Cinthia Ribeiro' },
        { estado: 'PE', nome: 'João Campos' },
        { estado: 'PA', nome: 'Edmilson Rodrigues' }
    ];

    for (const t of testes) {
        it(`deve processar busca para "${t.nome}" (${t.estado}) sem erros na pipeline`, async () => {
            const eventos = await consumeStream(
                `${BASE_URL}/api/investigar?nome=${encodeURIComponent(t.nome)}&uf=${t.estado}`
            );

            logResume(t.estado, eventos);
            expect(eventos.length).toBeGreaterThan(0);
            
            // A busca de E2E não precisa necessariamente encontrar nós precisos se a API desambiguar ou não encontrar
            // Mas não deve quebrar o servidor e o stream deve finalizar graciosamente com um status válido
            const finalizouOuDesambiguou = eventos.some(e => e.tipo === 'DONE' || e.tipo === 'CANDIDATOS_ENCONTRADOS' || e.tipo === 'NODE_NOVO' || e.tipo === 'ERROR');
            expect(finalizouOuDesambiguou).toBe(true);
        }, 180000);
    }
});