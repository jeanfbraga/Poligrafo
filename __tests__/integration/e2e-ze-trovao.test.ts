import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3000';

// ======================================================
// HELPER: Consome um stream SSE e retorna todos os eventos
// ======================================================
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

describe('🌩️ E2E — Deputado Federal Zé Trovão (SC)', () => {

    it('deve extrair a malha completa do Zé Trovão, cruzando Câmara, TSE e OSINT', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Zé Trovão')}&ref=FEDERAL:CAMARA:220558`,
            180000
        );

        const status = getEventsByType(eventos, 'STATUS');
        const nodes = getEventsByType(eventos, 'NODE_NOVO');
        const done = getEventsByType(eventos, 'DONE');
        const errors = getEventsByType(eventos, 'ERROR');
        
        const pessoa = extractNodes(eventos, 'PESSOA');
        const despesas = extractNodes(eventos, 'DESPESA');
        const emendas = extractNodes(eventos, 'EMENDA');
        const emendasResumo = extractNodes(eventos, 'EMENDA_RESUMO');
        const processos = extractNodes(eventos, 'PROCESSO_JUDICIAL');
        const contratos = extractNodes(eventos, 'CONTRATO');

        console.log(`\n\n=== RESUMO ZÉ TROVÃO ===`);
        console.log(`STATUS Lidos: ${status.length}`);
        status.forEach(s => console.log(`   - ${s.payload?.msg || JSON.stringify(s.payload)}`));
        console.log(`Nós Emitidos: ${nodes.length}`);
        console.log(`Finalizado (DONE): ${done.length > 0 ? 'Sim' : 'Não'}`);
        console.log(`Erros: ${errors.length}`);
        console.log(`--- ENTIDADES EXTRATADAS ---`);
        console.log(`PESSOA: ${pessoa.length} (Cargo: ${pessoa[0]?.payload?.data?.cargo || 'N/A'})`);
        console.log(`DESPESAS: ${despesas.length}`);
        console.log(`EMENDAS (Unitárias): ${emendas.length}`);
        console.log(`EMENDAS (Resumo): ${emendasResumo.length}`);
        console.log(`PROCESSOS: ${processos.length}`);
        console.log(`CONTRATOS/EMPRESAS: ${contratos.length}`);
        console.log(`===========================\n\n`);

        expect(eventos.length).toBeGreaterThan(0);
        
        // Deve encontrar a pessoa
        expect(pessoa.length).toBeGreaterThan(0);
        expect(pessoa[0].payload.data.cargo).toBe('Deputado Federal');
        expect(pessoa[0].payload.data.uf).toBe('SC'); // Ele é de SC
        
        // Como Deputado Federal, ele deve ter despesas ou emendas extraídas
        expect(despesas.length + emendas.length + emendasResumo.length).toBeGreaterThan(0);
        
    }, 200000);
});
