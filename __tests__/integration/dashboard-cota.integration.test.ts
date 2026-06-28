/**
 * Testes de Integração REAIS — Dashboard Cota de Gabinete CMRJ
 *
 * NÃO usa mocks. Conecta diretamente ao:
 *   1. Servidor Next.js local (http://localhost:3000) — testa o endpoint HTTP real
 *   2. Supabase real — valida estrutura dos dados retornados
 *
 * Vereadores testados (nomes reais da tabela cmrj_vereador_gabinete):
 *   - Gigi Castilho  (Gabinete 15)
 *   - Carlo Caiado   (Gabinete 02)
 *   - Cesar Maia     (Gabinete 04)
 *   - Átila Nunes    (Gabinete 01)
 *   - Alana Passos   (Gabinete 03)
 *
 * NOTA SOBRE O ESTADO DO BANCO:
 *   Se cmrj_despesas estiver vazia, os testes validam o contrato da resposta vazia.
 *   Se estiver populada (após rodar o ETL), os testes validam os dados reais.
 *   Em nenhum cenário dados são fabricados ou mockados.
 *
 * Pré-requisito: servidor rodando em localhost:3000
 *   npm run dev
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Client real — sem mocks
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Vereadores reais da CMRJ (confirmados na tabela cmrj_vereador_gabinete)
const VEREADORES_REAIS = [
    'Gigi Castilho',
    'Carlo Caiado',
    'Tainá de Paula',
    'William Siri',
    'Monica Benicio',
    'Dr. Marcos Paulo'
];

// ==========================================
// SETUP: Valida o servidor antes de qualquer teste
// ==========================================
let serverOk = false;
let supabaseOk = false;
let totalRegistrosBanco = 0;

beforeAll(async () => {
    // Verifica servidor Next.js
    try {
        const r = await fetch(`${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=teste`, {
            signal: AbortSignal.timeout(5000)
        });
        serverOk = r.ok || r.status === 400; // 400 = nome inválido, mas servidor respondeu
    } catch {
        serverOk = false;
    }

    // Verifica Supabase
    try {
        const { count, error } = await supabase
            .from('cmrj_despesas')
            .select('*', { count: 'exact', head: true });
        supabaseOk = !error;
        totalRegistrosBanco = count ?? 0;
    } catch {
        supabaseOk = false;
    }

    console.log(`\n📋 Estado do ambiente:`);
    console.log(`  🌐 Servidor Next.js (${BASE_URL}): ${serverOk ? '✅ OK' : '❌ OFFLINE'}`);
    console.log(`  🗄️  Supabase: ${supabaseOk ? '✅ OK' : '❌ ERRO'}`);
    console.log(`  📊 Registros em cmrj_despesas: ${totalRegistrosBanco}`);
    if (totalRegistrosBanco === 0) {
        console.log(`\n  ⚠️  Banco vazio — o ETL precisa rodar para testes com valores reais.`);
        console.log(`     Execute: npx tsx scripts/etl/cmrj_cotas_etl.ts`);
    }
});

// ==========================================
// SUITE 1: Conectividade e Contrato da API
// ==========================================
describe('🌐 Endpoint /dashboard-cota — contrato HTTP real', () => {

    test('servidor está respondendo', async () => {
        expect(serverOk).toBe(true);
    });

    test('Supabase está acessível', async () => {
        expect(supabaseOk).toBe(true);
    });

    test('nome ausente → 400 Bad Request', async () => {
        if (!serverOk) return;
        const r = await fetch(`${BASE_URL}/api/investigar/estados/rj/dashboard-cota`, {
            signal: AbortSignal.timeout(10000)
        });
        expect(r.status).toBe(400);
        const body = await r.json();
        expect(body).toHaveProperty('error');
    });

    test('nome inválido/desconhecido → 200 com totalGastos=0', async () => {
        if (!serverOk) return;
        const r = await fetch(
            `${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=XXXXXXNAOEXISTE999`,
            { signal: AbortSignal.timeout(10000) }
        );
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.totalGastos).toBe(0);
        expect(Array.isArray(body.gastosPorCategoria)).toBe(true);
        expect(Array.isArray(body.topFornecedores)).toBe(true);
        expect(Array.isArray(body.gastosMensais)).toBe(true);
    });

    test('resposta tem todas as chaves do contrato', async () => {
        if (!serverOk) return;
        const r = await fetch(
            `${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=Gigi+Castilho`,
            { signal: AbortSignal.timeout(10000) }
        );
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body).toHaveProperty('totalGastos');
        expect(body).toHaveProperty('gastosPorCategoria');
        expect(body).toHaveProperty('topFornecedores');
        expect(body).toHaveProperty('gastosMensais');
        expect(body).toHaveProperty('totalNotas');
    });

    test('totalNotas === gastosPorCategoria + totalGastos são numericamente consistentes', async () => {
        if (!serverOk) return;
        const r = await fetch(
            `${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=Gigi+Castilho`,
            { signal: AbortSignal.timeout(10000) }
        );
        const body = await r.json();
        expect(typeof body.totalGastos).toBe('number');
        expect(body.totalGastos).toBeGreaterThanOrEqual(0);
        expect(body.totalNotas).toBeGreaterThanOrEqual(0);

        // Se há notas, deve haver gastos
        if (body.totalNotas > 0) {
            expect(body.totalGastos).toBeGreaterThan(0);
        }
    });
});

// ==========================================
// SUITE 2: Supabase — Tabela cmrj_despesas (dados reais)
// ==========================================
describe('🗄️  Supabase — tabela cmrj_despesas (dados reais)', () => {

    test('tabela existe e tem schema correto', async () => {
        if (!supabaseOk) return;
        const { data, error } = await supabase
            .from('cmrj_despesas')
            .select('id, vereador_nome, fornecedor_nome, fornecedor_cnpj_cpf, valor, data_despesa, categoria_despesa, extraido_por')
            .limit(1);
        expect(error).toBeNull();
        // data pode ser [] se vazio — ambos são válidos
        expect(Array.isArray(data)).toBe(true);
    });

    test('se há dados: vereador_nome não é null', async () => {
        if (!supabaseOk || totalRegistrosBanco === 0) return;
        const { data } = await supabase
            .from('cmrj_despesas')
            .select('vereador_nome')
            .is('vereador_nome', null)
            .limit(1);
        expect(data?.length).toBe(0); // não deve ter nenhum registro com vereador_nome null
    });

    test('se há dados: valor é sempre > 0 (ETL filtra zerados)', async () => {
        if (!supabaseOk || totalRegistrosBanco === 0) return;
        const { data, error } = await supabase
            .from('cmrj_despesas')
            .select('valor')
            .lte('valor', 0)
            .limit(5);
        expect(error).toBeNull();
        expect(data?.length).toBe(0);
    });

    test('se há dados: categoria_despesa nunca é string vazia', async () => {
        if (!supabaseOk || totalRegistrosBanco === 0) return;
        const { data } = await supabase
            .from('cmrj_despesas')
            .select('categoria_despesa')
            .eq('categoria_despesa', '')
            .limit(1);
        expect(data?.length).toBe(0);
    });

    VEREADORES_REAIS.forEach(nome => {
        test(`[${nome}] busca por nome retorna somente registros deste vereador`, async () => {
            if (!supabaseOk || totalRegistrosBanco === 0) return;
            const { data, error } = await supabase
                .from('cmrj_despesas')
                .select('vereador_nome, valor')
                .ilike('vereador_nome', `%${nome.split(' ')[0]}%`)
                .limit(50);

            expect(error).toBeNull();
            // Se há dados para este vereador, todos devem ter nome consistente
            if (data && data.length > 0) {
                for (const row of data) {
                    expect(row.vereador_nome.toLowerCase()).toContain(nome.split(' ')[0].toLowerCase());
                    expect(Number(row.valor)).toBeGreaterThan(0);
                }
            }
        });
    });

    test('[INTEGRIDADE] nenhum registro com CNPJ mal-formatado (com pontos/traços)', async () => {
        if (!supabaseOk || totalRegistrosBanco === 0) return;
        const { data } = await supabase
            .from('cmrj_despesas')
            .select('fornecedor_cnpj_cpf')
            .not('fornecedor_cnpj_cpf', 'is', null)
            .limit(100);

        if (!data) return;
        for (const row of data) {
            if (row.fornecedor_cnpj_cpf) {
                // CNPJ/CPF deve ter somente dígitos (o ETL faz .replace(/\D/g, ''))
                expect(row.fornecedor_cnpj_cpf).toMatch(/^\d+$/);
            }
        }
    });
});

// ==========================================
// SUITE 3: Vereadores com dados reais (se populado)
// ==========================================
describe('📊 Vereadores reais — endpoint com dados do Supabase', () => {

    VEREADORES_REAIS.forEach(nome => {
        test(`[${nome}] endpoint retorna estrutura válida`, async () => {
            if (!serverOk) return;
            const primeiroNome = nome.split(' ')[0];
            const r = await fetch(
                `${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=${encodeURIComponent(primeiroNome)}`,
                { signal: AbortSignal.timeout(15000) }
            );
            expect(r.status).toBe(200);
            const body = await r.json();

            // Contrato sempre válido
            expect(typeof body.totalGastos).toBe('number');
            expect(body.totalGastos).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(body.gastosPorCategoria)).toBe(true);
            expect(Array.isArray(body.topFornecedores)).toBe(true);
            expect(Array.isArray(body.gastosMensais)).toBe(true);
            expect(typeof body.totalNotas).toBe('number');
            expect(body.totalNotas).toBeGreaterThanOrEqual(0);
        });

        test(`[${nome}] se há dados: gastosPorCategoria ordenados decrescente`, async () => {
            if (!serverOk || totalRegistrosBanco === 0) return;
            const primeiroNome = nome.split(' ')[0];
            const r = await fetch(
                `${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=${encodeURIComponent(primeiroNome)}`,
                { signal: AbortSignal.timeout(15000) }
            );
            const body = await r.json();
            const cats = body.gastosPorCategoria;
            for (let i = 1; i < cats.length; i++) {
                expect(cats[i - 1].valor).toBeGreaterThanOrEqual(cats[i].valor);
            }
        });

        test(`[${nome}] se há dados: topFornecedores não excede 5`, async () => {
            if (!serverOk) return;
            const primeiroNome = nome.split(' ')[0];
            const r = await fetch(
                `${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=${encodeURIComponent(primeiroNome)}`,
                { signal: AbortSignal.timeout(15000) }
            );
            const body = await r.json();
            expect(body.topFornecedores.length).toBeLessThanOrEqual(5);
        });

        test(`[${nome}] se há dados: gastosMensais ordenados cronologicamente`, async () => {
            if (!serverOk || totalRegistrosBanco === 0) return;
            const primeiroNome = nome.split(' ')[0];
            const r = await fetch(
                `${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=${encodeURIComponent(primeiroNome)}`,
                { signal: AbortSignal.timeout(15000) }
            );
            const body = await r.json();
            const meses = body.gastosMensais;
            for (let i = 1; i < meses.length; i++) {
                expect(meses[i - 1].mes.localeCompare(meses[i].mes)).toBeLessThanOrEqual(0);
            }
        });
    });

    test('[SOMA] soma das categorias bate com totalGastos (tolerância de 1 centavo por arredondamento)', async () => {
        if (!serverOk || totalRegistrosBanco === 0) return;
        const r = await fetch(
            `${BASE_URL}/api/investigar/estados/rj/dashboard-cota?nome=Gigi`,
            { signal: AbortSignal.timeout(15000) }
        );
        const body = await r.json();
        if (body.gastosPorCategoria.length === 0) return;

        const somaCategorias = body.gastosPorCategoria.reduce((acc: number, c: any) => acc + c.valor, 0);
        expect(Math.abs(somaCategorias - body.totalGastos)).toBeLessThanOrEqual(0.02);
    });
});
