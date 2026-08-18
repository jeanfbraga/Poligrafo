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

async function fetchJson(url: string, retries = 5, baseDelay = 3000): Promise<any> {
    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (!res.ok) {
                if (res.status === 404) return null;
                throw new Error(`HTTP ${res.status}`);
            }
            return await res.json();
        } catch (error: any) {
            clearTimeout(timeout);
            console.warn(`[PERFIL SYNC] Erro ao buscar ${url}: ${error.message}. Tentativa ${i + 1} de ${retries}...`);
            if (i === retries - 1) return null;
            await new Promise(resolve => setTimeout(resolve, baseDelay * (i + 1))); // Exponential backoff
        }
    }
    return null;
}

async function scrapeGabinete(idDeputado: number) {
    const anoAtual = new Date().getFullYear();
    const url = `https://www.camara.leg.br/deputados/${idDeputado}/pessoal-gabinete?ano=${anoAtual}`;
    try {
        const res = await fetch(url, {
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

async function processarCotaCEAP(dep: any, anoAtual: number, mesAtual: number) {
    const teto = COTA_POR_UF[dep.siglaUf] || 40000;
    
    const { data: gastos, error } = await supabasePrincipal
        .from('ceap_despesas_cache')
        .select('tipo_despesa, valor_documento, data_documento')
        .eq('id_deputado', dep.id)
        .eq('ano', anoAtual);
        
    if (error) {
        console.error("Erro ao buscar CEAP no DB Principal:", error.message);
        return;
    }

    const batch = [];
    for (let m = 1; m <= 12; m++) {
        // Ignora meses futuros do ano atual
        if (anoAtual === new Date().getFullYear() && m > mesAtual) break;
        
        let valorGasto = 0;
        const fatias: Record<string, number> = {};
        
        if (gastos && gastos.length > 0) {
            for (const g of gastos) {
                if (g.data_documento) {
                    const docMonth = new Date(g.data_documento).getMonth() + 1;
                    if (docMonth === m) {
                        valorGasto += Number(g.valor_documento);
                        const tipo = g.tipo_despesa || 'Outros';
                        fatias[tipo] = (fatias[tipo] || 0) + Number(g.valor_documento);
                    }
                }
            }
        }

        // Para evitar encher o banco de perfis com meses zerados de anos anteriores,
        // só adicionamos ao batch se houver gasto OU se for o mês corrente (para pelo menos mostrar algo no mês atual)
        if (valorGasto > 0 || m === mesAtual) {
            batch.push({
                deputado_id: dep.id,
                mes_referencia: m,
                ano_referencia: anoAtual,
                valor_teto: teto,
                valor_gasto: valorGasto,
                fatias_json: fatias,
                atualizado_em: new Date().toISOString()
            });
        }
    }

    if (batch.length > 0) {
        await supabasePerfil.from('camara_cota_resumo_cache').upsert(
            batch,
            { onConflict: 'deputado_id, ano_referencia, mes_referencia' }
        );
    }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    console.log("[PERFIL SYNC] Iniciando sincronização de perfil completa...");
    
    // Código original mantido limpo

    try {
        console.log("[PERFIL SYNC] Buscando lista de deputados...");
        const depsReq = await fetchJson(`${API_BASE}/deputados`);
        let deputados = depsReq.dados;
        console.log(`[PERFIL SYNC] Encontrados ${deputados.length} deputados.`);

        const dataAtual = new Date();
        const anoAtual = dataAtual.getFullYear();
        const mesAtual = dataAtual.getMonth() + 1;

        let count = 0;
        for (const dep of deputados) {
            count++;
            console.log(`[${count}/${deputados.length}] Sincronizando deputado ID ${dep.id} (${dep.nome})...`);
            
            const depDetailReq = await fetchJson(`${API_BASE}/deputados/${dep.id}`);
            const nomeCivil = depDetailReq?.dados?.nomeCivil || dep.nome;
            const nomeEleitoral = depDetailReq?.dados?.ultimoStatus?.nomeEleitoral || dep.nome;

            const frentesReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/frentes`);
            const frentes = frentesReq?.dados?.map((f: any) => f.titulo) || [];
            
            const orgaosReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/orgaos`);
            const comissoes = orgaosReq?.dados?.map((o: any) => o.nomeOrgao) || [];

            const profsReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/profissoes`);
            const profissoes = profsReq?.dados?.map((p: any) => p.titulo) || [];

            await supabasePerfil.from('camara_perfil_politico_cache').upsert(
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

            console.log(`  - Extraindo servidores do gabinete (Scraping)...`);
            const servidores = await scrapeGabinete(dep.id);
            if (servidores.length > 0) {
                await supabasePerfil.from('camara_servidores_gabinete').delete().eq('deputado_id', dep.id);
                await supabasePerfil.from('camara_servidores_gabinete').insert(servidores);
                console.log(`  - ${servidores.length} servidores inseridos.`);
            } else {
                console.log(`  - Nenhum servidor encontrado.`);
            }

            console.log(`  - Processando resumo da CEAP do DB Principal...`);
            await processarCotaCEAP(dep, anoAtual, mesAtual);
            console.log(`  - Cota CEAP consolidada.`);

            await delay(500); 
        }

        console.log("[PERFIL SYNC] Finalizado com sucesso!");
    } catch (error) {
        console.error("[PERFIL SYNC] Erro fatal:", error);
        process.exit(1);
    }
}

run();
