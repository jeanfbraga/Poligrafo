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
    console.log("[VOTACOES SYNC] Iniciando sincronização via API V2 (últimos 90 dias)...");
    
    const today = new Date();
    const past90 = new Date();
    past90.setDate(today.getDate() - 90);

    const dataFim = today.toISOString().split('T')[0];
    const dataInicio = past90.toISOString().split('T')[0];

    try {
        let urlVotacoes = `${API_BASE}/votacoes?dataInicio=${dataInicio}&dataFim=${dataFim}&itens=100&ordem=ASC&ordenarPor=dataHoraRegistro`;
        let todasVotacoes: any[] = [];
        
        while (urlVotacoes) {
            console.log(`[VOTACOES SYNC] Buscando votacoes: ${urlVotacoes}`);
            const data = await fetchJson(urlVotacoes);
            
            todasVotacoes.push(...data.dados);

            const nextLink = data.links?.find((l: any) => l.rel === 'next');
            urlVotacoes = nextLink ? nextLink.href : null;
            
            // Safety break
            if (todasVotacoes.length > 500) break;
        }

        console.log(`[VOTACOES SYNC] ${todasVotacoes.length} votações encontradas nos últimos 90 dias.`);

        if (todasVotacoes.length === 0) {
            console.log("[VOTACOES SYNC] Nenhuma votação encontrada. Finalizando.");
            return;
        }

        const stats: Record<number, { id_deputado: number; votos_registrados: number; ausencias_em_votacoes: number }> = {};
        
        for (const votacao of todasVotacoes) {
            try {
                const urlVotos = `${API_BASE}/votacoes/${votacao.id}/votos`;
                const votos = await fetchJson(urlVotos);
                
                for (const v of votos.dados) {
                    const idDeputado = v.deputado_.id;
                    const tipoVoto = v.tipoVoto; // "Sim", "Não", "Abstenção", "Ausente", etc

                    if (!stats[idDeputado]) {
                        stats[idDeputado] = {
                            id_deputado: idDeputado,
                            votos_registrados: 0,
                            ausencias_em_votacoes: 0
                        };
                    }

                    if (tipoVoto === 'Ausente' || tipoVoto === 'Abstenção') {
                        stats[idDeputado].ausencias_em_votacoes += 1;
                    } else {
                        stats[idDeputado].votos_registrados += 1;
                    }
                }
                
                await new Promise(r => setTimeout(r, 200)); // Rate limit 
            } catch (e: any) {
                console.error(`[VOTACOES SYNC] Erro ao buscar votos da votação ${votacao.id}:`, e.message);
            }
        }

        const anoAtual = today.getFullYear();
        const batch = Object.values(stats).map(s => ({
            ...s,
            ano: anoAtual
        }));

        console.log(`[VOTACOES SYNC] Gravando ${batch.length} registros no Supabase...`);
        await supabaseAdmin.from('camara_votacoes').delete().eq('ano', anoAtual);
        
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
            const { error } = await supabaseAdmin.from('camara_votacoes').insert(batch.slice(i, i + BATCH_SIZE));
            if (error) console.error("[VOTACOES SYNC] Erro ao inserir:", error.message);
        }

        console.log("[VOTACOES SYNC] Concluído com sucesso!");

    } catch (error: any) {
        console.error("[VOTACOES SYNC] Erro fatal:", error.message);
    }
}

run().catch(console.error);
