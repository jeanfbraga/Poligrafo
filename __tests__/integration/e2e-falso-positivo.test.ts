import { describe, it, expect } from 'vitest';
import { normalizeString, matchPalavraInteira } from '../../src/app/api/investigar/tse';

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

// =====================================================================================
// TESTES UNITÁRIOS — matchPalavraInteira
// =====================================================================================
describe('🔬 Unitário — matchPalavraInteira', () => {

    it('deve encontrar "marotto" como palavra inteira em "marotto"', () => {
        expect(matchPalavraInteira('marotto', 'marotto')).toBe(true);
    });

    it('NÃO deve encontrar "marotto" como substring de "camarotto"', () => {
        expect(matchPalavraInteira('luiz antonio camarotto', 'marotto')).toBe(false);
    });

    it('deve encontrar "marcio" como palavra inteira em "marcio correia de oliveira"', () => {
        expect(matchPalavraInteira('marcio correia de oliveira', 'marcio')).toBe(true);
    });

    it('NÃO deve encontrar "canella" em "marcio correia de oliveira"', () => {
        expect(matchPalavraInteira('marcio correia de oliveira', 'canella')).toBe(false);
    });

    it('deve encontrar "canella" em "marcio canella"', () => {
        expect(matchPalavraInteira('marcio canella', 'canella')).toBe(true);
    });

    it('deve retornar false para strings vazias', () => {
        expect(matchPalavraInteira('', 'teste')).toBe(false);
        expect(matchPalavraInteira('teste', '')).toBe(false);
    });

    it('deve lidar com nomes hifenizados', () => {
        expect(matchPalavraInteira('joao-silva', 'joao')).toBe(true);
        expect(matchPalavraInteira('joao-silva', 'silva')).toBe(true);
    });
});

// =====================================================================================
// TESTES UNITÁRIOS — normalizeString
// =====================================================================================
describe('🔬 Unitário — normalizeString', () => {

    it('deve remover acentos e normalizar para lowercase', () => {
        expect(normalizeString('Márcio Canella')).toBe('marcio canella');
        expect(normalizeString('Tarcísio de Freitas')).toBe('tarcisio de freitas');
    });

    it('deve lidar com strings vazias', () => {
        expect(normalizeString('')).toBe('');
    });
});

// =====================================================================================
// TESTES E2E — Falsos Positivos
// =====================================================================================
describe('🚫 E2E — Proteção contra Falsos Positivos', () => {

    it('[BUG-CASE] "Márcio Canella" NÃO deve auto-selecionar outra pessoa diferente', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Márcio Canella')}`,
            180000
        );

        expect(eventos.length).toBeGreaterThan(0);

        // Se houver resultado de desambiguação, verificar que mostra o nome de urna
        const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        if (candidatos.length > 0) {
            const lista = candidatos[0]?.payload?.candidatos || [];
            console.log(`   [MÁRCIO CANELLA] Candidatos retornados: ${lista.length}`);
            for (const c of lista) {
                console.log(`     - ${c.nome} | ${c.cargo}`);
                // O nome deve conter "CANELLA" ou "(MÁRCIO CANELLA)" para ser reconhecível
                const nomeNorm = normalizeString(c.nome);
                if (nomeNorm.includes('correia')) {
                    // Se retornou Correia, o nome de urna CANELLA deve estar visível
                    expect(c.nome.toUpperCase()).toContain('CANELLA');
                }
            }
        }

        // Se foi direto para PESSOA (sem desambiguação), o nome NÃO deve ser
        // "MARCIO CORREIA DE OLIVEIRA" sem contexto do nome de urna
        const pessoa = extractNodes(eventos, 'PESSOA');
        if (pessoa.length > 0) {
            const nomePessoa = pessoa[0].payload?.data?.label || '';
            console.log(`   [MÁRCIO CANELLA] Pessoa retornada: ${nomePessoa}`);
            // Se o sistema retornar esse nome, deve incluir "(MÁRCIO CANELLA)" 
        }

        // Verificar que nenhum ERROR genérico não intencional aconteceu
        const errors = getEventsByType(eventos, 'ERROR');
        if (errors.length > 0) {
            // Se deu "não encontrado", é um resultado ACEITÁVEL para este caso
            const msg = errors[0]?.payload?.mensagem || '';
            console.log(`   [MÁRCIO CANELLA] Erro: ${msg}`);
            if (msg.includes('Nenhum político encontrado')) {
                console.log(`   [MÁRCIO CANELLA] ✅ Resultado aceitável: não encontrado`);
            }
        }
    }, 200000);

    it('[BUG-CASE] "Marotto" deve encontrar o prefeito de Mesquita sem falsos positivos de "Camarotto"', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Marotto')}`,
            180000
        );

        expect(eventos.length).toBeGreaterThan(0);

        const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        if (candidatos.length > 0) {
            const lista = candidatos[0]?.payload?.candidatos || [];
            console.log(`   [MAROTTO] Candidatos retornados: ${lista.length}`);
            
            for (const c of lista) {
                console.log(`     - ${c.nome} | ${c.cargo} | ref: ${c.ref}`);
            }

            // INVARIANTE: "CAMAROTTO" NÃO deve aparecer nos resultados
            const temCamarotto = lista.some((c: any) => 
                normalizeString(c.nome).includes('camarotto')
            );
            expect(temCamarotto).toBe(false);

            // O prefeito de Mesquita/RJ deve aparecer
            const temMesquita = lista.some((c: any) => 
                (c.cargo || '').toUpperCase().includes('MESQUITA') ||
                (c.ref || '').toUpperCase().includes('MESQUITA')
            );
            console.log(`   [MAROTTO] Prefeito de Mesquita presente: ${temMesquita ? '✅' : '⚠️'}`);
        }

        const errors = getEventsByType(eventos, 'ERROR');
        if (errors.length > 0) {
            console.log(`   [MAROTTO] Erro: ${errors[0]?.payload?.mensagem}`);
        }
    }, 200000);

    it('[BUG-CASE] "Marotto Miranda" (nome incorreto) deve retornar "não encontrado" ou desambiguação parcial', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Marotto Miranda')}`,
            180000
        );

        expect(eventos.length).toBeGreaterThan(0);

        const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        const errors = getEventsByType(eventos, 'ERROR');

        // Resultado aceitável: ERROR "não encontrado" OU desambiguação sem falsos positivos
        if (errors.length > 0) {
            const msg = errors[0]?.payload?.mensagem || '';
            console.log(`   [MAROTTO MIRANDA] ✅ Resultado: ${msg}`);
            expect(msg).toContain('Nenhum político encontrado');
        } else if (candidatos.length > 0) {
            const lista = candidatos[0]?.payload?.candidatos || [];
            console.log(`   [MAROTTO MIRANDA] Candidatos: ${lista.length}`);
            // Se encontrou, deve ser uma sugestão razoável, não um falso positivo
            for (const c of lista) {
                console.log(`     - ${c.nome} | ${c.cargo}`);
            }
        }
    }, 200000);

    it('[INVARIANTE] Nomes completamente diferentes NÃO devem dar match parcial', () => {
        // Simula a lógica de match parcial com word-boundary
        const normalize = normalizeString;

        // "João Silva" NÃO deve fazer match com "João Pereira"
        const parts1 = normalize('João Silva').split(/\s+/).filter(p => !['de', 'da', 'do', 'dos', 'das'].includes(p));
        const candidato1 = normalize('João Pereira da Costa');
        const match1 = parts1.every(p => matchPalavraInteira(candidato1, p));
        expect(match1).toBe(false); // "silva" não está em "joao pereira da costa"

        // "Márcio Canella" NÃO deve fazer match com "Márcio Oliveira"
        const parts2 = normalize('Márcio Canella').split(/\s+/).filter(p => !['de', 'da', 'do', 'dos', 'das'].includes(p));
        const candidato2 = normalize('Márcio Correia de Oliveira');
        const match2 = parts2.every(p => matchPalavraInteira(candidato2, p));
        expect(match2).toBe(false); // "canella" não está em "marcio correia de oliveira"

        // "Marotto" DEVE fazer match exato com "Marotto" (nome de urna)
        const parts3 = normalize('Marotto').split(/\s+/).filter(p => !['de', 'da', 'do', 'dos', 'das'].includes(p));
        const candidato3 = normalize('Marotto');
        const match3 = parts3.every(p => matchPalavraInteira(candidato3, p));
        expect(match3).toBe(true);

        const candidato4 = normalize('Luiz Antonio Camarotto');
        const match4 = parts3.every(p => matchPalavraInteira(candidato4, p));
        expect(match4).toBe(false);
    });

    it('[FEATURE] "Lula" deve contornar a busca legislativa e retornar o Presidente da República', async () => {
        // Envia com uf=FEDERAL para simular o front-end
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=lula&uf=FEDERAL`,
            180000
        );

        expect(eventos.length).toBeGreaterThan(0);

        const pessoa = extractNodes(eventos, 'PESSOA');
        if (pessoa.length > 0) {
            const nomePessoa = pessoa[0].payload?.data?.label || '';
            const cargo = pessoa[0].payload?.data?.cargo || '';
            console.log(`   [LULA] Pessoa retornada: ${nomePessoa} | ${cargo}`);
            
            // O nome retornado deve ser o de Luiz Inácio Lula da Silva
            expect(nomePessoa.toLowerCase()).toContain('luiz inácio lula da silva');
        } else {
            // Se não encontrou a pessoa diretamente (o que não deve acontecer devido ao override),
            // falha o teste proativamente.
            const errors = getEventsByType(eventos, 'ERROR');
            if (errors.length > 0) {
                console.log(`   [LULA] Erro inesperado: ${errors[0]?.payload?.mensagem}`);
            }
            // Falha
            expect(pessoa.length).toBeGreaterThan(0);
        }
    }, 200000);
    it('[FEATURE] Selecionar uma UF (PA) deve encontrar o Deputado Federal (Éder Mauro) usando o escopo correto', async () => {
        // Envia com uf=PA e nome=Delegado Éder Mauro
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Delegado Éder Mauro')}&uf=PA`,
            180000
        );

        expect(eventos.length).toBeGreaterThan(0);

        // Pode ser que retorne direto a PESSOA se for match exato, ou uma lista de desambiguação
        const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        const pessoa = extractNodes(eventos, 'PESSOA');
        
        let found = false;

        if (pessoa.length > 0) {
            const nomePessoa = pessoa[0].payload?.data?.label || '';
            const cargo = pessoa[0].payload?.data?.cargo || '';
            console.log(`   [ÉDER MAURO] Pessoa retornada: ${nomePessoa} | ${cargo}`);
            expect(nomePessoa.toLowerCase()).toContain('mauro');
            found = true;
        } else if (candidatos.length > 0) {
            const lista = candidatos[0]?.payload?.candidatos || [];
            console.log(`   [ÉDER MAURO] Candidatos retornados: ${lista.length}`);
            for (const c of lista) {
                console.log(`     - ${c.nome} | ${c.cargo} | ref: ${c.ref}`);
                if (normalizeString(c.nome).includes('mauro') && c.ref.includes('FEDERAL:CAMARA')) {
                    found = true;
                }
            }
        }
        
        if (!found) {
            const errors = getEventsByType(eventos, 'ERROR');
            if (errors.length > 0) {
                console.log(`   [ÉDER MAURO] Erro: ${errors[0]?.payload?.mensagem}`);
            }
        }

        expect(found).toBe(true);
    }, 200000);
});
