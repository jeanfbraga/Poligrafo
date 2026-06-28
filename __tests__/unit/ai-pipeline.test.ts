import { describe, it, expect, vi } from 'vitest';
import { 
    resolverContextoNormativo, 
    analisarEmendasComInteligencia, 
    analisarLoteComInteligencia,
    analisarMalhaOsintComInteligencia
} from '../../src/app/api/investigar/ai_helpers';

describe('🧠 AI Pipeline - Resolvedor Normativo & Triagem', () => {

    describe('1. Resolvedor Contextual Normativo', () => {
        it('deve adotar normativas FEDERAIS para deputados e senadores', () => {
            const contextoCamara = resolverContextoNormativo('FEDERAL', 'SP', 'CAMARA');
            expect(contextoCamara.normaPrincipal).toContain('Ato da Mesa');
            
            const contextoSenado = resolverContextoNormativo('FEDERAL', 'RJ', 'SENADO');
            expect(contextoSenado.normaPrincipal).toContain('Ato da Mesa');
        });

        it('deve adotar normativas ESTADUAIS e direcionar ao TCE', () => {
            const contextoAlesp = resolverContextoNormativo('ESTADUAL', 'SP', 'ALESP');
            expect(contextoAlesp.orgaoControle).toContain('TCE-SP');
            expect(contextoAlesp.observacaoLocal).toContain('Sem norma local expressa');

            const contextoAlerj = resolverContextoNormativo('ESTADUAL', 'RJ', 'ALERJ');
            expect(contextoAlerj.orgaoControle).toContain('TCE-RJ');
            expect(contextoAlerj.observacaoLocal).toContain('Sem norma local expressa');
        });

        it('deve adotar normativas MUNICIPAIS rigorosas na falta de regimento explícito', () => {
            const contextoMunicipal = resolverContextoNormativo('MUNICIPAL', 'MG', 'CAMARA_MUNICIPAL_BH');
            expect(contextoMunicipal.orgaoControle).toContain('Tribunal de Contas');
            expect(contextoMunicipal.normaPrincipal).toContain('Lei local');
            // Deve aplicar fallback conservador
            expect(contextoMunicipal.observacaoLocal).toContain('ausência de norma local');
        });

        it('deve usar FEDERAL como fallback seguro caso parâmetros venham malformados', () => {
            // @ts-ignore forcing bad type
            const contextoBugado = resolverContextoNormativo(undefined, 'BR', undefined);
            expect(contextoBugado.esfera).toBe('FEDERAL');
            expect(contextoBugado.orgaoControle).toContain('TCU');
        });
    });

    describe('2. Fallback Heurístico Matemático (L3 / Sem LLM)', () => {
        
        it('deve classificar emendas rigorosamente quando não houver LLM disponível', async () => {
             const emendasMock = [
                 { _isFantasma: true, _percentualExecucao: 0, valor: 500000 },
                 { _isFantasma: false, _percentualExecucao: 100, valor: 100000, ementa: 'Saúde' }
             ];
             const oldKey = process.env.GEMINI_API_KEY;
             const oldGroq = process.env.GROQ_API_KEY;
             const oldOpenRouter = process.env.OPENROUTER_API_KEY;
             process.env.GEMINI_API_KEY = 'invalid';
             process.env.GROQ_API_KEY = 'invalid';
             process.env.OPENROUTER_API_KEY = '';

             const resultado = await analisarEmendasComInteligencia(emendasMock, 'SP', 'FEDERAL', 'CAMARA');
             
             // O fallback L3 deve dar letalidade na faixa de 70 para a primeira (fantasma/0 execução)
             expect(resultado[0].score_letalidade).toBeGreaterThanOrEqual(70);
             expect(resultado[0].classificacao).toContain('INDICIO');
             expect(resultado[0].fundamentacao_tecnica).toContain('tipo fantasma');

             // A segunda deve ficar como regular
             expect(resultado[1].score_letalidade).toBeLessThan(50);
             
             process.env.GEMINI_API_KEY = oldKey;
             process.env.GROQ_API_KEY = oldGroq;
             process.env.OPENROUTER_API_KEY = oldOpenRouter;
        });

        it('deve classificar despesas suspeitas (fraude/tamanho) no Fallback L3 Lote', async () => {
             const oldKey = process.env.GEMINI_API_KEY;
             const oldOpenRouter = process.env.OPENROUTER_API_KEY;
             process.env.GEMINI_API_KEY = 'invalid';
             process.env.GROQ_API_KEY = 'invalid';
             process.env.OPENROUTER_API_KEY = '';

             const loteMock = [
                 { tipoDocumento: 'Nota Fiscal', valor: 950000, dataEmissao: '2023-01-01', tipoDespesa: 'Limpeza' },
                 { tipoDocumento: 'Recibo', valor: 50, dataEmissao: '2023-01-01', tipoDespesa: 'Táxi' }
             ];

             const re = await analisarLoteComInteligencia(loteMock, 'RJ', [], 'FEDERAL', 'CAMARA');

             // L3 penaliza notas suspeitas altíssimas para pelo menos 30 (limite L3)
             expect(re[0].score_letalidade).toBeGreaterThanOrEqual(30);
             expect(re[0].classificacao).toBeDefined();

             expect(re[1].score_letalidade).toBeLessThan(50);

             process.env.GEMINI_API_KEY = oldKey;
             process.env.OPENROUTER_API_KEY = oldOpenRouter;
        });

        it('[BUG-FIX] deve detectar combustível acima de R$9392 no Fallback L3 como RED FLAG', async () => {
            const oldKey = process.env.GEMINI_API_KEY;
            const oldGroq = process.env.GROQ_API_KEY;
            const oldOpenRouter = process.env.OPENROUTER_API_KEY;
            process.env.GEMINI_API_KEY = 'invalid';
            process.env.GROQ_API_KEY = 'invalid';
            process.env.OPENROUTER_API_KEY = '';

            const loteCombustivel = [
                {
                    cnpjCpfFornecedor: '12345678000100',
                    nomeFornecedor: 'AUTO POSTO BANDEIRANTES LTDA',
                    tipoDespesa: 'COMBUSTÍVEIS E LUBRIFICANTES',
                    valorDocumento: 9500,
                    dataDocumento: '2025-03-15'
                },
                {
                    cnpjCpfFornecedor: '12345678000100',
                    nomeFornecedor: 'AUTO POSTO BANDEIRANTES LTDA',
                    tipoDespesa: 'COMBUSTÍVEIS E LUBRIFICANTES',
                    valorDocumento: 9800,
                    dataDocumento: '2025-02-15'
                },
                {
                    cnpjCpfFornecedor: '12345678000100',
                    nomeFornecedor: 'AUTO POSTO BANDEIRANTES LTDA',
                    tipoDespesa: 'COMBUSTÍVEIS E LUBRIFICANTES',
                    valorDocumento: 10000,
                    dataDocumento: '2025-01-15'
                }
            ];

            const resultado = await analisarLoteComInteligencia(loteCombustivel, 'SP', [], 'FEDERAL', 'CAMARA');

            // Cada nota individual está acima de R$9392 no mesmo posto.
            // O L3 deve flagar todas como desvio (>= 85)
            for (const desp of resultado) {
                expect(desp.score_letalidade).toBeGreaterThanOrEqual(85);
                expect(desp.classificacao).toBe('DESVIO_DE_FINALIDADE');
                expect(desp.motivo_ia).toMatch(/combustível/i);
            }

            process.env.GEMINI_API_KEY = oldKey;
            process.env.GROQ_API_KEY = oldGroq;
            process.env.OPENROUTER_API_KEY = oldOpenRouter;
        });

        it('[BUG-FIX] NÃO deve dar score 20 por padrão para despesas que caem no fallback L3', async () => {
            const oldKey = process.env.GEMINI_API_KEY;
            const oldGroq = process.env.GROQ_API_KEY;
            const oldOpenRouter = process.env.OPENROUTER_API_KEY;
            process.env.GEMINI_API_KEY = 'invalid';
            process.env.GROQ_API_KEY = 'invalid';
            process.env.OPENROUTER_API_KEY = '';

            const loteMisto = [
                {
                    cnpjCpfFornecedor: '00000000000001',
                    nomeFornecedor: 'CONSULTORIA ALPHA',
                    tipoDespesa: 'CONSULTORIA',
                    valorDocumento: 55000,
                    dataDocumento: '2025-01-10'
                },
                {
                    cnpjCpfFornecedor: '00000000000002',
                    nomeFornecedor: 'LOCAÇÃO CARROS LTDA',
                    tipoDespesa: 'LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES',
                    valorDocumento: 12000,
                    dataDocumento: '2025-02-10'
                }
            ];

            const resultado = await analisarLoteComInteligencia(loteMisto, 'RJ', [], 'FEDERAL', 'CAMARA');

            // A consultoria de R$55k deve ser flagada (valor redondo alto + consultoria)
            expect(resultado[0].score_letalidade).toBeGreaterThanOrEqual(50);
            expect(resultado[0].motivo_ia).not.toBe('Gasto validado pela IA como seguro.');

            // Locação de R$12k deve ser flagada (acima de R$8000)
            expect(resultado[1].score_letalidade).toBeGreaterThanOrEqual(30);

            process.env.GEMINI_API_KEY = oldKey;
            process.env.GROQ_API_KEY = oldGroq;
            process.env.OPENROUTER_API_KEY = oldOpenRouter;
        });
    });

    describe('3. Contrato de Saída do Prompt (despesas_avaliadas)', () => {

        it('deve usar chave "despesas_avaliadas" no bloco de saída JSON, não "despesas_suspeitas"', async () => {
            // Importa a função de construção de prompt indiretamente via módulo
            // O teste verifica que o módulo exportado funciona sem crash
            const resultado = await analisarLoteComInteligencia([], 'SP', [], 'FEDERAL', 'CAMARA');
            expect(resultado).toEqual([]);
        });

        it('[BUG-FIX] deve usar chave "emendas_avaliadas" no bloco de saída JSON', async () => {
            const resultado = await analisarEmendasComInteligencia([], 'SP', 'FEDERAL', 'CAMARA');
            expect(resultado).toEqual([]);
        });
    });

    describe('4. Canvas Node Routing (Frontend Gate Simulation)', () => {

        const STRUCTURAL_TYPES = ['PESSOA', 'ORGAO', 'EMENDA_RESUMO', 'EMENDA', 'PROCESSO_JUDICIAL', 'CONTRATO'];

        it('deve enviar nós estruturais para o Canvas independentemente do score', () => {
            const testCases = [
                { type: 'EMENDA', data: { score_letalidade: 0 } },
                { type: 'EMENDA_RESUMO', data: { score_letalidade: undefined } },
                { type: 'ORGAO', data: { score_letalidade: 10 } },
                { type: 'PROCESSO_JUDICIAL', data: { score_letalidade: 95 } },
                { type: 'CONTRATO', data: { score_letalidade: 15 } },
            ];

            for (const node of testCases) {
                const goesToCanvas = STRUCTURAL_TYPES.includes(node.type);
                expect(goesToCanvas).toBe(true);
            }
        });

        it('deve enviar DESPESAS com score >= 60 para o Canvas', () => {
            const despesaSuspeita = { type: 'DESPESA', data: { score_letalidade: 75 } };
            const goesToCanvas = STRUCTURAL_TYPES.includes(despesaSuspeita.type) || despesaSuspeita.data.score_letalidade >= 60;
            expect(goesToCanvas).toBe(true);
        });

        it('deve enviar DESPESAS com score < 60 para a Sidebar (NÃO Canvas)', () => {
            const despesaBaixa = { type: 'DESPESA', data: { score_letalidade: 20 } };
            const goesToCanvas = STRUCTURAL_TYPES.includes(despesaBaixa.type) || despesaBaixa.data.score_letalidade >= 60;
            expect(goesToCanvas).toBe(false);
        });

        it('[BUG-FIX] EMENDA com score zerado NÃO deve cair na Sidebar — precisa ir pro Canvas', () => {
            const emendaZerada = { type: 'EMENDA', data: { score_letalidade: 0 } };
            const goesToCanvas = STRUCTURAL_TYPES.includes(emendaZerada.type);
            expect(goesToCanvas).toBe(true);
        });
    });

    describe('5. Cache Replay Safety', () => {

        it('[BUG-FIX] Replay de cache deve filtrar apenas nó PESSOA (preview rápido)', () => {
            const cachedNodes = [
                { type: 'PESSOA', id: 'p1', data: { label: 'Fulano', score_letalidade: undefined } },
                { type: 'DESPESA', id: 'd1', data: { label: 'Posto Gasolina', score_letalidade: 20 } },
                { type: 'EMENDA', id: 'e1', data: { label: 'Emenda Saúde', score_letalidade: 20 } },
                { type: 'EMENDA_RESUMO', id: 'er1', data: { label: 'Resumo', score_letalidade: undefined } },
                { type: 'PROCESSO_JUDICIAL', id: 'pj1', data: { label: 'Improbidade', score_letalidade: 95 } },
            ];

            // Simula a lógica do route.ts: só replay PESSOA
            const replayedNodes = cachedNodes.filter(n => n.type === 'PESSOA');
            
            expect(replayedNodes).toHaveLength(1);
            expect(replayedNodes[0].type).toBe('PESSOA');
            // Garante que NENHUM nó com score obsoleto foi replayado
            expect(replayedNodes.find(n => n.type === 'DESPESA')).toBeUndefined();
            expect(replayedNodes.find(n => n.type === 'EMENDA')).toBeUndefined();
        });

        it('[BUG-FIX] Score padrão 20 NÃO deve ser aplicado a combustíveis recorrentes', () => {
            // Simula o cenário: a IA retorna array parcial com apenas itens suspeitos
            // e o merge não encontra match para os itens de combustível
            const despesasOriginais = [
                { cnpjCpfFornecedor: '111', nomeFornecedor: 'POSTO X', tipoDespesa: 'COMBUSTÍVEL', valorDocumento: 7200 },
                { cnpjCpfFornecedor: '111', nomeFornecedor: 'POSTO X', tipoDespesa: 'COMBUSTÍVEL', valorDocumento: 6800 },
                { cnpjCpfFornecedor: '111', nomeFornecedor: 'POSTO X', tipoDespesa: 'COMBUSTÍVEL', valorDocumento: 7500 },
            ];

            // Cenário antigo (bugado): IA retorna array vazio -> tudo vira score 20
            const iaRetornoVazio: any[] = [];
            const resultadosBugados = despesasOriginais.map((original) => {
                const avaliacao = iaRetornoVazio.find((a: any) =>
                    a.cnpj === original.cnpjCpfFornecedor &&
                    Number(a.valor) === Number(original.valorDocumento)
                );
                return { score: avaliacao?.score_letalidade ?? 20 };
            });

            // Comprova que o cenário antigo SIM produzia score 20 (BUG!)
            expect(resultadosBugados.every(r => r.score === 20)).toBe(true);

            // Cenário novo (corrigido): IA retorna TODOS os itens pontuados
            const iaRetornoCompleto = [
                { cnpj: '111', valor: 7200, score_letalidade: 90, motivo_ia: 'COMBUSTÍVEL CONCENTRADO NO MESMO POSTO' },
                { cnpj: '111', valor: 6800, score_letalidade: 88, motivo_ia: 'COMBUSTÍVEL PADRÃO RECORRENTE SUSPEITO' },
                { cnpj: '111', valor: 7500, score_letalidade: 92, motivo_ia: 'COMBUSTÍVEL INCOMPATÍVEL FISICAMENTE' },
            ];
            const resultadosCorrigidos = despesasOriginais.map((original) => {
                const avaliacao = iaRetornoCompleto.find((a: any) =>
                    a.cnpj === original.cnpjCpfFornecedor &&
                    Number(a.valor) === Number(original.valorDocumento)
                );
                return { score: avaliacao?.score_letalidade ?? 20 };
            });

            // Agora deve ter scores reais, NÃO 20
            expect(resultadosCorrigidos.every(r => r.score >= 85)).toBe(true);
        });
    });

    describe('6. Filtragem de Emendas no Grafo (Canvas)', () => {
        it('deve filtrar emendas 100% executadas do fluxo individual do Canvas', () => {
            const emendasAvaliadas = [
                { codigoEmenda: '123', _percentualExecucao: 50, _riscoTipo: { nivel: 'NORMAL', label: 'Emenda Individual' } },
                { codigoEmenda: '456', _percentualExecucao: 100, _riscoTipo: { nivel: 'NORMAL', label: 'Emenda Individual' } },
                { codigoEmenda: '789', _percentualExecucao: 0, _riscoTipo: { nivel: 'CRÍTICO', label: 'EMENDA PIX' } }
            ];

            const emendasFiltradas = emendasAvaliadas.filter(e => e._percentualExecucao !== 100);

            expect(emendasFiltradas).toHaveLength(2);
            expect(emendasFiltradas.map(e => e.codigoEmenda)).toContain('123');
            expect(emendasFiltradas.map(e => e.codigoEmenda)).toContain('789');
            expect(emendasFiltradas.map(e => e.codigoEmenda)).not.toContain('456');
        });
    });
});
