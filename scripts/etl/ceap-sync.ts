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

async function downloadAndExtractForYear(ano: number): Promise<string | null> {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    const zipPath = path.join(TEMP_DIR, `Ano-${ano}.csv.zip`);
    const csvPath = path.join(TEMP_DIR, `Ano-${ano}.csv`);
    
    console.log(`[CEAP SYNC] Baixando despesas da Câmara para ${ano}...`);
    const url = `http://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`;
    console.log(`URL: ${url}`);
    
    try {
        execSync(`curl -f -L -o "${zipPath}" ${url}`, { stdio: 'inherit' });
    } catch (e) {
        console.log(`[CEAP SYNC] Arquivo para o ano ${ano} não encontrado (404) ou erro no curl.`);
        return null;
    }

    console.log(`[CEAP SYNC] Extraindo arquivo ZIP...`);
    try {
        execSync(`tar -xf "${zipPath}" -C "${TEMP_DIR}" Ano-${ano}.csv`, { stdio: 'inherit' });
    } catch (e) {
        console.log(`[CEAP SYNC] Falha no tar, tentando unzip...`);
        try {
            execSync(`unzip -o "${zipPath}" Ano-${ano}.csv -d "${TEMP_DIR}"`, { stdio: 'inherit' });
        } catch (unzipErr) {
            console.error(`[CEAP SYNC] Erro ao extrair o ZIP para o ano ${ano}.`);
            return null;
        }
    }
    
    return fs.existsSync(csvPath) ? csvPath : null;
}

async function runForYear(ano: number): Promise<boolean> {
    const csvPath = await downloadAndExtractForYear(ano);
    if (!csvPath) return false;

    console.log(`[CEAP SYNC] Parseando e inserindo CSV: ${csvPath}`);

    return new Promise((resolve, reject) => {
        let batch: any[] = [];
        let count = 0;

        const parser = fs.createReadStream(csvPath, 'utf8').pipe(parse({
            columns: true,
            skip_empty_lines: true,
            delimiter: ';',
            relax_quotes: true,
            relax_column_count: true
        }));

        parser.on('readable', async function() {
            let record;
            while ((record = parser.read()) !== null) {
                // Algumas colunas no CSV oficial podem ser txNomeParlamentar, ideCadastro, etc.
                const ideCadastro = record['txIdCadastro'] || record['ideCadastro'];
                if (!ideCadastro) continue;

                let valorLiquido = parseFloat((record['vlrLiquido'] || '0').replace(',', '.'));
                
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
                    parser.pause();
                    await insertBatch(batch);
                    count += batch.length;
                    batch = [];
                    parser.resume();
                }
            }
        });

        parser.on('error', function(err) {
            console.error('[CEAP SYNC] Erro ao parsear CSV:', err.message);
            reject(err);
        });

        parser.on('end', async function() {
            if (batch.length > 0) {
                await insertBatch(batch);
                count += batch.length;
            }
            console.log(`[CEAP SYNC] Concluído! ${count} registros inseridos/atualizados para ${ano}.`);
            resolve(true);
        });
    });
}

async function insertBatch(batch: any[]) {
    const { error } = await supabaseAdmin
        .from('ceap_despesas_cache')
        .insert(batch);

    if (error) {
        console.error("[CEAP SYNC] Erro ao inserir lote:", error.message);
    } else {
        console.log(`[CEAP SYNC] Lote de ${batch.length} registros inserido com sucesso.`);
    }
}

async function prepare(ano: number) {
    console.log(`[CEAP SYNC] Limpando cache antigo para o ano ${ano}...`);
    await supabaseAdmin
        .from('ceap_despesas_cache')
        .delete()
        .eq('ano', ano);
}

async function run() {
    let year = 2023;
    let anySuccess = false;
    
    // Roda de 2023 até o ano atual
    while (year <= ANO_ATUAL) {
        await prepare(year);
        const success = await runForYear(year);
        if (success) {
            anySuccess = true;
        } else {
            console.log(`[CEAP SYNC] O ano ${year} não possui dados ou falhou.`);
        }
        year++;
    }
    
    if (!anySuccess) {
        console.error("[CEAP SYNC] Falha total: Não foi possível baixar os dados de nenhum ano recente.");
    }
}

run().catch(console.error);
