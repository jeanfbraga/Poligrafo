import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { pathToFileURL } from 'node:url';
import { fetchCamaraJson as fetchJson, exigirDeputados } from './camara-http';

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function extrairTextoIntegral(prop: any): string | null {
    if (prop.urlInteiroTeor) return prop.urlInteiroTeor;
    if (prop.uri) return prop.uri;
    return null;
}

function mapearProposicao(prop: any, depId: number, anoAtual: number) {
    const tipo = prop.siglaTipo || "PROP";
    const numero = prop.numero || 0;
    const ano = prop.ano || anoAtual;
    const ementa = prop.ementa || "Sem ementa informada";
    const titulo = `${tipo} ${numero}/${ano}`;

    return {
        id_deputado: depId,
        id_proposicao: String(prop.id),
        tipo,
        numero,
        ano,
        titulo,
        ementa,
        texto_integral: extrairTextoIntegral(prop),
        data_apresentacao: prop.dataApresentacao || null
    };
}

export async function run() {
    console.log("[PRODUCAO LEGISLATIVA SYNC] Iniciando sincronização otimizada...");
    const anoAtual = new Date().getFullYear();
    
    try {
        console.log("[PRODUCAO LEGISLATIVA SYNC] Buscando lista completa de deputados da 57ª Legislatura...");
        const depsReq = await fetchJson(`${API_BASE}/deputados?idLegislatura=57&itens=1000`);
        const deputados = exigirDeputados(depsReq);

        console.log(`[PRODUCAO LEGISLATIVA SYNC] Encontrados ${deputados.length} deputados.`);

        // Processamento em lotes concorrentes controlados (5 deputados em paralelo)
        const CONCORRENCIA = 5;
        let count = 0;
        let falhas = 0;

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
                        const payload = proposicoes.map((prop: any) => mapearProposicao(prop, dep.id, anoAtual));

                        const { error } = await supabaseAdmin.from('camara_producao_legislativa').upsert(
                            payload,
                            { onConflict: 'id_deputado,id_proposicao' }
                        );

                        if (error) {
                            falhas++;
                            console.error(`  [${depIndex}/${deputados.length}] ⚠️ Erro ao gravar ${dep.nome}: ${error.message}`);
                        }
                    } else {
                        console.log(`  [${depIndex}/${deputados.length}] ℹ️ ${dep.nome}: 0 proposições.`);
                    }
                } catch (err: any) {
                    falhas++;
                    console.error(`  [${depIndex}/${deputados.length}] ❌ Erro ao buscar deputado ${dep.nome}:`, err.message);
                }
            }));

            await delay(300); // Rate limit suave entre lotes
        }

        const limiteToleravel = Math.max(10, Math.ceil(deputados.length * 0.02));
        if (falhas > limiteToleravel) {
            throw new Error(`Produção legislativa incompleta: ${falhas} deputados com falha (limite tolerável: ${limiteToleravel}).`);
        }
        if (falhas > 0) {
            console.warn(`[PRODUCAO LEGISLATIVA SYNC] Finalizado com ${falhas} falha(s) tolerada(s) de ${deputados.length} deputados.`);
        } else {
            console.log("[PRODUCAO LEGISLATIVA SYNC] Finalizado com sucesso!");
        }
    } catch (error) {
        console.error("[PRODUCAO LEGISLATIVA SYNC] Erro fatal:", error);
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    run().catch(() => { process.exitCode = 1; });
}
