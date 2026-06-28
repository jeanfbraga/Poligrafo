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

describe('Cleber Verde Mobile Consistency', () => {
    it('deve retornar despesas e validar propriedades e consistência', async () => {
        const eventos = await consumeStream(`${BASE_URL}/api/investigar?nome=${encodeURIComponent('Cleber Verde')}`);
        
        const nodesNovos = eventos.filter(e => e.tipo === 'NODE_NOVO');
        const despesas = nodesNovos.filter(n => n.payload?.type === 'DESPESA');
        
        const despesa93k = despesas.find(d => Number(d.payload?.data?.valor || 0) === 93000 || d.payload?.data?.label?.toUpperCase()?.includes('SETE CORES'));
        
        console.log(`Encontradas ${despesas.length} despesas.`);
        if (despesa93k) {
            console.log(`Encontrou a despesa de 93 mil: `, JSON.stringify(despesa93k.payload.data));
            expect(despesa93k.payload.data.score_letalidade).toBeDefined();
        } else {
            console.warn(`Despesa de 93 mil NÃO foi encontrada no stream.`);
        }
        expect(nodesNovos.length).toBeGreaterThan(0);
    }, 180000);
});
