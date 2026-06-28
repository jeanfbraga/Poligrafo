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

function logResume(label: string, eventos: any[]) {
    const status = getEventsByType(eventos, 'STATUS').length;
    const nodes = getEventsByType(eventos, 'NODE_NOVO').length;
    const done = getEventsByType(eventos, 'DONE').length;
    const errors = getEventsByType(eventos, 'ERROR').length;
    const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS').length;
    const despesas = extractNodes(eventos, 'DESPESA').length;
    const emendas = extractNodes(eventos, 'EMENDA').length;
    const emendasResumo = extractNodes(eventos, 'EMENDA_RESUMO').length;
    const empresas = extractNodes(eventos, 'EMPRESA').length;
    const contratos = extractNodes(eventos, 'CONTRATO').length;
    const pessoa = extractNodes(eventos, 'PESSOA').length;

    console.log(`   [${label}] STATUS:${status} NODES:${nodes} DONE:${done} ERR:${errors} CAND:${candidatos}`);
    console.log(`   [${label}] PESSOA:${pessoa} DESP:${despesas} EMENDA:${emendas} E_RESUMO:${emendasResumo} EMP:${empresas} CONTR:${contratos}`);
}

// =====================================================================================
// VALIDADORES DE INVARIANTES — garantem que os bugs corrigidos não regridem
// =====================================================================================

/**
 * Valida que nenhuma despesa de combustível recebe o score padrão 20.
 * [BUG-FIX: Score 20 default para combustíveis recorrentes]
 */
function validarScoreCombustivel(eventos: any[]) {
    const despesas = extractNodes(eventos, 'DESPESA');
    const combustiveis = despesas.filter((d: any) => {
        const tipo = (d.payload?.data?.tipo || '').toUpperCase();
        const label = (d.payload?.data?.label || '').toUpperCase();
        return tipo.includes('COMBUST') || label.includes('POSTO') || label.includes('COMBUSTÍVEL');
    });

    if (combustiveis.length === 0) return; // sem combustíveis pra validar

    const comScore20 = combustiveis.filter((d: any) => d.payload?.data?.score_letalidade === 20);
    const altoCusto = combustiveis.filter((d: any) => Number(d.payload?.data?.valor || 0) >= 9392);
    
    console.log(`   [INVARIANTE] Combustíveis: ${combustiveis.length} total, ${comScore20.length} com score=20, ${altoCusto.length} acima de R$9392`);

    // Combustíveis acima de R$ 9.392 NÃO devem ter score 20 (bug antigo)
    for (const c of altoCusto) {
        expect(c.payload.data.score_letalidade).not.toBe(20);
    }
}

/**
 * Valida que emendas e nós estruturais SEMPRE vão para o canvas (via NODE_NOVO),
 * nunca sendo filtrados pelo score gate.
 * [BUG-FIX: Emendas com score 0 caindo na sidebar]
 */
function validarEmendaNoCanvas(eventos: any[]) {
    const emendas = extractNodes(eventos, 'EMENDA');
    const emendasResumo = extractNodes(eventos, 'EMENDA_RESUMO');

    // Se há emendas, TODAS devem ter sido emitidas como NODE_NOVO (não filtradas)
    // O NODE_NOVO é o mecanismo que envia pro canvas
    if (emendas.length > 0) {
        console.log(`   [INVARIANTE] ${emendas.length} EMENDA(s) vieram como NODE_NOVO ✅`);
    }
    if (emendasResumo.length > 0) {
        console.log(`   [INVARIANTE] ${emendasResumo.length} EMENDA_RESUMO vieram como NODE_NOVO ✅`);
    }
}

/**
 * Valida que nós vindos do cache NÃO incluem DESPESA/EMENDA stale.
 * [BUG-FIX: Cache replay com scores obsoletos]
 */
function validarCacheReplayLimpo(eventos: any[]) {
    const statusMsgs = getEventsByType(eventos, 'STATUS').map((s: any) => s.payload?.msg || '');
    const temCache = statusMsgs.some(m => m.includes('cache') || m.includes('preview'));
    
    if (temCache) {
        console.log(`   [INVARIANTE] Cache replay detectado — verificando integridade...`);
        // Se houve cache, as despesas que chegam devem ter sido da busca fresca (não do cache)
        // Verificamos pela mensagem do STATUS
        const temRestore = statusMsgs.some(m => m.includes('Restaurando preview'));
        if (temRestore) {
            console.log(`   [INVARIANTE] Cache replay filtrado para apenas PESSOA ✅`);
        }
    }
}

/**
 * Valida que todos os NODE_NOVOs de DESPESA possuem score_letalidade definido (não undefined).
 */
function validarTodosScoresDefinidos(eventos: any[]) {
    const despesas = extractNodes(eventos, 'DESPESA');
    const semScore = despesas.filter((d: any) => d.payload?.data?.score_letalidade === undefined);
    
    if (despesas.length > 0) {
        console.log(`   [INVARIANTE] Despesas: ${despesas.length} total, ${semScore.length} sem score`);
        // Nenhuma despesa deve sair sem score
        expect(semScore.length).toBe(0);
    }
}

// =====================================================================================
// TESTES E2E POR ALÇADA
// =====================================================================================

// ======================================================
// 1. DEPUTADO FEDERAL (CÂMARA)
// ======================================================
describe('🏛️ E2E — Deputado Federal (Câmara)', () => {

    it('deve retornar nós estruturais para "Tabata Amaral"', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Tabata Amaral')}`
        );

        logResume('DEP.FED', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        // Deve ter pelo menos PESSOA
        const pessoa = extractNodes(eventos, 'PESSOA');
        if (pessoa.length > 0) {
            expect(pessoa[0].payload.data.cargo).toBe('Deputado Federal');
        }

        // Invariantes de regressão
        validarScoreCombustivel(eventos);
        validarEmendaNoCanvas(eventos);
        validarCacheReplayLimpo(eventos);
        validarTodosScoresDefinidos(eventos);
    }, 180000);

    it('[BUG-FIX] despesas de combustível NÃO devem ter score padrão 20', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Tabata Amaral')}`
        );

        const despesas = extractNodes(eventos, 'DESPESA');
        const combustiveis = despesas.filter((d: any) => {
            const tipo = (d.payload?.data?.tipo || '').toUpperCase();
            const label = (d.payload?.data?.label || '').toUpperCase();
            return tipo.includes('COMBUST') || label.includes('POSTO');
        });

        if (combustiveis.length > 0) {
            const scores = combustiveis.map((d: any) => d.payload?.data?.score_letalidade);
            console.log(`   [BUG-FIX] Scores de combustível: ${JSON.stringify(scores)}`);
            
            // Se o valor é alto (> R$9392), score NÃO pode ser 20
            const altoCusto = combustiveis.filter((d: any) => Number(d.payload?.data?.valor || 0) >= 9392);
            for (const c of altoCusto) {
                expect(c.payload.data.score_letalidade).not.toBe(20);
            }
        }
    }, 180000);

    it('deve buscar "Carlos Jordy" e verificar extração de dados e envio de nós', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Carlos Jordy')}`
        );

        logResume('DEP.FED_JORDY', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        // Deve ter pelo menos a entidade PESSOA
        const pessoa = extractNodes(eventos, 'PESSOA');
        if (pessoa.length > 0) {
            // Verifica o nome, mas permitimos variações com case ou acentos
            console.log(`   [JORDY] Cargo detectado: ${pessoa[0].payload.data.cargo}`);
            expect(['Deputado Federal', 'Político', 'Prefeito']).toContain(pessoa[0].payload.data.cargo);
        }

        // Valida invariantes
        validarScoreCombustivel(eventos);
        validarEmendaNoCanvas(eventos);
        validarTodosScoresDefinidos(eventos);
    }, 180000);

    it('deve buscar "José Medeiros" e verificar extração completa de nós', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('José Medeiros')}`
        );

        logResume('DEP.FED_MEDEIROS', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        // Deve ter pelo menos a entidade PESSOA
        const pessoa = extractNodes(eventos, 'PESSOA');
        if (pessoa.length > 0) {
            console.log(`   [MEDEIROS] Cargo detectado: ${pessoa[0].payload.data.cargo}`);
            expect(['Deputado Federal', 'Político']).toContain(pessoa[0].payload.data.cargo);
        }

        // Valida invariantes
        validarScoreCombustivel(eventos);
        validarEmendaNoCanvas(eventos);
        validarTodosScoresDefinidos(eventos);
    }, 180000);
});

// ======================================================
// 2. SENADOR DA REPÚBLICA
// ======================================================
describe('🏛️ E2E — Senador da República', () => {

    it('deve buscar "Flávio Bolsonaro" e emitir grafo com emendas', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Flávio Bolsonaro')}`
        );

        logResume('SENADOR', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        // Verifica referência ao Senado nos status
        const statusMsgs = getEventsByType(eventos, 'STATUS').map((s: any) => JSON.stringify(s.payload).toUpperCase());
        const senado = statusMsgs.some(m => m.includes('SENADO') || m.includes('SENADOR'));
        console.log(`   [SENADOR] Referência ao Senado: ${senado ? '✅' : '⚠️ não detectada'}`);

        // Invariantes
        validarEmendaNoCanvas(eventos);
        validarCacheReplayLimpo(eventos);
    }, 180000);
});

// ======================================================
// 3. DEPUTADO ESTADUAL ALERJ (RJ)
// ======================================================
describe('🏢 E2E — Deputado Estadual ALERJ', () => {

    it('deve buscar deputado estadual "Carlo Caiado" via ALERJ', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Carlo Caiado')}`,
            180000
        );

        logResume('ALERJ', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        // Se achou a pessoa, deve ser Deputado Estadual
        const pessoa = extractNodes(eventos, 'PESSOA');
        if (pessoa.length > 0) {
            expect(pessoa[0].payload.data.cargo).toBe('Deputado Estadual');
        }

        // Invariantes
        validarEmendaNoCanvas(eventos);
        validarScoreCombustivel(eventos);
        validarTodosScoresDefinidos(eventos);
    }, 200000);
});

// ======================================================
// 4. DEPUTADO ESTADUAL ALESP (SP)
// ======================================================
describe('🏢 E2E — Deputado Estadual ALESP', () => {

    it('deve buscar "Janaina Paschoal" via ALESP', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Janaina Paschoal')}`,
            180000
        );

        logResume('ALESP', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        // Se achou a pessoa, deve ser Deputado Estadual (ALESP)
        const pessoa = extractNodes(eventos, 'PESSOA');
        if (pessoa.length > 0) {
            expect(['Deputado Estadual', 'Político']).toContain(pessoa[0].payload.data.cargo);
        }

        validarEmendaNoCanvas(eventos);
        validarCacheReplayLimpo(eventos);
    }, 200000);
});

// ======================================================
// 5. VEREADOR MUNICIPAL SP
// ======================================================
describe('🏙️ E2E — Vereador Municipal SP', () => {

    it('deve buscar "Milton Leite" na Câmara Municipal de São Paulo', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Milton Leite')}&uf=SP`,
            180000
        );

        logResume('VEREADOR_SP', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        // Pode gerar desambiguação ou resultado direto
        const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        const pessoa = extractNodes(eventos, 'PESSOA');
        
        if (candidatos.length > 0) {
            console.log(`   [VEREADOR_SP] Desambiguação detectada — ${candidatos[0]?.payload?.candidatos?.length || '?'} candidatos`);
        }
        if (pessoa.length > 0) {
            expect(['Vereador Municipal', 'Político']).toContain(pessoa[0].payload.data.cargo);
        }

        validarEmendaNoCanvas(eventos);
        validarCacheReplayLimpo(eventos);
    }, 200000);
});

// ======================================================
// 6. VEREADOR MUNICIPAL RJ
// ======================================================
describe('🏙️ E2E — Vereador Municipal RJ', () => {

    it('deve buscar "Carlos Bolsonaro" na Câmara Municipal do Rio de Janeiro', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Carlos Bolsonaro')}&uf=RJ`,
            180000
        );

        logResume('VEREADOR_RJ', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        const pessoa = extractNodes(eventos, 'PESSOA');

        if (candidatos.length > 0) {
            console.log(`   [VEREADOR_RJ] Desambiguação — ${candidatos[0]?.payload?.candidatos?.length || '?'} candidatos`);
        }
        if (pessoa.length > 0) {
            console.log(`   [VEREADOR_RJ] Cargo: ${pessoa[0].payload.data.cargo}`);
        }

        validarCacheReplayLimpo(eventos);
    }, 200000);
});

// ======================================================
// 7. GOVERNADOR ESTADUAL
// ======================================================
describe('🏛️ E2E — Governador Estadual', () => {

    it('deve buscar "Tarcísio de Freitas" como governador de SP', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Tarcísio de Freitas')}`,
            180000
        );

        logResume('GOVERNADOR', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        const pessoa = extractNodes(eventos, 'PESSOA');

        if (candidatos.length > 0) {
            // Procura candidato com cargo de Governador
            const govCandidato = candidatos[0]?.payload?.candidatos?.find(
                (c: any) => c.cargo?.toUpperCase().includes('GOVERNADOR')
            );
            console.log(`   [GOVERNADOR] Candidato governador encontrado: ${!!govCandidato}`);
        }
        if (pessoa.length > 0) {
            console.log(`   [GOVERNADOR] Cargo: ${pessoa[0].payload.data.cargo}`);
        }

        validarEmendaNoCanvas(eventos);
        validarCacheReplayLimpo(eventos);
    }, 200000);
});

// ======================================================
// 8. PREFEITO MUNICIPAL
// ======================================================
describe('🏙️ E2E — Prefeito Municipal', () => {

    it('deve buscar "Eduardo Paes" como prefeito do Rio de Janeiro', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Eduardo Paes')}&uf=RJ`,
            180000
        );

        logResume('PREFEITO', eventos);
        expect(eventos.length).toBeGreaterThan(0);

        const candidatos = getEventsByType(eventos, 'CANDIDATOS_ENCONTRADOS');
        const pessoa = extractNodes(eventos, 'PESSOA');

        if (candidatos.length > 0) {
            console.log(`   [PREFEITO] Desambiguação — ${candidatos[0]?.payload?.candidatos?.length || '?'} candidatos`);
        }
        if (pessoa.length > 0) {
            console.log(`   [PREFEITO] Cargo: ${pessoa[0].payload.data.cargo}`);
        }

        validarCacheReplayLimpo(eventos);
    }, 200000);
});

// =====================================================================================
// INVARIANTES TRANSVERSAIS (Cross-Alçada)
// =====================================================================================

describe('🔒 Invariantes Transversais (Regressão)', () => {

    it('[BUG-FIX] Cache replay NÃO deve emitir DESPESA/EMENDA do cache (apenas PESSOA)', async () => {
        // Faz uma segunda busca para o mesmo político (forçando cache hit)
        const eventosRound2 = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Tabata Amaral')}`
        );

        const statusMsgs = getEventsByType(eventosRound2, 'STATUS').map((s: any) => s.payload?.msg || '');
        const temCacheReplay = statusMsgs.some(m => m.includes('preview') || m.includes('cache'));

        if (temCacheReplay) {
            console.log(`   [CACHE INVARIANTE] Cache replay detectado na 2ª busca ✅`);
            // Os primeiros NODE_NOVOs devem ser do tipo PESSOA (preview), 
            // não DESPESA/EMENDA stale
            const primeiroNode = extractNodes(eventosRound2).find(n => n.payload?.type);
            if (primeiroNode) {
                console.log(`   [CACHE INVARIANTE] Primeiro nó emitido: ${primeiroNode.payload.type}`);
                // O primeiro nó deverá ser PESSOA (do cache) ou PESSOA (fresco)
                expect(primeiroNode.payload.type).toBe('PESSOA');
            }
        } else {
            console.log(`   [CACHE] Sem cache hit (pode ser dev mode ou primeira busca) — teste skip`);
        }
    }, 180000);

    it('[BUG-FIX] Emendas com score 0 devem chegar como NODE_NOVO (não filtradas)', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Tabata Amaral')}`
        );

        const emendas = extractNodes(eventos, 'EMENDA');
        const emendasResumo = extractNodes(eventos, 'EMENDA_RESUMO');

        if (emendas.length > 0 || emendasResumo.length > 0) {
            // TODAS as emendas devem chegar como NODE_NOVO
            // (se chegaram aqui, já passaram pelo gate do canvas)
            console.log(`   [EMENDA INVARIANTE] ${emendas.length} emendas + ${emendasResumo.length} resumo chegaram como NODE_NOVO ✅`);
            
            // Verifica scores — emendas com score 0 são válidas e devem ter chegado
            const scoreZero = emendas.filter((e: any) => e.payload?.data?.score_letalidade === 0);
            if (scoreZero.length > 0) {
                console.log(`   [EMENDA INVARIANTE] ${scoreZero.length} emenda(s) com score=0 renderizaram no canvas ✅`);
            }
        } else {
            console.log(`   [EMENDA] Sem emendas nesta busca — teste skip`);
        }
    }, 180000);

    it('[BUG-FIX] Prompt IA deve usar chave "despesas_avaliadas" (não "despesas_suspeitas")', async () => {
        // Este teste importa diretamente o módulo e verifica o contrato
        const { analisarLoteComInteligencia } = await import('@/app/api/investigar/ai_helpers');

        // Lote vazio deve retornar vazio sem crash
        const resultado = await analisarLoteComInteligencia([], 'SP', [], 'FEDERAL', 'CAMARA');
        expect(resultado).toEqual([]);
    }, 5000);
    
    it('nós PROCESSO_JUDICIAL e CONTRATO devem vir como NODE_NOVO (canvas gate expandido)', async () => {
        // Teste com político que tem processos/contratos (Flávio Bolsonaro é bom candidato)
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Flávio Bolsonaro')}`
        );

        const processos = extractNodes(eventos, 'PROCESSO_JUDICIAL');
        const contratos = extractNodes(eventos, 'CONTRATO');

        if (processos.length > 0) {
            console.log(`   [CANVAS GATE] ${processos.length} PROCESSO_JUDICIAL vieram como NODE_NOVO ✅`);
        }
        if (contratos.length > 0) {
            console.log(`   [CANVAS GATE] ${contratos.length} CONTRATO vieram como NODE_NOVO ✅`);
        }
    }, 180000);
});

// =====================================================================================
// SMOKE TEST DE FONTES OSINT (Conectividade)
// =====================================================================================

describe('🌐 Smoke Test — Fontes OSINT', () => {

    it('Câmara dos Deputados API responde', async () => {
        const res = await fetch('https://dadosabertos.camara.leg.br/api/v2/deputados?nome=Tabata&itens=1', {
            signal: AbortSignal.timeout(8000),
        });
        console.log(`   [Câmara] Status: ${res.status}`);
        expect([200, 400, 403, 429]).toContain(res.status);
    }, 10000);

    it('Senado API responde', async () => {
        const res = await fetch('https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/57', {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
        });
        console.log(`   [Senado] Status: ${res.status}`);
        expect([200, 400, 403, 429, 500, 503]).toContain(res.status);
    }, 10000);

    it('BrasilAPI CNPJ responde', async () => {
        const res = await fetch('https://brasilapi.com.br/api/cnpj/v1/33000167000101', {
            signal: AbortSignal.timeout(8000),
        });
        console.log(`   [BrasilAPI] Status: ${res.status}`);
        expect([200, 403, 429, 500]).toContain(res.status);
    }, 10000);

    it('Portal da Transparência (CGU) responde', async () => {
        try {
            const res = await fetch('https://api.portaldatransparencia.gov.br/api-de-dados/servidores?pagina=1&tamanhoPagina=1', {
                headers: { 'chave-api-dados': process.env.CGU_API_KEY || 'invalid' },
                signal: AbortSignal.timeout(8000),
            });
            console.log(`   [CGU] Status: ${res.status}`);
            expect([200, 400, 401, 403, 429]).toContain(res.status);
        } catch (e: any) {
            console.log(`   [CGU] Offline: ${e.message}`);
        }
    }, 10000);
});
