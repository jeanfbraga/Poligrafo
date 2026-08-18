#!/usr/bin/env tsx
/**
 * ETL: Votações e Votos Detalhados da Câmara Federal → camara_votacoes_master & camara_votos_detalhados
 * 
 * Estratégia Híbrida de Alta Performance:
 * 1. Bulk CSV (Dumps Oficiais): Baixa votacoes-{ano}.csv e votacoesVotos-{ano}.csv dos Dados Abertos
 *    e processa milhares de votos em streaming em poucos segundos (< 1 min para a legislatura inteira).
 * 2. Delta API Incremental: Para capturar as votações dos últimos 15 dias ainda não consolidadas
 *    nos arquivos diários, consulta a API REST v2 de forma cirúrgica.
 * 
 * Uso:
 *   npx tsx scripts/etl/votos-detalhados-sync.ts               # Ano corrente + Delta incremental
 *   npx tsx scripts/etl/votos-detalhados-sync.ts --ano 2024   # Apenas ano específico via CSV
 *   npx tsx scripts/etl/votos-detalhados-sync.ts --todos      # Toda a 57ª Legislatura (2023 a 2026)
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase (URL ou SERVICE_ROLE_KEY).");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const API_BASE = 'https://dadosabertos.camara.leg.br/api/v2';
const ARQUIVOS_BASE = 'https://dadosabertos.camara.leg.br/arquivos';
const BATCH_SIZE = 1000;
const ANO_INICIO_LEGISLATURA = 2023; // 57ª Legislatura
const ANO_ATUAL = new Date().getFullYear();

async function fetchWithRetry(url: string, retries = 5): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 35000);
        try {
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json, text/csv, */*' },
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (res.ok) return res;
            if (res.status === 404) return res;
            if (res.status >= 500 && i < retries - 1) {
                const wait = (i + 1) * 3000;
                console.warn(`  - HTTP ${res.status} em ${url}. Tentando novamente em ${wait / 1000}s...`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            throw new Error(`HTTP ${res.status}`);
        } catch (e: any) {
            clearTimeout(timeout);
            if (i === retries - 1) throw e;
            const wait = (i + 1) * 3000;
            console.warn(`  - Erro de rede (${e.message}). Tentativa ${i + 1}/${retries} em ${wait / 1000}s...`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
    throw new Error(`Falha após ${retries} tentativas: ${url}`);
}

async function carregarDeputadosValidos(): Promise<Set<number>> {
    const { data: cacheIds, error: cacheErr } = await supabaseAdmin
        .from('camara_perfil_politico_cache')
        .select('id_deputado');

    if (cacheErr) {
        console.warn("[VOTOS SYNC] Aviso ao buscar cache de perfis:", cacheErr.message);
        return new Set();
    }
    const valid = new Set(cacheIds?.map(d => Number(d.id_deputado)) || []);
    console.log(`[VOTOS SYNC] ${valid.size} deputados válidos carregados do cache.`);
    return valid;
}

/**
 * Extrai nome legível do projeto a partir da descrição da votação
 */
function extrairProjetoNome(descricao: string | undefined | null, idVotacao: string): string {
    if (!descricao) return `Votação ${idVotacao}`;
    const desc = descricao.trim();
    
    // Tenta encontrar padrões como "PL 1234/2023", "PEC 45/2019", "MPV 1154/2023", "PLP 93/2023"
    const matchProp = desc.match(/\b(PL|PEC|PLP|MPV|PDL|PDC|REQ|RIC|REP|PRC)\s*[-nºNº]?\s*(\d+)\s*\/\s*(\d{4})\b/i);
    if (matchProp) {
        return `${matchProp[1].toUpperCase()} ${matchProp[2]}/${matchProp[3]}`;
    }
    
    // Se não tiver sigla direta, trunca a descrição inicial antes de "Sim:" ou "Não:"
    const descCurta = desc.split(/\.\s*(Sim|Não|Obstrução):/i)[0];
    if (descCurta.length > 180) {
        return descCurta.substring(0, 177) + "...";
    }
    return descCurta || `Votação ${idVotacao}`;
}

/**
 * Processa um ano inteiro a partir dos arquivos CSV oficiais da Câmara
 */
async function processarAnoCSV(ano: number, validDeputados: Set<number>): Promise<{ votacoesCount: number; votosCount: number }> {
    console.log(`\n=============================================================`);
    console.log(`[VOTOS SYNC] 📦 Processando DUMP CSV da Câmara para o Ano: ${ano}`);
    console.log(`=============================================================`);

    const votacoesUrl = `${ARQUIVOS_BASE}/votacoes/csv/votacoes-${ano}.csv`;
    const votosUrl = `${ARQUIVOS_BASE}/votacoesVotos/csv/votacoesVotos-${ano}.csv`;

    // 1. Download e parsing do CSV de Votações (Metadados)
    console.log(`[VOTOS SYNC] Baixando metadados de votações: ${votacoesUrl}`);
    const vRes = await fetchWithRetry(votacoesUrl);
    if (!vRes.ok) {
        console.warn(`[VOTOS SYNC] Arquivo de votações para ${ano} não encontrado (HTTP ${vRes.status}).`);
        return { votacoesCount: 0, votosCount: 0 };
    }

    const vCsvText = await vRes.text();
    const parserVotacoes = parse(vCsvText, {
        delimiter: ';',
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    const votacoesMasterMap = new Map<string, {
        id_votacao: string;
        id_proposicao: number | null;
        projeto_nome: string;
        projeto_tema: string;
        data_votacao: string;
    }>();

    for await (const row of parserVotacoes) {
        const idVotacao = row.id?.trim();
        if (!idVotacao) continue;

        const dataVotacao = row.dataHoraRegistro || row.data || `${ano}-01-01T00:00:00`;
        const propIdNum = parseInt(row.ultimaApresentacaoProposicao_idProposicao, 10);
        const id_proposicao = isNaN(propIdNum) || propIdNum <= 0 ? null : propIdNum;
        const descricao = row.descricao || row.ultimaApresentacaoProposicao_descricao || "";
        const projeto_nome = extrairProjetoNome(descricao, idVotacao);

        votacoesMasterMap.set(idVotacao, {
            id_votacao: idVotacao,
            id_proposicao,
            projeto_nome,
            projeto_tema: descricao || "Votação em Plenário",
            data_votacao: dataVotacao
        });
    }

    console.log(`[VOTOS SYNC] ${votacoesMasterMap.size} votações carregadas do CSV para ${ano}.`);

    // 2. Salvar Votações Master no Supabase em lotes
    const masterEntries = Array.from(votacoesMasterMap.values());
    for (let i = 0; i < masterEntries.length; i += BATCH_SIZE) {
        const batch = masterEntries.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseAdmin
            .from('camara_votacoes_master')
            .upsert(batch, { onConflict: 'id_votacao' });
        if (error) {
            console.error(`[VOTOS SYNC] Erro ao salvar lote de votações master (${i}..${i + batch.length}):`, error.message);
        }
    }
    console.log(`[VOTOS SYNC] ✅ Votações Master sincronizadas com sucesso para ${ano}.`);

    // 3. Download e parsing em streaming do CSV de Votos Nominais
    console.log(`[VOTOS SYNC] Baixando votos nominais dos deputados: ${votosUrl}`);
    const vvRes = await fetchWithRetry(votosUrl);
    if (!vvRes.ok) {
        console.warn(`[VOTOS SYNC] Arquivo de votos para ${ano} não encontrado (HTTP ${vvRes.status}).`);
        return { votacoesCount: votacoesMasterMap.size, votosCount: 0 };
    }

    const vvCsvText = await vvRes.text();
    const parserVotos = parse(vvCsvText, {
        delimiter: ';',
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    let totalVotosLidos = 0;
    let totalVotosSalvos = 0;
    let votosBatch: Array<{ id_deputado: number; id_votacao: string; voto: string }> = [];

    for await (const row of parserVotos) {
        totalVotosLidos++;
        const idVotacao = row.idVotacao?.trim();
        const idDeputado = parseInt(row.deputado_id, 10);
        const voto = row.voto?.trim() || "Votou";

        if (!idVotacao || isNaN(idDeputado)) continue;

        // Se houver lista de deputados cadastrados, filtra para manter consistência referencial
        if (validDeputados.size > 0 && !validDeputados.has(idDeputado)) {
            continue;
        }

        votosBatch.push({
            id_deputado: idDeputado,
            id_votacao: idVotacao,
            voto: voto
        });

        if (votosBatch.length >= BATCH_SIZE) {
            const { error } = await supabaseAdmin
                .from('camara_votos_detalhados')
                .upsert(votosBatch, { onConflict: 'id_deputado,id_votacao' });
            
            if (error) {
                console.error(`[VOTOS SYNC] Erro ao salvar lote de votos:`, error.message);
            } else {
                totalVotosSalvos += votosBatch.length;
            }
            votosBatch = [];
        }
    }

    // Salvar remanescentes
    if (votosBatch.length > 0) {
        const { error } = await supabaseAdmin
            .from('camara_votos_detalhados')
            .upsert(votosBatch, { onConflict: 'id_deputado,id_votacao' });
        if (error) {
            console.error(`[VOTOS SYNC] Erro ao salvar lote final de votos:`, error.message);
        } else {
            totalVotosSalvos += votosBatch.length;
        }
    }

    console.log(`[VOTOS SYNC] ✅ Ano ${ano}: ${totalVotosLidos} votos lidos do CSV, ${totalVotosSalvos} votos gravados.`);
    return { votacoesCount: votacoesMasterMap.size, votosCount: totalVotosSalvos };
}

/**
 * Executa delta incremental para os últimos N dias via API REST da Câmara
 */
async function executarDeltaIncremental(validDeputados: Set<number>, diasAtras = 15) {
    console.log(`\n=============================================================`);
    console.log(`[VOTOS SYNC] ⚡ Executando Delta Incremental (Últimos ${diasAtras} dias via API)`);
    console.log(`=============================================================`);

    const hoje = new Date();
    const dataInicio = new Date();
    dataInicio.setDate(hoje.getDate() - diasAtras);

    const iStr = dataInicio.toISOString().split('T')[0];
    const fStr = hoje.toISOString().split('T')[0];

    let urlVotacoes: string | null = `${API_BASE}/votacoes?dataInicio=${iStr}&dataFim=${fStr}&itens=100&ordem=DESC&ordenarPor=dataHoraRegistro`;
    let votacoesNovasProcessadas = 0;

    try {
        while (urlVotacoes) {
            console.log(`[VOTOS SYNC API] Consultando: ${urlVotacoes}`);
            const res = await fetchWithRetry(urlVotacoes);
            if (!res.ok) break;
            const data = await res.json();
            const votacoes = data.dados || [];

            if (votacoes.length === 0) break;

            // Filtra votações que já existem no banco
            const idsVotacoes = votacoes.map((v: any) => v.id);
            const { data: existentes } = await supabaseAdmin
                .from('camara_votacoes_master')
                .select('id_votacao')
                .in('id_votacao', idsVotacoes);

            const idsExistentes = new Set(existentes?.map(e => e.id_votacao) || []);
            const votacoesPendentes = votacoes.filter((v: any) => !idsExistentes.has(v.id));

            console.log(`  - ${votacoes.length} votações na página, ${votacoesPendentes.length} pendentes.`);

            for (const votacao of votacoesPendentes) {
                let projeto_nome = votacao.descricao || `Votação ${votacao.id}`;
                let projeto_tema = "Votação em Plenário";
                let id_proposicao: number | null = null;

                try {
                    const detRes = await fetchWithRetry(`${API_BASE}/votacoes/${votacao.id}`);
                    if (detRes.ok) {
                        const detJson = await detRes.json();
                        const dados = detJson.dados;
                        if (dados?.proposicao) {
                            projeto_nome = `${dados.proposicao.siglaTipo} ${dados.proposicao.numero}/${dados.proposicao.ano}`;
                            projeto_tema = dados.proposicao.ementa || projeto_tema;
                            id_proposicao = dados.proposicao.id;
                        } else if (dados?.proposicoesAfetadas?.[0]) {
                            const prop = dados.proposicoesAfetadas[0];
                            projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano}`;
                            projeto_tema = prop.ementa || projeto_tema;
                            id_proposicao = prop.id;
                        } else if (dados?.objetosPossiveis?.[0]) {
                            const prop = dados.objetosPossiveis[0];
                            projeto_nome = `${prop.siglaTipo} ${prop.numero}/${prop.ano}`;
                            projeto_tema = prop.ementa || projeto_tema;
                            id_proposicao = prop.id;
                        }
                    }
                } catch {
                    // Mantém fallbacks seguros
                }

                // Busca votos nominais da votação
                const votosRes = await fetchWithRetry(`${API_BASE}/votacoes/${votacao.id}/votos`);
                const votosJson = votosRes.ok ? await votosRes.json() : null;
                const votosLista = votosJson?.dados || [];

                if (votosLista.length > 0) {
                    await supabaseAdmin.from('camara_votacoes_master').upsert({
                        id_votacao: votacao.id,
                        id_proposicao,
                        projeto_nome,
                        projeto_tema,
                        data_votacao: votacao.dataHoraRegistro
                    });

                    const payload = votosLista
                        .filter((v: any) => validDeputados.size === 0 || validDeputados.has(v.deputado_?.id))
                        .map((v: any) => ({
                            id_deputado: v.deputado_?.id,
                            id_votacao: votacao.id,
                            voto: v.tipoVoto
                        }));

                    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
                        await supabaseAdmin.from('camara_votos_detalhados').upsert(
                            payload.slice(i, i + BATCH_SIZE),
                            { onConflict: 'id_deputado,id_votacao' }
                        );
                    }
                    votacoesNovasProcessadas++;
                }

                await new Promise(r => setTimeout(r, 200)); // Rate limit amigável
            }

            const nextLink = data.links?.find((l: any) => l.rel === 'next');
            urlVotacoes = nextLink ? nextLink.href : null;
        }

        console.log(`[VOTOS SYNC API] ✅ Delta concluído: ${votacoesNovasProcessadas} novas votações capturadas.`);
    } catch (e: any) {
        console.warn(`[VOTOS SYNC API] Aviso no delta incremental: ${e.message}`);
    }
}

async function run() {
    const args = process.argv.slice(2);
    const flags = {
        todos: args.includes('--todos') || args.includes('--full'),
        ano: args.find((_, i, arr) => arr[i - 1] === '--ano')
    };

    console.log("=============================================================");
    console.log("   POLÍGRAFO — Sincronizador de Votações e Votos Nominais    ");
    console.log("=============================================================");

    const validDeputados = await carregarDeputadosValidos();
    const t0 = Date.now();

    if (flags.ano) {
        const ano = parseInt(flags.ano, 10);
        if (isNaN(ano) || ano < 2000 || ano > ANO_ATUAL + 1) {
            console.error(`Ano inválido: ${flags.ano}`);
            process.exit(1);
        }
        await processarAnoCSV(ano, validDeputados);
    } else if (flags.todos) {
        console.log(`[VOTOS SYNC] Sincronizando toda a 57ª Legislatura (${ANO_INICIO_LEGISLATURA} a ${ANO_ATUAL})...`);
        for (let a = ANO_INICIO_LEGISLATURA; a <= ANO_ATUAL; a++) {
            await processarAnoCSV(a, validDeputados);
        }
        await executarDeltaIncremental(validDeputados, 15);
    } else {
        // Modo Padrão: Ano Corrente (Bulk CSV) + Delta Recente (15 dias)
        console.log(`[VOTOS SYNC] Modo Padrão: Ano Corrente (${ANO_ATUAL}) via Dumps CSV + Delta 15 dias...`);
        await processarAnoCSV(ANO_ATUAL, validDeputados);
        await executarDeltaIncremental(validDeputados, 15);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n=============================================================`);
    console.log(`[VOTOS SYNC] ✨ Sincronização concluída com sucesso em ${elapsed}s!`);
    console.log(`=============================================================\n`);
}

run().catch((err) => {
    console.error("[VOTOS SYNC] Erro fatal:", err);
    process.exit(1);
});
