import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const ANO_ATUAL = new Date().getFullYear();
const BATCH_SIZE = 1000;
const TEMP_DIR = path.join(process.cwd(), '.tmp_ceap');

// Mínimo de registros esperado por ano para considerar o CSV válido.
// Se inserirmos menos que isso, algo deu errado e não atualizamos as views.
const MIN_REGISTROS_POR_ANO: Record<number, number> = {
    2024: 100_000,
    2025: 50_000,
};
// Anos correntes têm menos dados — sem mínimo fixo além de > 0.
const MIN_REGISTROS_ANO_CORRENTE = 1_000;

// Timeout máximo por download: 2 min (evita travar 5 min no servidor instável da Câmara)
const CURL_MAX_TIME = 120;
const CURL_CONNECT_TIMEOUT = 30;
const MAX_DOWNLOAD_RETRIES = 3;

async function downloadAndExtractForYear(ano: number): Promise<string | null> {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    const zipPath = path.join(TEMP_DIR, `Ano-${ano}.csv.zip`);
    const csvPath = path.join(TEMP_DIR, `Ano-${ano}.csv`);

    // Usa HTTPS — o servidor HTTP (porta 80) da Câmara fica instável com frequência
    const url = `https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`;
    console.log(`[CEAP SYNC] Baixando despesas da Câmara para ${ano}...`);
    console.log(`URL: ${url}`);

    // Retry com backoff exponencial: até MAX_DOWNLOAD_RETRIES tentativas
    let downloadOk = false;
    for (let tentativa = 1; tentativa <= MAX_DOWNLOAD_RETRIES; tentativa++) {
        try {
            execSync(
                `curl -f -L --max-time ${CURL_MAX_TIME} --connect-timeout ${CURL_CONNECT_TIMEOUT} -o "${zipPath}" "${url}"`,
                { stdio: 'inherit' }
            );
            downloadOk = true;
            break;
        } catch (e) {
            const delay = tentativa * tentativa * 2; // 2s, 8s, 18s
            if (tentativa < MAX_DOWNLOAD_RETRIES) {
                console.warn(`[CEAP SYNC] Tentativa ${tentativa}/${MAX_DOWNLOAD_RETRIES} falhou para ${ano}. Aguardando ${delay}s antes de tentar novamente...`);
                await new Promise(r => setTimeout(r, delay * 1000));
            } else {
                console.error(`[CEAP SYNC] Todas as ${MAX_DOWNLOAD_RETRIES} tentativas falharam para o ano ${ano}. Abortando.`);
            }
        }
    }

    if (!downloadOk) return null;

    // Valida que o ZIP tem tamanho razoável (> 10 KB) antes de prosseguir
    const zipStat = fs.statSync(zipPath);
    if (zipStat.size < 10_000) {
        console.error(`[CEAP SYNC] ZIP para ${ano} suspeito: apenas ${zipStat.size} bytes. Abortando.`);
        return null;
    }

    console.log(`[CEAP SYNC] Extraindo arquivo ZIP (${Math.round(zipStat.size / 1024)} KB)...`);
    // Os arquivos da Câmara são ZIP puro — usar unzip diretamente (tar não suporta ZIP)
    try {
        execSync(`unzip -o "${zipPath}" "Ano-${ano}.csv" -d "${TEMP_DIR}"`, { stdio: 'inherit' });
    } catch (unzipErr) {
        console.error(`[CEAP SYNC] Erro ao extrair o ZIP para o ano ${ano}.`);
        return null;
    }

    return fs.existsSync(csvPath) ? csvPath : null;
}

async function runForYear(ano: number): Promise<{ success: boolean; count: number }> {
    // ── Fase 1: Download e extração ────────────────────────────────────────
    // O CSV deve estar disponível ANTES de qualquer deleção no banco.
    const csvPath = await downloadAndExtractForYear(ano);
    if (!csvPath) return { success: false, count: 0 };

    // ── Fase 2: Deleção dos dados antigos ──────────────────────────────────
    // Só chegamos aqui se o arquivo foi baixado e extraído com sucesso.
    await prepare(ano);

    // ── Fase 3: Inserção ───────────────────────────────────────────────────
    console.log(`[CEAP SYNC] Parseando e inserindo CSV: ${csvPath}`);

    return new Promise(async (resolve, reject) => {
        let batch: any[] = [];
        let count = 0;
        let insertErrors = 0;

        const parser = fs.createReadStream(csvPath, 'utf8').pipe(parse({
            columns: true,
            skip_empty_lines: true,
            delimiter: ';',
            relax_quotes: true,
            relax_column_count: true
        }));

        try {
            for await (const record of parser) {
                const ideCadastro = record['txIdCadastro'] || record['ideCadastro'];
                if (!ideCadastro) continue;

                const valorLiquido = parseFloat((record['vlrLiquido'] || '0').replace(',', '.'));

                batch.push({
                    id_deputado: parseInt(ideCadastro, 10),
                    ano: parseInt(record['numAno'], 10) || ano,
                    cnpj_cpf_fornecedor: record['txtCNPJCPF'] ? record['txtCNPJCPF'].replace(/\D/g, '') : null,
                    nome_fornecedor: record['txtFornecedor'] || 'Desconhecido',
                    tipo_despesa: record['txtDescricao'] || 'Despesa CEAP',
                    valor_documento: valorLiquido,
                    data_documento: record['datEmissao'] || null,
                    url_documento: record['urlDocumento'] || null
                });

                if (batch.length >= BATCH_SIZE) {
                    const ok = await insertBatch(batch);
                    if (ok) {
                        count += batch.length;
                    } else {
                        insertErrors++;
                    }
                    batch = [];
                }
            }

            if (batch.length > 0) {
                const ok = await insertBatch(batch);
                if (ok) {
                    count += batch.length;
                } else {
                    insertErrors++;
                }
            }

            console.log(`[CEAP SYNC] Concluído! ${count} registros inseridos para ${ano} (${insertErrors} lotes com erro).`);

            // ── Fase 4: Validação de integridade ──────────────────────────
            const minEsperado = ano < ANO_ATUAL
                ? (MIN_REGISTROS_POR_ANO[ano] ?? 10_000)
                : MIN_REGISTROS_ANO_CORRENTE;

            if (count < minEsperado) {
                console.error(
                    `[CEAP SYNC] ⚠️  Alerta de integridade para ${ano}: ${count} registros inseridos, ` +
                    `esperado >= ${minEsperado}. Provavelmente houve falha de inserção em massa.`
                );
                resolve({ success: false, count });
            } else {
                resolve({ success: true, count });
            }

        } catch (err: any) {
            console.error('[CEAP SYNC] Erro ao parsear CSV:', err.message);
            reject(err);
        }
    });
}

// Retorna true se inseriu com sucesso, false em caso de erro.
async function insertBatch(batch: any[]): Promise<boolean> {
    const { error } = await supabaseAdmin
        .from('ceap_despesas_cache')
        .insert(batch);

    if (error) {
        console.error("[CEAP SYNC] Erro ao inserir lote:", error.message);
        return false;
    }

    console.log(`[CEAP SYNC] Lote de ${batch.length} registros inserido com sucesso.`);
    return true;
}

async function prepare(ano: number) {
    console.log(`[CEAP SYNC] Limpando cache antigo para o ano ${ano}...`);
    let deletedCount = 0;
    while (true) {
        const { data, error } = await supabaseAdmin
            .from('ceap_despesas_cache')
            .delete()
            .eq('ano', ano)
            .select('id');

        if (error) {
            console.error("[CEAP SYNC] Erro ao deletar:", error);
            break;
        }

        const batchDeleted = data ? data.length : 0;
        deletedCount += batchDeleted;

        if (batchDeleted === 0) break;
    }
    console.log(`[CEAP SYNC] Total de registros apagados para ${ano}: ${deletedCount}`);
}

async function run() {
    let year = 2024;
    let anySuccess = false;
    const resultados: string[] = [];

    // Roda de 2024 até o ano atual
    while (year <= ANO_ATUAL) {
        let result: { success: boolean; count: number };
        try {
            result = await runForYear(year);
        } catch (err: any) {
            console.error(`[CEAP SYNC] Exceção ao processar ${year}:`, err.message);
            result = { success: false, count: 0 };
        }

        if (result.success) {
            anySuccess = true;
            resultados.push(`${year}: ✅ ${result.count.toLocaleString('pt-BR')} registros`);
        } else {
            resultados.push(`${year}: ❌ falhou (${result.count} registros inseridos)`);
            console.log(`[CEAP SYNC] O ano ${year} não possui dados suficientes ou falhou.`);
        }
        year++;
    }

    console.log('\n[CEAP SYNC] ── Resumo ─────────────────────────────────');
    resultados.forEach(r => console.log(`[CEAP SYNC]   ${r}`));
    console.log('[CEAP SYNC] ──────────────────────────────────────────');

    if (!anySuccess) {
        console.error("[CEAP SYNC] ❌ Falha total: nenhum ano foi sincronizado com sucesso. Views materializadas NÃO serão atualizadas para preservar os dados antigos.");
        process.exit(1); // sinaliza falha para o GitHub Actions
    } else {
        console.log("[CEAP SYNC] Atualizando views materializadas no banco de dados...");
        const { error: rpcError } = await supabaseAdmin.rpc('refresh_ceap_materialized_views');
        if (rpcError) {
            console.error("[CEAP SYNC] Erro ao atualizar views materializadas:", rpcError.message);
            process.exit(1);
        } else {
            console.log("[CEAP SYNC] ✅ Views materializadas atualizadas com sucesso.");
        }
    }
}

run().catch(console.error);
