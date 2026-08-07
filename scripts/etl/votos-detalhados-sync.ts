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
    const anoAtual = 2024; // Fixo em 2024 para garantir dados da API
    const dataInicio = `${anoAtual}-05-01`;
    const dataFim = `${anoAtual}-05-31`;

    try {
        let urlVotacoes = `${API_BASE}/votacoes?dataInicio=${dataInicio}&dataFim=${dataFim}&itens=100&ordem=ASC&ordenarPor=dataHoraRegistro`;
        let count = 0;
        
        while (urlVotacoes) {
            console.log(`[VOTOS DETALHADOS SYNC] Buscando votacoes: ${urlVotacoes}`);
            const data = await fetchJson(urlVotacoes);
            const votacoes = data.dados || [];

            // 1. Verificar quais votações já existem no banco (Delta Sync)
            const idsVotacoes = votacoes.map((v: any) => v.id);
            const { data: votacoesExistentes, error: errExistentes } = await supabaseAdmin
                .from('camara_votacoes_master')
                .select('id_votacao')
                .in('id_votacao', idsVotacoes);

            if (errExistentes) {
                console.error("Erro ao verificar votações existentes:", errExistentes);
                continue;
            }

            const idsExistentes = new Set(votacoesExistentes?.map((v: any) => v.id_votacao) || []);
            const votacoesNovas = votacoes.filter((v: any) => !idsExistentes.has(v.id));

            console.log(`  - ${votacoes.length} votações na página, ${votacoesNovas.length} novas.`);

            for (const votacao of votacoesNovas) {
                count++;
                console.log(`[${count}] Processando NOVA Votação ${votacao.id} - ${votacao.descricao}`);
                
                let projeto_nome = votacao.descricao || "Votação sem nome";
                let projeto_tema = "Não especificado";
                let id_proposicao = null;
                
                try {
                    const votDetalheReq = await fetchJson(`${API_BASE}/votacoes/${votacao.id}`);
                    if (votDetalheReq && votDetalheReq.dados) {
                        const dados = votDetalheReq.dados;
                        if (dados.proposicao) {
                            const prop = dados.proposicao;
                            projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano}`;
                            projeto_tema = prop.ementa || projeto_tema;
                            id_proposicao = prop.id;
                        } else if (dados.proposicoesAfetadas && dados.proposicoesAfetadas.length > 0) {
                            const prop = dados.proposicoesAfetadas[0];
                            const descCurta = votacao.descricao ? votacao.descricao.split(/\.\s*Sim:/i)[0] : "";
                            projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano} - ${descCurta}`;
                            projeto_tema = prop.ementa || projeto_tema;
                            id_proposicao = prop.id;
                        } else if (dados.objetosPossiveis && dados.objetosPossiveis.length > 0) {
                            const prop = dados.objetosPossiveis[0];
                            const descCurta = votacao.descricao ? votacao.descricao.split(/\.\s*Sim:/i)[0] : "";
                            projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano} - ${descCurta}`;
                            projeto_tema = prop.ementa || projeto_tema;
                            id_proposicao = prop.id;
                        }
                    }
                } catch (e) {
                    console.log(`  - Falha ao buscar detalhes da votação ${votacao.id}`);
                }

                // Buscar os votos dos deputados
                const votosReq = await fetchJson(`${API_BASE}/votacoes/${votacao.id}/votos`);
                const votosLista = votosReq?.dados || [];
                
                console.log(`  - Encontrados ${votosLista.length} votos nominais.`);
                
                if (votosLista.length > 0) {
                    // 1. Salvar na Tabela Master
                    const { error: errMaster } = await supabaseAdmin.from('camara_votacoes_master').upsert({
                        id_votacao: votacao.id,
                        id_proposicao,
                        projeto_nome,
                        projeto_tema,
                        data_votacao: votacao.dataHoraRegistro
                    });

                    if (errMaster) {
                        console.error(`  - Erro ao salvar na Master:`, errMaster.message);
                        continue; // Não salva os votos se não salvou a votação
                    }

                    // 2. Salvar os Votos Enxutos
                    const payload = votosLista.map((v: any) => ({
                        id_deputado: v.deputado_.id,
                        id_votacao: votacao.id,
                        voto: v.tipoVoto
                    }));

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
        process.exit(1);
    }
}

run();
