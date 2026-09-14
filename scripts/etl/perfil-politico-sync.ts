import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import * as cheerio from 'cheerio';
import { pathToFileURL } from 'node:url';
import { fetchCamaraJson as fetchJson, exigirDeputados } from './camara-http';
import { fetchWithTimeout } from '../../src/app/api/investigar/tse';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabasePrincipalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePrincipalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabasePrincipalUrl || !supabasePrincipalKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase (Principal ou Perfil).");
    process.exit(1);
}

// Banco Secundário (Perfis) - Destino
const supabasePerfil = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Banco Principal (OSINT) - Origem da Cota (CEAP)

const supabasePrincipal = createClient(supabasePrincipalUrl, supabasePrincipalKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2';

const COTA_POR_UF: Record<string, number> = {
    'AC': 50882.35, 'AL': 46685.20, 'AM': 49666.27, 'AP': 49635.84, 'BA': 45318.91,
    'CE': 48375.45, 'DF': 36582.46, 'ES': 43703.11, 'GO': 41846.74, 'MA': 48117.82,
    'MG': 42106.87, 'MS': 46830.40, 'MT': 45543.16, 'PA': 48366.86, 'PB': 48161.41,
    'PE': 47683.79, 'PI': 47137.90, 'PR': 44923.47, 'RJ': 41829.43, 'RN': 48679.52,
    'RO': 49845.89, 'RR': 51187.32, 'RS': 46979.67, 'SC': 45969.31, 'SE': 46429.61,
    'SP': 43236.43, 'TO': 45437.81
};

async function scrapeGabinete(idDeputado: number) {
    const anoAtual = new Date().getFullYear();
    const url = `https://www.camara.leg.br/deputados/${idDeputado}/pessoal-gabinete?ano=${anoAtual}`;
    try {
        const res = await fetchWithTimeout(url, {
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) return [];
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
                    servidores.push({
                        deputado_id: idDeputado,
                        nome,
                        cargo,
                        periodo,
                        data_nomeacao: new Date().toISOString() // Placeholder
                    });
                }
            }
        });
        return servidores;
    } catch (e) {
        console.error(`Erro ao fazer scraping de gabinete para ${idDeputado}:`, e);
        return [];
    }
}

function calcularGastoMes(gastos: any[] | null, mes: number): { valorGasto: number; fatias: Record<string, number> } {
    let valorGasto = 0;
    const fatias: Record<string, number> = {};
    if (!gastos || gastos.length === 0) return { valorGasto, fatias };

    for (const g of gastos) {
        if (!g.data_documento) continue;
        const docMonth = new Date(g.data_documento).getMonth() + 1;
        if (docMonth !== mes) continue;

        const val = Number(g.valor_documento) || 0;
        valorGasto += val;
        const tipo = g.tipo_despesa || 'Outros';
        fatias[tipo] = (fatias[tipo] || 0) + val;
    }
    return { valorGasto, fatias };
}

function montarLoteMesesCEAP(depId: number, teto: number, gastos: any[] | null, anoAtual: number, mesAtual: number) {
    const batch = [];
    for (let m = 1; m <= 12; m++) {
        if (anoAtual === new Date().getFullYear() && m > mesAtual) break;
        const { valorGasto, fatias } = calcularGastoMes(gastos, m);
        if (valorGasto > 0 || m === mesAtual) {
            batch.push({
                deputado_id: depId,
                mes_referencia: m,
                ano_referencia: anoAtual,
                valor_teto: teto,
                valor_gasto: valorGasto,
                fatias_json: fatias,
                atualizado_em: new Date().toISOString()
            });
        }
    }
    return batch;
}

async function processarCotaCEAP(dep: any, anoAtual: number, mesAtual: number) {
    const teto = COTA_POR_UF[dep.siglaUf] || 40000;
    
    const { data: gastos, error } = await supabasePrincipal
        .from('ceap_despesas_cache')
        .select('tipo_despesa, valor_documento, data_documento')
        .eq('id_deputado', dep.id)
        .eq('ano', anoAtual);
        
    if (error) {
        throw new Error(`Erro ao buscar CEAP no DB Principal: ${error.message}`);
    }

    const batch = montarLoteMesesCEAP(dep.id, teto, gastos, anoAtual, mesAtual);

    if (batch.length > 0) {
        const { error: upsertError } = await supabasePerfil.from('camara_cota_resumo_cache').upsert(
            batch,
            { onConflict: 'deputado_id, ano_referencia, mes_referencia' }
        );
        if (upsertError) throw new Error(`Erro ao salvar resumo CEAP: ${upsertError.message}`);
    }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sincronizarPerfilDeputado(dep: any) {
    const depDetailReq = await fetchJson(`${API_BASE}/deputados/${dep.id}`);
    if (!depDetailReq?.dados) throw new Error(`Detalhes do deputado ${dep.id} indisponíveis; perfil preservado.`);
    const nomeCivil = depDetailReq?.dados?.nomeCivil || dep.nome;
    const nomeEleitoral = depDetailReq?.dados?.ultimoStatus?.nomeEleitoral || dep.nome;

    const frentesReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/frentes`);
    const frentes = frentesReq?.dados?.map((f: any) => f.titulo) || [];
    
    const orgaosReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/orgaos`);
    const comissoes = orgaosReq?.dados?.map((o: any) => o.nomeOrgao) || [];

    const profsReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/profissoes`);
    const profissoes = profsReq?.dados?.map((p: any) => p.titulo) || [];

    const { error: perfilError } = await supabasePerfil.from('camara_perfil_politico_cache').upsert(
        {
            id_deputado: dep.id,
            nome_civil: nomeCivil,
            nome_eleitoral: nomeEleitoral,
            partido: dep.siglaPartido,
            uf: dep.siglaUf,
            frentes,
            comissoes,
            profissoes,
            data_atualizacao: new Date().toISOString()
        },
        { onConflict: 'id_deputado' }
    );
    if (perfilError) throw new Error(`Erro ao salvar perfil ${dep.id}: ${perfilError.message}`);
}

async function sincronizarGabinete(depId: number) {
    console.log(`  - Extraindo servidores do gabinete (Scraping)...`);
    const servidores = await scrapeGabinete(depId);
    if (servidores.length === 0) {
        console.log(`  - Nenhum servidor encontrado.`);
        return;
    }

    const { error: deleteError } = await supabasePerfil.from('camara_servidores_gabinete').delete().eq('deputado_id', depId);
    if (deleteError) throw new Error(`Erro ao limpar gabinete ${depId}: ${deleteError.message}`);

    const { error: insertError } = await supabasePerfil.from('camara_servidores_gabinete').insert(servidores);
    if (insertError) throw new Error(`Erro ao salvar gabinete ${depId}: ${insertError.message}`);
    console.log(`  - ${servidores.length} servidores inseridos.`);
}

export async function run() {
    console.log("[PERFIL SYNC] Iniciando sincronização de perfil completa...");

    try {
        console.log("[PERFIL SYNC] Buscando lista completa de deputados da 57ª Legislatura...");
        const depsReq = await fetchJson(`${API_BASE}/deputados?idLegislatura=57&itens=1000`);
        const deputados = exigirDeputados(depsReq);
        console.log(`[PERFIL SYNC] Encontrados ${deputados.length} deputados.`);

        const dataAtual = new Date();
        const anoAtual = dataAtual.getFullYear();
        const mesAtual = dataAtual.getMonth() + 1;

        let count = 0;
        for (const dep of deputados) {
            count++;
            console.log(`[${count}/${deputados.length}] Sincronizando deputado ID ${dep.id} (${dep.nome})...`);
            
            await sincronizarPerfilDeputado(dep);
            await sincronizarGabinete(dep.id);

            console.log(`  - Processando resumo da CEAP do DB Principal...`);
            await processarCotaCEAP(dep, anoAtual, mesAtual);
            console.log(`  - Cota CEAP consolidada.`);

            await delay(500); 
        }

        console.log("[PERFIL SYNC] Finalizado com sucesso!");
    } catch (error) {
        console.error("[PERFIL SYNC] Erro fatal:", error);
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    run().catch(() => { process.exitCode = 1; });
}
