import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import * as cheerio from 'cheerio';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePrincipalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePrincipalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabasePrincipalUrl || !supabasePrincipalKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase.");
    process.exit(1);
}

const supabasePerfil = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
const supabasePrincipal = createClient(supabasePrincipalUrl, supabasePrincipalKey, { auth: { persistSession: false } });

const DEPUTADO_TESTE = {
    id: 209787,
    nome: 'Nikolas Ferreira',
    siglaUf: 'MG'
};

const COTA_POR_UF: Record<string, number> = {
    'AC': 50882.35, 'AL': 46685.20, 'AM': 49666.27, 'AP': 49635.84, 'BA': 45318.91,
    'CE': 48375.45, 'DF': 36582.46, 'ES': 43703.11, 'GO': 41846.74, 'MA': 48117.82,
    'MG': 42106.87, 'MS': 46830.40, 'MT': 45543.16, 'PA': 48366.86, 'PB': 48161.41,
    'PE': 47683.79, 'PI': 47137.90, 'PR': 44923.47, 'RJ': 41829.43, 'RN': 48679.52,
    'RO': 49845.89, 'RR': 51187.32, 'RS': 46979.67, 'SC': 45969.31, 'SE': 46429.61,
    'SP': 43236.43, 'TO': 45437.81
};

async function testarGabinete() {
    console.log(`\n--- Testando Scraping de Gabinete para ${DEPUTADO_TESTE.nome} (${DEPUTADO_TESTE.id}) ---`);
    const anoAtual = 2024; // Hardcoded para ter dados
    const url = `https://www.camara.leg.br/deputados/${DEPUTADO_TESTE.id}/pessoal-gabinete?ano=${anoAtual}`;
    
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const servidores: any[] = [];
        $('.table tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length >= 4) {
                const nome = $(tds[0]).text().trim();
                const cargo = $(tds[1]).text().trim();
                const periodo = $(tds[3]).text().trim();
                if (nome && nome !== "") {
                    servidores.push({ deputado_id: DEPUTADO_TESTE.id, nome, cargo, periodo, data_nomeacao: new Date().toISOString() });
                }
            }
        });
        
        console.log(`Encontrados ${servidores.length} servidores via Scraping.`);
        if (servidores.length > 0) {
            console.log("Primeiros 3 servidores:", servidores.slice(0, 3));
            console.log("\nSalvando no banco de testes (Perfil)...");
            const { error } = await supabasePerfil.from('camara_servidores_gabinete').upsert(servidores);
            if (error) console.error("Erro ao salvar:", error.message);
            else console.log("Salvo com sucesso!");
        } else {
            console.log("⚠️ A tabela não foi encontrada. O seletor '.table tbody tr' pode estar falhando.");
        }
    } catch (e: any) {
        console.error("Erro no Scraping:", e.message);
    }
}

async function testarCota() {
    console.log(`\n--- Testando Cota CEAP para ${DEPUTADO_TESTE.nome} (${DEPUTADO_TESTE.id}) ---`);
    const anoAtual = 2024; // Usando 2024 para ter dados
    const mesAtual = 5; // Maio de 2024
    const teto = COTA_POR_UF[DEPUTADO_TESTE.siglaUf] || 40000;
    
    console.log(`Limite para UF ${DEPUTADO_TESTE.siglaUf}: R$ ${teto}`);
    console.log(`Buscando despesas no DB Principal para Ano: ${anoAtual}, Mês: ${mesAtual}...`);
    
    const { data: gastos, error } = await supabasePrincipal
        .from('ceap_despesas_cache')
        .select('tipo_despesa, valor_documento, data_documento')
        .eq('id_deputado', DEPUTADO_TESTE.id)
        .eq('ano', anoAtual);
        
    if (error) {
        console.error("Erro ao buscar no DB Principal:", error.message);
        return;
    }

    let valorGasto = 0;
    const fatias: Record<string, number> = {};

    if (gastos && gastos.length > 0) {
        for (const g of gastos) {
            // Filtrar pelo mês
            if (g.data_documento) {
                const docMonth = new Date(g.data_documento).getMonth() + 1;
                if (docMonth !== mesAtual) continue;
            }
            
            valorGasto += Number(g.valor_documento);
            const tipo = g.tipo_despesa || 'Outros';
            fatias[tipo] = (fatias[tipo] || 0) + Number(g.valor_documento);
        }
        console.log(`Total gasto: R$ ${valorGasto.toFixed(2)}`);
        console.log("Fatias de gasto:", JSON.stringify(fatias, null, 2));
        
        console.log("\nSalvando resumo no banco de testes (Perfil)...");
        const { error: saveError } = await supabasePerfil.from('camara_cota_resumo_cache').upsert(
            {
                deputado_id: DEPUTADO_TESTE.id,
                mes_referencia: mesAtual,
                ano_referencia: anoAtual,
                valor_teto: teto,
                valor_gasto: valorGasto,
                fatias_json: fatias,
                atualizado_em: new Date().toISOString()
            },
            { onConflict: 'deputado_id' }
        );
        if (saveError) console.error("Erro ao salvar cota:", saveError.message);
        else console.log("Salvo com sucesso!");
    } else {
        console.log("Nenhum gasto encontrado no mês atual para este deputado no banco Principal.");
    }
}

async function runTests() {
    await testarGabinete();
    await testarCota();
}

runTests();
