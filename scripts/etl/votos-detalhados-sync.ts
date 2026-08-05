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
const BATCH_SIZE = 500;

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
    console.log("[VOTOS DETALHADOS SYNC] Iniciando sincronização do Ano Legislativo Atual...");
    
    // Filtro pelo ano atual
    const anoAtual = new Date().getFullYear();
    const dataInicio = `${anoAtual}-02-01`;
    const dataFim = `${anoAtual}-12-31`;

    try {
        let urlVotacoes = `${API_BASE}/votacoes?dataInicio=${dataInicio}&dataFim=${dataFim}&itens=100&ordem=ASC&ordenarPor=dataHoraRegistro`;
        let count = 0;
        
        while (urlVotacoes) {
            console.log(`[VOTOS DETALHADOS SYNC] Buscando votacoes: ${urlVotacoes}`);
            const data = await fetchJson(urlVotacoes);
            const votacoes = data.dados || [];

            for (const votacao of votacoes) {
                count++;
                console.log(`[${count}] Processando Votação ${votacao.id} - ${votacao.descricao}`);
                
                // Buscar detalhes da proposição se houver
                let projeto_nome = votacao.descricao || "Votação sem nome";
                let projeto_tema = "Não especificado";
                
                // Em votacoes/{id} temos a proposicao (id, siglaTipo, numero, ano)
                try {
                    const votDetalheReq = await fetchJson(`${API_BASE}/votacoes/${votacao.id}`);
                    if (votDetalheReq && votDetalheReq.dados && votDetalheReq.dados.proposicao) {
                        const prop = votDetalheReq.dados.proposicao;
                        projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano}`;
                    }
                } catch (e) {
                    console.log(`  - Falha ao buscar detalhes da votação ${votacao.id}`);
                }

                // Buscar os votos dos deputados
                const votosReq = await fetchJson(`${API_BASE}/votacoes/${votacao.id}/votos`);
                const votosLista = votosReq?.dados || [];
                
                console.log(`  - Encontrados ${votosLista.length} votos nominais.`);
                
                if (votosLista.length > 0) {
                    const payload = votosLista.map((v: any) => ({
                        id_deputado: v.deputado_.id,
                        id_votacao: votacao.id,
                        projeto_nome,
                        projeto_tema,
                        voto: v.tipoVoto,
                        data_votacao: votacao.dataHoraRegistro
                    }));

                    // Inserir em lotes usando UPSERT
                    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                        const batch = payload.slice(i, i + BATCH_SIZE);
                        const { error } = await supabaseAdmin.from('camara_votos_detalhados').upsert(
                            batch,
                            { onConflict: 'id_deputado,id_votacao' }
                        );
                        if (error) {
                            console.error(`  - Erro ao salvar lote de votos:`, error.message);
                        }
                    }
                }

                await delay(300); // Rate limit respect
            }

            const nextLink = data.links?.find((l: any) => l.rel === 'next');
            urlVotacoes = nextLink ? nextLink.href : null;
        }

        console.log("[VOTOS DETALHADOS SYNC] Finalizado com sucesso!");
    } catch (error) {
        console.error("[VOTOS DETALHADOS SYNC] Erro fatal:", error);
    }
}

run();
