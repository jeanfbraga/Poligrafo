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
const BATCH_SIZE = 1000;

async function fetchJson(url: string) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function run() {
    console.log("[FREQUENCIA SYNC] Iniciando sincronização via API V2 (últimos 90 dias)...");
    
    const today = new Date();
    const past90 = new Date();
    past90.setDate(today.getDate() - 90);

    const dataFim = today.toISOString().split('T')[0];
    const dataInicio = past90.toISOString().split('T')[0];

    try {
        // Busca Sessões Deliberativas (codTipoEvento=1 ou codTipoEvento=2) no Plenário
        let urlEventos = `${API_BASE}/eventos?dataInicio=${dataInicio}&dataFim=${dataFim}&itens=100&ordem=ASC&ordenarPor=dataHoraInicio`;
        let todosEventos: any[] = [];
        
        while (urlEventos) {
            console.log(`[FREQUENCIA SYNC] Buscando eventos: ${urlEventos}`);
            const data = await fetchJson(urlEventos);
            
            // Filtrar apenas sessões deliberativas da casa (Plenário) que já encerraram
            const sessoes = data.dados.filter((e: any) => 
                e.situacao === 'Encerrada' &&
                e.descricaoTipo && e.descricaoTipo.toLowerCase().includes('deliberativa')
            );
            
            todosEventos.push(...sessoes);

            const nextLink = data.links?.find((l: any) => l.rel === 'next');
            urlEventos = nextLink ? nextLink.href : null;
            
            // Safety break
            if (todosEventos.length > 500) break;
        }

        console.log(`[FREQUENCIA SYNC] ${todosEventos.length} sessões deliberativas encontradas nos últimos 90 dias.`);

        if (todosEventos.length === 0) {
            console.log("[FREQUENCIA SYNC] Nenhum evento encontrado. Finalizando.");
            return;
        }

        // Puxa lista base de todos os deputados ativos
        console.log("[FREQUENCIA SYNC] Buscando lista de deputados ativos...");
        const deps = await fetchJson(`${API_BASE}/deputados?itens=600`);
        const ativos = deps.dados;

        const stats: Record<number, { id_deputado: number; presencas: number; ausencias_nao_justificadas: number }> = {};
        
        for (const dep of ativos) {
            stats[dep.id] = {
                id_deputado: dep.id,
                presencas: 0,
                ausencias_nao_justificadas: 0
            };
        }

        // Contabiliza presenças iterando evento a evento
        for (const evento of todosEventos) {
            try {
                const urlDeputados = `${API_BASE}/eventos/${evento.id}/deputados`;
                const presentes = await fetchJson(urlDeputados);
                
                const presentesIds = new Set(presentes.dados.map((d: any) => d.id));
                
                for (const dep of ativos) {
                    if (presentesIds.has(dep.id)) {
                        stats[dep.id].presencas += 1;
                    } else {
                        // Como não temos justificativa via V2 facilmente, contamos como falta para estimativa
                        stats[dep.id].ausencias_nao_justificadas += 1;
                    }
                }
                // Delay para não estourar rate limit da câmara (que é meio chato)
                await new Promise(r => setTimeout(r, 200));
            } catch (e: any) {
                console.error(`[FREQUENCIA SYNC] Erro ao buscar presenças do evento ${evento.id}:`, e.message);
            }
        }

        const anoAtual = today.getFullYear();
        const batch = Object.values(stats).map(s => ({
            ...s,
            ano: anoAtual
        }));

        console.log(`[FREQUENCIA SYNC] Gravando ${batch.length} registros no Supabase...`);
        await supabaseAdmin.from('camara_frequencia').delete().eq('ano', anoAtual);
        
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
            const { error } = await supabaseAdmin.from('camara_frequencia').insert(batch.slice(i, i + BATCH_SIZE));
            if (error) console.error("[FREQUENCIA SYNC] Erro ao inserir:", error.message);
        }

        console.log("[FREQUENCIA SYNC] Concluído com sucesso!");

    } catch (error: any) {
        console.error("[FREQUENCIA SYNC] Erro fatal:", error.message);
    }
}

run().catch(console.error);
