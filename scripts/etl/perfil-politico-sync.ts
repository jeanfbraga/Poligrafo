import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2';

async function fetchJson(url: string) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    console.log("[PERFIL SYNC] Iniciando sincronização de perfil (Frentes, Comissões, Profissões)...");
    
    try {
        // 1. Pegar lista de todos os deputados ativos
        console.log("[PERFIL SYNC] Buscando lista de deputados...");
        const depsReq = await fetchJson(`${API_BASE}/deputados`);
        const deputados = depsReq.dados;
        console.log(`[PERFIL SYNC] Encontrados ${deputados.length} deputados.`);

        let count = 0;
        for (const dep of deputados) {
            count++;
            console.log(`[${count}/${deputados.length}] Sincronizando deputado ID ${dep.id} (${dep.nome})...`);
            
            // Buscar Frentes Parlamentares
            const frentesReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/frentes`);
            const frentes = frentesReq?.dados?.map((f: any) => f.titulo) || [];
            
            // Buscar Órgãos / Comissões
            const orgaosReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/orgaos`);
            const comissoes = orgaosReq?.dados?.map((o: any) => o.nomeOrgao) || [];

            // Buscar Profissões
            const profsReq = await fetchJson(`${API_BASE}/deputados/${dep.id}/profissoes`);
            const profissoes = profsReq?.dados?.map((p: any) => p.titulo) || [];

            // Salvar no Supabase (UPSERT)
            const { error } = await supabaseAdmin.from('camara_perfil_politico_cache').upsert(
                {
                    id_deputado: dep.id,
                    partido: dep.siglaPartido,
                    uf: dep.siglaUf,
                    frentes,
                    comissoes,
                    profissoes,
                    data_atualizacao: new Date().toISOString()
                },
                { onConflict: 'id_deputado' }
            );

            if (error) {
                console.error(`[PERFIL SYNC] Erro ao salvar deputado ${dep.id}:`, error.message);
            }

            // Respeitar Rate Limit da Câmara (max ~5 req/seg)
            await delay(500); 
        }

        console.log("[PERFIL SYNC] Finalizado com sucesso!");
    } catch (error) {
        console.error("[PERFIL SYNC] Erro fatal:", error);
    }
}

run();
