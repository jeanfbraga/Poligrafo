/**
 * Sincronização de Metadados Estendidos de Projetos (Autores, Tramitações e Situação)
 * 
 * Este ETL escaneia as tabelas `camara_producao_legislativa` e `camara_votacoes_master`
 * e preenche o cache `camara_proposicoes_detalhes_cache` com todos os projetos.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { pathToFileURL } from 'node:url';
import { fetchCamaraJson } from './camara-http';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Erro: Credenciais do Supabase ausentes em .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url: string): Promise<any> {
    const json = await fetchCamaraJson(url);
    return json?.dados ?? null;
}

export async function run() {
    console.log("\n[PROPOSICOES DETALHES SYNC] Iniciando atualização do cache estendido de projetos...");

    // 1. Levantar todos os projetos votados e de autoria (ID das proposições)
    console.log("Coletando IDs de projetos da produção legislativa...");
    const { data: producao, error: producaoError } = await supabase.from('camara_producao_legislativa').select('id_proposicao, titulo');
    if (producaoError) throw new Error(`Falha ao consultar produção: ${producaoError.message}`);
    
    console.log("Coletando IDs de projetos votados...");
    const { data: votacoes, error: votacoesError } = await supabase.from('camara_votacoes_master').select('id_proposicao').not('id_proposicao', 'is', null);
    if (votacoesError) throw new Error(`Falha ao consultar votações: ${votacoesError.message}`);

    const proposicoesSet = new Set<string>();
    producao?.forEach(p => proposicoesSet.add(p.id_proposicao));
    votacoes?.forEach(v => proposicoesSet.add(v.id_proposicao));

    const totalIds = Array.from(proposicoesSet);
    console.log(`\nTotal de projetos únicos encontrados: ${totalIds.length}`);

    // Verificar quais já estão no cache
    const { data: cached, error: cacheError } = await supabase.from('camara_proposicoes_detalhes_cache').select('id_proposicao');
    if (cacheError) throw new Error(`Falha ao consultar cache: ${cacheError.message}`);
    const cachedIds = new Set(cached?.map(c => c.id_proposicao) || []);

    const missingIds = totalIds.filter(id => !cachedIds.has(id));
    console.log(`Projetos já cacheados: ${cachedIds.size}`);
    console.log(`Projetos faltando (serão processados): ${missingIds.length}\n`);

    let falhas = 0;
    for (let i = 0; i < missingIds.length; i++) {
        const idProp = missingIds[i];
        console.log(`[${i + 1}/${missingIds.length}] Processando Proposição ${idProp}...`);

        try {
            // 2. Buscar detalhes principais
            const detalhes = await fetchJson(`${API_BASE}/proposicoes/${idProp}`);
            if (!detalhes) {
                console.log(`  - ❌ Proposição ${idProp} não encontrada na API da Câmara.`);
                continue;
            }

            // 3. Buscar autores
            const autores = await fetchJson(`${API_BASE}/proposicoes/${idProp}/autores`);
            
            // 4. Buscar tramitações
            const tramitacoes = await fetchJson(`${API_BASE}/proposicoes/${idProp}/tramitacoes`);

            const status = detalhes.statusProposicao || {};

            const record = {
                id_proposicao: idProp.toString(),
                sigla_tipo: detalhes.siglaTipo,
                numero: detalhes.numero,
                ano: detalhes.ano,
                titulo: `${detalhes.siglaTipo} ${detalhes.numero}/${detalhes.ano}`,
                ementa: detalhes.ementa || "Sem ementa",
                texto_integral: detalhes.urlInteiroTeor || null,
                data_apresentacao: detalhes.dataApresentacao,
                autores_json: autores || [],
                tramitacoes_json: tramitacoes || [],
                situacao: status.descricaoSituacao || null,
                despacho: status.despacho || null,
                regime: status.regime || null,
                apreciacao: status.apreciacao || null,
                atualizado_em: new Date().toISOString()
            };

            const { error: upsertError } = await supabase
                .from('camara_proposicoes_detalhes_cache')
                .upsert(record);

            if (upsertError) {
                falhas++;
                console.error(`  - ❌ Erro ao salvar ${idProp} no Supabase:`, upsertError.message);
            } else {
                console.log(`  - ✅ Salvo com sucesso (${record.titulo}).`);
            }
        } catch (e: any) {
            falhas++;
            console.error(`  - ❌ Erro inesperado no processamento do projeto ${idProp}:`, e.message);
        }

        // Respeitar Rate Limit da Câmara (max ~3 requisições simultâneas por prop)
        await sleep(500); 
    }

    if (falhas > 0) throw new Error(`Detalhes de proposições incompletos: ${falhas} projetos com falha.`);
    console.log("\n[PROPOSICOES DETALHES SYNC] Finalizado com sucesso!");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    run().catch(error => {
        console.error('[PROPOSICOES DETALHES SYNC] Erro fatal:', error);
        process.exitCode = 1;
    });
}
