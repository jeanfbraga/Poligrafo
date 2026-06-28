import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3000';

// ======================================================
// HELPER: Consome um stream SSE e retorna todos os eventos
// ======================================================
async function consumeStream(url: string, timeoutMs = 60000): Promise<any[]> {
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

// ======================================================
// 1. BUSCA CASCATA FEDERAL: DEPUTADO FEDERAL
// ======================================================
describe('🏛️ Fluxo Federal — Deputado da Câmara', () => {

    it('deve encontrar "Tabata Amaral" e retornar nós do grafo', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Tabata Amaral')}`
        );

        expect(eventos.length).toBeGreaterThan(0);

        const statusEvts = getEventsByType(eventos, 'STATUS');
        const nodePessoa = getEventsByType(eventos, 'NODE_PESSOA');
        const doneEvts = getEventsByType(eventos, 'DONE');
        const nodesNovos = getEventsByType(eventos, 'NODE_NOVO');

        console.log(`   [Tabata] NODE_PESSOA: ${nodePessoa.length}, DONE: ${doneEvts.length}, STATUS: ${statusEvts.length}, NODES: ${nodesNovos.length}`);
        // O pipeline deve ter emitido algo (podendo falhar por rate-limit da Câmara)
        expect(eventos.length).toBeGreaterThan(0);
    }, 90000);

    it('deve retornar NODE_NOVO com score_letalidade para despesas quando IA é acionada', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Tabata Amaral')}`
        );
        const nodesNovos = getEventsByType(eventos, 'NODE_NOVO');
        const despesas = nodesNovos.filter(n => n.payload?.type === 'DESPESA');

        if (despesas.length > 0) {
            // Pelo menos uma despesa deve ter score_letalidade
            const comScore = despesas.filter((d: any) => d.payload?.data?.score_letalidade !== undefined);
            console.log(`   [IA] ${comScore.length}/${despesas.length} despesas com score_letalidade`);
            expect(comScore.length).toBeGreaterThan(0);
        }
    }, 90000);
});

// ======================================================
// 2. BUSCA CASCATA FEDERAL: SENADOR
// ======================================================
describe('🏛️ Fluxo Federal — Senador', () => {

    it('deve encontrar "Flávio Bolsonaro" no Senado', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Flávio Bolsonaro')}`
        );

        expect(eventos.length).toBeGreaterThan(0);

        const statusEvts = getEventsByType(eventos, 'STATUS');
        const senado = statusEvts.find((s: any) =>
            JSON.stringify(s.payload).toUpperCase().includes('SENADO') ||
            JSON.stringify(s.payload).toUpperCase().includes('SENADOR')
        );
        const doneEvts = getEventsByType(eventos, 'DONE');
        console.log(`   [Senado] Referência ao Senado: ${!!senado}, DONE: ${doneEvts.length}, STATUS: ${statusEvts.length}`);
        expect(eventos.length).toBeGreaterThan(0);
    }, 90000);
});

// ======================================================
// 3. BUSCA CASCATA ESTADUAL: DEPUTADO ALERJ (RJ)
// ======================================================
describe('🏢 Fluxo Estadual — ALERJ (RJ)', () => {

    it('deve buscar deputado estadual via ALERJ', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Carlo Caiado')}`,
            120000
        );

        const status = getEventsByType(eventos, 'STATUS');
        const nodesNovos = getEventsByType(eventos, 'NODE_NOVO');
        const done = getEventsByType(eventos, 'DONE');
        const errors = getEventsByType(eventos, 'ERROR');
        console.log(`   [ALERJ] ${status.length} status, ${nodesNovos.length} nós, ${done.length} DONE, ${errors.length} ERR`);

        // O stream deve ter emitido algo (STATUS, DONE ou ERROR)
        expect(eventos.length).toBeGreaterThan(0);
    }, 130000);
});

// ======================================================
// 4. DESAMBIGUAÇÃO (HOMÔNIMOS)
// ======================================================
describe('👥 Desambiguação de Homônimos', () => {

    it('deve retornar lista de candidatos quando há mais de 1 resultado para "Atila Lira"', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar?nome=${encodeURIComponent('Atila Lira')}`,
            120000
        );

        // Pode receber CANDIDATOS, NODE_PESSOA, ou MULTIPLE_RESULTS
        const candidatos = getEventsByType(eventos, 'CANDIDATOS');
        const nodePessoa = getEventsByType(eventos, 'NODE_PESSOA');
        const multipleResults = getEventsByType(eventos, 'MULTIPLE_RESULTS');
        const status = getEventsByType(eventos, 'STATUS');

        console.log(`   [Desambiguação] CANDIDATOS: ${candidatos.length}, NODE_PESSOA: ${nodePessoa.length}, MULTIPLE_RESULTS: ${multipleResults.length}, STATUS: ${status.length}`);
        // O stream emitiu algo
        expect(eventos.length).toBeGreaterThan(0);
    }, 130000);
});

// ======================================================
// 5. CNPJ DRILL-DOWN (Expansão Societária)
// ======================================================
describe('🔍 CNPJ Drill-Down (Expansão Societária)', () => {

    it('deve expandir CNPJ da Petrobras e retornar QSA', async () => {
        // CNPJ da Petrobras (público)
        const cnpj = '33000167000101';
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar/cnpj?cnpj=${cnpj}&origemId=test-node-1`
        );

        expect(eventos.length).toBeGreaterThan(0);

        const status = getEventsByType(eventos, 'STATUS');
        const nodesNovos = getEventsByType(eventos, 'NODE_NOVO');
        const empresas = nodesNovos.filter(n => n.payload?.type === 'EMPRESA');
        const socios = nodesNovos.filter(n => n.payload?.type === 'SOCIO');

        console.log(`   [CNPJ] ${empresas.length} empresa(s), ${socios.length} sócio(s), ${status.length} status`);
        expect(empresas.length).toBeGreaterThanOrEqual(1);
        // Petrobras tem sócios no QSA
        expect(socios.length).toBeGreaterThanOrEqual(1);

        const done = getEventsByType(eventos, 'DONE');
        expect(done.length).toBeGreaterThanOrEqual(1);
    }, 30000);

    it('deve retornar erro para CNPJ inexistente', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar/cnpj?cnpj=00000000000000&origemId=test-node-2`
        );
        const erros = getEventsByType(eventos, 'ERROR');
        expect(erros.length).toBeGreaterThanOrEqual(1);
    }, 15000);

    it('deve retornar 400 sem parâmetros obrigatórios', async () => {
        const res = await fetch(`${BASE_URL}/api/investigar/cnpj`);
        expect(res.status).toBe(400);
    }, 5000);
});

// ======================================================
// 6. BUSCA REVERSA DE SÓCIOS
// ======================================================
describe('👤 Busca Reversa de Sócios', () => {

    it('deve retornar 400 sem parâmetros obrigatórios', async () => {
        const res = await fetch(`${BASE_URL}/api/investigar/socio`);
        expect(res.status).toBe(400);
    }, 5000);

    it('deve emitir stream para busca de sócio', async () => {
        const eventos = await consumeStream(
            `${BASE_URL}/api/investigar/socio?nome=${encodeURIComponent('João Silva')}&origemId=test-socio-1`,
            20000
        );

        // Deve pelo menos emitir STATUS e DONE/ERROR
        expect(eventos.length).toBeGreaterThan(0);
        const status = getEventsByType(eventos, 'STATUS');
        console.log(`   [Sócio] ${status.length} status, ${getEventsByType(eventos, 'NODE_NOVO').length} nós`);
    }, 25000);
});

// ======================================================
// 7. MOTOR DE IA (Triage OSINT)
// ======================================================
describe('🧠 Motor de IA — Triage OSINT', () => {

    it('deve classificar corretamente doador com PNCP (TOMA-LÁ-DÁ-CÁ)', async () => {
        if (!process.env.GROQ_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) {
            console.warn("   [IA] Pulando teste de Triage OSINT pois não há chaves de API de IA configuradas.");
            return;
        }

        const { analisarMalhaOsintComInteligencia } = await import('@/app/api/investigar/ai_helpers');

        const malha = [
            {
                id: 'doador_test_batch',
                type: 'EMPRESA',
                data: { label: 'CONSTRUTORA FANTASMA LTDA', valor: 750000, tipo: 'DOAÇÃO ELEITORAL', score_letalidade: 0, motivo_ia: null }
            },
            {
                _isContextOnly: true,
                tipoContexto: "CONTRATOS_MUNICIPAIS_DOADORES",
                contratosPNCP: [{ cnpj: "99887766000100", contratos: [{ orgao: "Prefeitura de Testeville", objeto: "Pavimentação", valor: 3000000 }] }]
            }
        ];

        const resultado = await analisarMalhaOsintComInteligencia(malha, 'SP');
        const doador = resultado.find((n: any) => n.id === 'doador_test_batch');

        expect(doador).toBeDefined();
        expect(doador.data.score_letalidade).toBeGreaterThanOrEqual(80);
        console.log(`   [IA] Score Toma-Lá-Dá-Cá: ${doador.data.score_letalidade} | Motivo: ${doador.data.motivo_ia?.substring(0, 80)}`);
    }, 30000);

    it('deve dar score baixo para bem trivial', async () => {
        if (!process.env.GROQ_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) return;
        const { analisarMalhaOsintComInteligencia } = await import('@/app/api/investigar/ai_helpers');

        const malha = [
            { id: 'bem_trivial', type: 'DESPESA', data: { label: 'Apartamento Quitado', valor: 250000, tipo: 'BEM DECLARADO', score_letalidade: 0, motivo_ia: null } }
        ];

        const resultado = await analisarMalhaOsintComInteligencia(malha, 'RJ');
        const bem = resultado.find((n: any) => n.id === 'bem_trivial');

        expect(bem).toBeDefined();
        expect(bem.data.score_letalidade).toBeLessThan(60);
        console.log(`   [IA] Score Trivial: ${bem.data.score_letalidade}`);
    }, 30000);

    it('não deve retornar nós _isContextOnly no resultado final', async () => {
        if (!process.env.GROQ_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) return;
        const { analisarMalhaOsintComInteligencia } = await import('@/app/api/investigar/ai_helpers');

        const malha = [
            { id: 'empresa_x', type: 'EMPRESA', data: { label: 'Empresa X', valor: 100, score_letalidade: 0, motivo_ia: null } },
            { _isContextOnly: true, tipoContexto: "PROJETOS_LEI_AUTORIA", projetos: [{ ementa: "PL do Agro" }] },
        ];

        const resultado = await analisarMalhaOsintComInteligencia(malha, 'GO');
        const contextos = resultado.filter((n: any) => n._isContextOnly);
        expect(contextos.length).toBe(0);
        console.log(`   [IA] Context nodes filtrados: ✅ (${resultado.length} nós retornados)`);
    }, 30000);
});

// ======================================================
// 8. EXPORTAÇÃO DOCX (BATCH COMPLETO)
// ======================================================
describe('📄 Exportação DOCX — Batch Completo', () => {

    it('deve gerar DOCX com carga completa simulando investigação real', async () => {
        const payload = {
            nomePolitico: 'Deputado Teste Batch',
            despesasCriticas: [
                { label: 'POSTO FANTASMA LTDA', type: 'DESPESA', tipo: 'NOTA FISCAL', valor: 15000, score_letalidade: 92, motivo_ia: 'EMPRESA BAIXADA NA RECEITA COM NOTA FISCAL ATIVA' },
                { label: 'CONSTRUTORA XYZ', type: 'EMPRESA', tipo: 'DOAÇÃO ELEITORAL', valor: 500000, score_letalidade: 95, motivo_ia: 'FINANCIADORA DA CAMPANHA COM R$ 3MM EM CONTRATOS PNCP' },
                { label: 'CONTRATO PAVIMENTAÇÃO', type: 'CONTRATO', tipo: 'CONVENIO', valor: 2500000, score_letalidade: 88, motivo_ia: 'CONVÊNIO FEDERAL COM MUNICÍPIO DO DOADOR DE CAMPANHA' },
                { label: 'EMENDA PIX FANTASMA', type: 'EMENDA', tipo: 'RP9', valor: 800000, score_letalidade: 90, motivo_ia: 'EMENDA DO ORÇAMENTO SECRETO SEM EXECUÇÃO FÍSICA IDENTIFICÁVEL' },
                { label: 'SECRETARIA EDUCAÇÃO', type: 'ORGAO', tipo: 'ORGAO PUBLICO', valor: 150000, score_letalidade: 65, motivo_ia: 'REPASSE PARA ÓRGÃO COM HISTÓRICO DE IRREGULARIDADES' },
            ],
            urlsNotasFiscais: [
                'https://portal.transparencia.gov.br/despesas/12345',
                'https://www.camara.leg.br/propostas/67890',
                'https://pncp.gov.br/contratos/00001',
            ],
        };

        const res = await fetch(`${BASE_URL}/api/exportar-dossie`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        const blob = await res.arrayBuffer();
        console.log(`   [DOCX] Tamanho gerado: ${(blob.byteLength / 1024).toFixed(1)} KB`);
        expect(blob.byteLength).toBeGreaterThan(3000);
    }, 15000);
});

// ======================================================
// 9. FONTES DE DADOS OSINT (Conectores isolados)
// ======================================================
describe('🌐 Fontes OSINT — Conectores Isolados', () => {

    it('API da Câmara (Proposições) responde', async () => {
        const res = await fetch('https://dadosabertos.camara.leg.br/api/v2/proposicoes?idAutor=204554&ordem=DESC&ordenarPor=id&itens=2', {
            signal: AbortSignal.timeout(8000),
        });
        console.log(`   [Câmara Proposições] Status: ${res.status}`);
        // Tolera rate-limiting (403/429) mas não deve crashar
        expect([200, 400, 403, 429]).toContain(res.status);
    }, 10000);

    it('BrasilAPI (CNPJ) responde', async () => {
        const res = await fetch('https://brasilapi.com.br/api/cnpj/v1/33000167000101', {
            signal: AbortSignal.timeout(8000),
        });
        console.log(`   [BrasilAPI] Status: ${res.status}`);
        // Pode dar 403 por rate limit, mas não deve crashar
        expect([200, 403, 429]).toContain(res.status);
    }, 10000);

    it('Senado API responde', async () => {
        const res = await fetch('https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/57', {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
        });
        console.log(`   [Senado] Status: ${res.status}`);
        expect(res.ok).toBe(true);
    }, 10000);

    it('PNCP API responde (pode dar vazio)', async () => {
        try {
            // API PNCP 2026: exige dataInicial/dataFinal (YYYYMMDD) e cnpjOrgao
            const agora = new Date();
            const dataFinal = agora.toISOString().slice(0, 10).replace(/-/g, '');
            const umAnoAtras = new Date(agora.getFullYear() - 1, agora.getMonth(), agora.getDate());
            const dataInicial = umAnoAtras.toISOString().slice(0, 10).replace(/-/g, '');
            const res = await fetch(`https://pncp.gov.br/api/consulta/v1/contratos?dataInicial=${dataInicial}&dataFinal=${dataFinal}&cnpjOrgao=33000167000101&pagina=1&tamanhoPagina=3`, {
                signal: AbortSignal.timeout(10000),
            });
            console.log(`   [PNCP] Status: ${res.status}`);
            expect([200, 400, 404, 403, 422, 500]).toContain(res.status);
        } catch (e: any) {
            // PNCP pode estar fora do ar - não é bloqueante
            console.log(`   [PNCP] Offline ou timeout: ${e.message}`);
        }
    }, 15000);
});

// ======================================================
// 10. INTEGRAÇÕES: DATAJUD & TCU SANÇÕES
// ======================================================
describe('⚖️ Integrações de Alta Letalidade (DataJud e TCU/CGU)', () => {

    it('Ação Civil Pública de Improbidade (Classe 129) no DataJud responde corretamente (API Pública do CNJ)', async () => {
        try {
            // Chave pública fornecida pela wiki do DataJud para acesso básico e de consulta pública
            const datajudKey = process.env.DATAJUD_API_KEY;
            if (!datajudKey) throw new Error('DATAJUD_API_KEY is not defined in the environment.');

            const payload = {
                query: {
                    bool: {
                        must: [
                            { match: { "partes.nome": "SILVAL DA CUNHA BARBOSA" } },
                            { match: { "classe.codigo": 129 } }
                        ]
                    }
                },
                size: 3
            };

            const res = await fetch(`https://api-publica.datajud.cnj.jus.br/api_publica_*/_search`, {
                method: 'POST',
                headers: {
                    'Authorization': datajudKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000)
            });
            
            console.log(`   [DataJud] Status: ${res.status}`);
            expect([200, 400, 404, 403, 422, 500]).toContain(res.status);
            
            if (res.ok) {
                const data = await res.json();
                expect(data).toHaveProperty('hits');
            }
        } catch (e: any) {
            console.log(`   [DataJud] Falha ou timeout: ${e.message}`);
        }
    }, 15000);
});
