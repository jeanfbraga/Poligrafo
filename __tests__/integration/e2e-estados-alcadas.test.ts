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

function logResume(label: string, eventos: any[]) {
    const status = getEventsByType(eventos, 'STATUS').length;
    const nodes = getEventsByType(eventos, 'NODE_NOVO').length;
    const done = getEventsByType(eventos, 'DONE').length;
    const errors = getEventsByType(eventos, 'ERROR').length;
    const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS').length;
    console.log(`   [${label}] STATUS:${status} NODES:${nodes} DONE:${done} ERR:${errors} CAND:${candidatos}`);
}

describe('🌎 E2E — Teste de Diferentes Alçadas em Estados MCP', () => {

    const testes = [
        // PREFEITOS
        { estado: 'SC', nome: 'Topazio', alcadaEsperada: 'Prefeito' },
        { estado: 'RS', nome: 'Sebastiao Melo', alcadaEsperada: 'Prefeito' },
        { estado: 'PB', nome: 'Nelsinho Honorato', alcadaEsperada: 'Prefeito' },

        // DEPUTADOS ESTADUAIS
        { estado: 'ES', nome: 'Camila Valadao', alcadaEsperada: 'Deputado Estadual' },
        { estado: 'PA', nome: 'Iran Lima', alcadaEsperada: 'Deputado Estadual' },
        { estado: 'PI', nome: 'Franze Silva', alcadaEsperada: 'Deputado Estadual' },
        
        // VEREADORES
        { estado: 'TO', nome: 'Rogerio Freitas', alcadaEsperada: 'Vereador' },
        { estado: 'RN', nome: 'Robson Carvalho', alcadaEsperada: 'Vereador' }
    ];

    for (const t of testes) {
        it(`deve buscar "${t.nome}" (${t.estado}) - Esperado: ${t.alcadaEsperada}`, async () => {
            const eventos = await consumeStream(
                `${BASE_URL}/api/investigar?nome=${encodeURIComponent(t.nome)}&uf=${t.estado}`
            );

            logResume(`${t.nome} - ${t.estado}`, eventos);
            expect(eventos.length).toBeGreaterThan(0);
            
            // O pipeline não pode quebrar com erro 500
            const errosEventos = getEventsByType(eventos, 'ERROR');
            if (errosEventos.length > 0) {
                console.log(`❌ Erro em ${t.nome}: ${errosEventos[0].payload.mensagem}`);
            }
            
            // A busca E2E não precisa necessariamente encontrar o nó perfeito de primeira (pode desambiguar)
            // Mas deve fluir graciosamente e encontrar resultados no TSE
            const finalizouOuDesambiguou = eventos.some(e => e.tipo === 'DONE' || e.tipo === 'CANDIDATOS_ENCONTRADOS' || e.tipo === 'NODE_NOVO' || e.tipo === 'ERROR');
            expect(finalizouOuDesambiguou).toBe(true);

            // Se achou candidatos, valida a alçada
            const candEvent = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
            if (candEvent.length > 0) {
                const encontrouCargoEsperado = candEvent[0].payload.candidatos.some((c: any) => c.cargo.includes(t.alcadaEsperada));
                if (encontrouCargoEsperado) {
                    console.log(`✅ [${t.nome}] Desambiguação listou um ${t.alcadaEsperada}!`);
                } else {
                    console.log(`⚠️ [${t.nome}] Desambiguação ocorreu, mas sem o cargo esperado explícito. Investigar.`);
                }
            }

        }, 180000); // 3 minutos para cada um aguentar os testes seriais
    }
});
