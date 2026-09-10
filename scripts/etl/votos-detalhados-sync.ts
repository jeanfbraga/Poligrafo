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
import { execSync } from 'child_process';

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

const DEFAULT_HEADERS = {
    'Accept': 'application/json, text/csv, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Poligrafo/1.0'
};

async function fetchWithRetry(url: string, retries = 5): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        try {
            const res = await fetch(url, {
                headers: DEFAULT_HEADERS,
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

/**
 * Baixa conteúdo de texto/CSV com fallback para curl caso fetch nativo sofra timeout de conexão
 */
async function downloadTextWithFallback(url: string): Promise<string | null> {
    try {
        const res = await fetchWithRetry(url);
        if (res.ok) {
            return await res.text();
        }
        if (res.status === 404) {
            console.warn(`[VOTOS SYNC] Arquivo não encontrado (HTTP 404): ${url}`);
            return null;
        }
    } catch (fetchErr: any) {
        console.warn(`[VOTOS SYNC] Fetch direto falhou (${fetchErr.message}). Tentando fallback com curl: ${url}`);
        try {
            const curlOutput = execSync(
                `curl -s -f -L --connect-timeout 30 --max-time 120 -H "User-Agent: Mozilla/5.0 Poligrafo/1.0" "${url}"`,
                { maxBuffer: 100 * 1024 * 1024, encoding: 'utf-8' }
            );
            if (curlOutput && curlOutput.trim().length > 0) {
                console.log(`[VOTOS SYNC] Download via curl bem-sucedido (${(curlOutput.length / 1024).toFixed(0)} KB).`);
                return curlOutput;
            }
        } catch (curlErr: any) {
            console.error(`[VOTOS SYNC] Fallback com curl também falhou:`, curlErr.message);
        }
    }
    return null;
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

function mapearVotacaoMasterCSV(row: any, ano: number) {
    const idVotacao = row.id?.trim();
    if (!idVotacao) return null;

    const dataVotacao = row.dataHoraRegistro || row.data || `${ano}-01-01T00:00:00`;
    const propIdNum = parseInt(row.ultimaApresentacaoProposicao_idProposicao, 10);
    const id_proposicao = isNaN(propIdNum) || propIdNum <= 0 ? null : propIdNum;
    const descricao = row.descricao || row.ultimaApresentacaoProposicao_descricao || "";
    const projeto_nome = extrairProjetoNome(descricao, idVotacao);

    return {
        id_votacao: idVotacao,
        id_proposicao,
        projeto_nome,
        projeto_tema: descricao || "Votação em Plenário",
        data_votacao: dataVotacao
    };
}

async function carregarVotacoesMasterCSV(ano: number): Promise<Map<string, any>> {
    const votacoesUrl = `${ARQUIVOS_BASE}/votacoes/csv/votacoes-${ano}.csv`;
    console.log(`[VOTOS SYNC] Baixando metadados de votações: ${votacoesUrl}`);
    const vCsvText = await downloadTextWithFallback(votacoesUrl);
    if (!vCsvText) {
        console.warn(`[VOTOS SYNC] ⚠️ Metadados de votações para ${ano} indisponíveis via CSV.`);
        return new Map();
    }

    const parserVotacoes = parse(vCsvText, {
        delimiter: ';',
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    const votacoesMasterMap = new Map<string, any>();
    for await (const row of parserVotacoes) {
        const item = mapearVotacaoMasterCSV(row, ano);
        if (item) {
            votacoesMasterMap.set(item.id_votacao, item);
        }
    }
    return votacoesMasterMap;
}

async function salvarVotacoesMaster(entries: any[]): Promise<void> {
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const { error } = await supabaseAdmin
            .from('camara_votacoes_master')
            .upsert(batch, { onConflict: 'id_votacao' });
        if (error) {
            console.error(`[VOTOS SYNC] Erro ao salvar lote de votações master:`, error.message);
        }
    }
}

async function processarVotosCSV(ano: number, validDeputados: Set<number>): Promise<number> {
    const votosUrl = `${ARQUIVOS_BASE}/votacoesVotos/csv/votacoesVotos-${ano}.csv`;
    console.log(`[VOTOS SYNC] Baixando votos nominais dos deputados: ${votosUrl}`);
    const vvCsvText = await downloadTextWithFallback(votosUrl);
    if (!vvCsvText) {
        console.warn(`[VOTOS SYNC] ⚠️ Votos nominais para ${ano} indisponíveis via CSV.`);
        return 0;
    }

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
        if (validDeputados.size > 0 && !validDeputados.has(idDeputado)) continue;

        votosBatch.push({ id_deputado: idDeputado, id_votacao: idVotacao, voto });

        if (votosBatch.length >= BATCH_SIZE) {
            await supabaseAdmin.from('camara_votos_detalhados').upsert(votosBatch, { onConflict: 'id_deputado,id_votacao' });
            totalVotosSalvos += votosBatch.length;
            votosBatch = [];
        }
    }

    if (votosBatch.length > 0) {
        await supabaseAdmin.from('camara_votos_detalhados').upsert(votosBatch, { onConflict: 'id_deputado,id_votacao' });
        totalVotosSalvos += votosBatch.length;
    }

    console.log(`[VOTOS SYNC] ✅ Ano ${ano}: ${totalVotosLidos} votos lidos do CSV, ${totalVotosSalvos} votos gravados.`);
    return totalVotosSalvos;
}

/**
 * Processa um ano inteiro a partir dos arquivos CSV oficiais da Câmara
 */
async function processarAnoCSV(ano: number, validDeputados: Set<number>): Promise<{ votacoesCount: number; votosCount: number }> {
    console.log(`\n=============================================================`);
    console.log(`[VOTOS SYNC] 📦 Processando DUMP CSV da Câmara para o Ano: ${ano}`);
    console.log(`=============================================================`);

    try {
        const votacoesMasterMap = await carregarVotacoesMasterCSV(ano);
        if (votacoesMasterMap.size === 0) {
            return { votacoesCount: 0, votosCount: 0 };
        }

        console.log(`[VOTOS SYNC] ${votacoesMasterMap.size} votações carregadas do CSV para ${ano}.`);
        await salvarVotacoesMaster(Array.from(votacoesMasterMap.values()));
        console.log(`[VOTOS SYNC] ✅ Votações Master sincronizadas com sucesso para ${ano}.`);

        const totalVotosSalvos = await processarVotosCSV(ano, validDeputados);
        return { votacoesCount: votacoesMasterMap.size, votosCount: totalVotosSalvos };
    } catch (anoErr: any) {
        console.warn(`[VOTOS SYNC] ⚠️ Falha ao processar CSV do ano ${ano}: ${anoErr.message}. O fluxo continuará com a API incremental.`);
        return { votacoesCount: 0, votosCount: 0 };
    }
}

function extrairInfoProposicao(dados: any): { nome: string; tema: string; id: number | null } | null {
    const prop = dados?.proposicao || dados?.proposicoesAfetadas?.[0] || dados?.objetosPossiveis?.[0];
    if (!prop) return null;
    return {
        nome: `${prop.siglaTipo} ${prop.numero}/${prop.ano}`,
        tema: prop.ementa || "Votação em Plenário",
        id: prop.id || null
    };
}

async function resolverMetadadosVotacao(votacao: any) {
    let projeto_nome = votacao.descricao || `Votação ${votacao.id}`;
    let projeto_tema = "Votação em Plenário";
    let id_proposicao: number | null = null;

    try {
        const detRes = await fetchWithRetry(`${API_BASE}/votacoes/${votacao.id}`);
        if (detRes.ok) {
            const detJson = await detRes.json();
            const info = extrairInfoProposicao(detJson.dados);
            if (info) {
                projeto_nome = info.nome;
                projeto_tema = info.tema;
                id_proposicao = info.id;
            }
        }
    } catch {
        // Fallbacks mantidos
    }

    return { projeto_nome, projeto_tema, id_proposicao };
}

async function processarVotacaoPendenteApi(votacao: any, validDeputados: Set<number>): Promise<boolean> {
    const meta = await resolverMetadadosVotacao(votacao);
    const votosRes = await fetchWithRetry(`${API_BASE}/votacoes/${votacao.id}/votos`);
    const votosJson = votosRes.ok ? await votosRes.json() : null;
    const votosLista = votosJson?.dados || [];

    if (votosLista.length === 0) return false;

    await supabaseAdmin.from('camara_votacoes_master').upsert({
        id_votacao: votacao.id,
        id_proposicao: meta.id_proposicao,
        projeto_nome: meta.projeto_nome,
        projeto_tema: meta.projeto_tema,
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
    return true;
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

            const idsVotacoes = votacoes.map((v: any) => v.id);
            const { data: existentes } = await supabaseAdmin
                .from('camara_votacoes_master')
                .select('id_votacao')
                .in('id_votacao', idsVotacoes);

            const idsExistentes = new Set(existentes?.map(e => e.id_votacao) || []);
            const votacoesPendentes = votacoes.filter((v: any) => !idsExistentes.has(v.id));

            console.log(`  - ${votacoes.length} votações na página, ${votacoesPendentes.length} pendentes.`);

            for (const votacao of votacoesPendentes) {
                const ok = await processarVotacaoPendenteApi(votacao, validDeputados);
                if (ok) votacoesNovasProcessadas++;
                await new Promise(r => setTimeout(r, 200));
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
