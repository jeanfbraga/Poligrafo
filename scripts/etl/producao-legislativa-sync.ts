import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2';
const BATCH_SIZE = 100;

async function fetchJson(url: string, retries = 4, delayMs = 2000): Promise<any> {
    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
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
        } catch (err: any) {
            clearTimeout(timeout);
            console.warn(`[PRODUCAO LEGISLATIVA] Erro ao buscar ${url}: ${err.message}. Tentativa ${i + 1} de ${retries}...`);
            if (i === retries - 1) return null;
            await delay(delayMs * (i + 1));
        }
    }
    return null;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    console.log("[PRODUCAO LEGISLATIVA SYNC] Iniciando sincronização otimizada...");
    const anoAtual = new Date().getFullYear();
    
    try {
        console.log("[PRODUCAO LEGISLATIVA SYNC] Buscando lista de deputados...");
        const depsReq = await fetchJson(`${API_BASE}/deputados`);
        const deputados = depsReq?.dados || [];
        
        if (deputados.length === 0) {
            console.warn("[PRODUCAO LEGISLATIVA SYNC] Nenhum deputado retornado da API da Câmara. Abortando com segurança.");
            return;
        }

        console.log(`[PRODUCAO LEGISLATIVA SYNC] Encontrados ${deputados.length} deputados.`);

        // Processamento em lotes concorrentes controlados (5 deputados em paralelo)
        const CONCORRENCIA = 5;
        let count = 0;

        for (let i = 0; i < deputados.length; i += CONCORRENCIA) {
            const chunk = deputados.slice(i, i + CONCORRENCIA);

            await Promise.allSettled(chunk.map(async (dep: any) => {
                count++;
                const depIndex = count;
                
                // Buscar proposições de todo o mandato atual (57ª Legislatura - a partir de 2023)
                let anosQuery = '';
                for (let ano = 2023; ano <= anoAtual; ano++) {
                    anosQuery += `&ano=${ano}`;
                }
                const urlProposicoes = `${API_BASE}/proposicoes?idDeputadoAutor=${dep.id}${anosQuery}&itens=100&ordem=DESC&ordenarPor=ano`;
                
                try {
                    const data = await fetchJson(urlProposicoes);
                    const proposicoes = data?.dados || [];
                    
                    if (proposicoes.length > 0) {
                        const payload = proposicoes.map((prop: any) => ({
                            id_deputado: dep.id,
                            id_proposicao: String(prop.id),
                            tipo: prop.siglaTipo || "PROP",
                            numero: prop.numero || 0,
                            ano: prop.ano || anoAtual,
                            titulo: `${prop.siglaTipo || "PROP"} ${prop.numero || 0}/${prop.ano || anoAtual}`,
                            ementa: prop.ementa || "Sem ementa informada",
                            texto_integral: prop.urlInteiroTeor || prop.uri || null,
                            data_apresentacao: prop.dataApresentacao || null
                        }));

                        const { error } = await supabaseAdmin.from('camara_producao_legislativa').upsert(
                            payload,
                            { onConflict: 'id_deputado,id_proposicao' }
                        );

                        if (error) {
                            console.error(`  [${depIndex}/${deputados.length}] Erro ao salvar deputado ${dep.nome}:`, error.message);
                        } else {
                            console.log(`  [${depIndex}/${deputados.length}] ✅ ${dep.nome}: ${payload.length} proposições salvas.`);
                        }
                    } else {
                        console.log(`  [${depIndex}/${deputados.length}] ℹ️ ${dep.nome}: 0 proposições.`);
                    }
                } catch (err: any) {
                    console.error(`  [${depIndex}/${deputados.length}] ❌ Erro ao buscar deputado ${dep.nome}:`, err.message);
                }
            }));

            await delay(300); // Rate limit suave entre lotes
        }

        console.log("[PRODUCAO LEGISLATIVA SYNC] Finalizado com sucesso!");
    } catch (error) {
        console.error("[PRODUCAO LEGISLATIVA SYNC] Erro fatal:", error);
        process.exit(1);
    }
}

run();
