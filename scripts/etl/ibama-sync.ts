import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parse } from 'csv-parse';
import os from 'os';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Faltam variáveis de ambiente do Supabase.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Usa a URL do portal novo que entrega em ZIP
const URL_IBAMA = process.env.IBAMA_CSV_URL || 'https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip';
const TEMP_DIR = path.join(os.tmpdir(), 'politgrafo-etl-ibama');
const ZIP_PATH = path.join(TEMP_DIR, 'ibama.zip');
let CSV_PATHS: string[] = [];

async function downloadData() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    console.log(`[IBAMA] Baixando dados de infrações (ZIP): ${URL_IBAMA}`);
    try {
        execSync(`curl.exe -f -s -L -o "${ZIP_PATH}" "${URL_IBAMA}"`, { stdio: 'inherit' });
        console.log(`[IBAMA] Download concluído. Extraindo arquivo...`);
        
        try {
            execSync(`tar -xf "${ZIP_PATH}" -C "${TEMP_DIR}"`, { stdio: 'inherit' });
        } catch (e) {
            execSync(`powershell -command "Expand-Archive -Force '${ZIP_PATH}' '${TEMP_DIR}'"`, { stdio: 'inherit' });
        }

        const files = fs.readdirSync(TEMP_DIR);
        const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));
        if (csvFiles.length === 0) {
             throw new Error("Nenhum arquivo CSV encontrado dentro do ZIP.");
        }
        CSV_PATHS = csvFiles.map(f => path.join(TEMP_DIR, f));
        console.log(`[IBAMA] ${CSV_PATHS.length} arquivos CSV localizados para processamento.`);
        return true;
    } catch (e) {
        console.error(`[IBAMA] Erro ao baixar ou extrair o arquivo:`, e);
        return false;
    }
}

async function prepareDatabase() {
    console.log('[IBAMA] Limpando tabela antiga (UUID PK exige deleção)...');
    
    let totalDeleted = 0;
    while (true) {
        const { data, error } = await supabase
            .from('ibama_infracoes')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000') // truque para deletar todos
            .select('id')
            .limit(5000);

        if (error) {
            console.error('[IBAMA] Erro ao deletar registros:', error.message);
            break;
        }

        const count = data ? data.length : 0;
        totalDeleted += count;

        if (count === 0) break;
    }
    console.log(`[IBAMA] ${totalDeleted} registros antigos removidos.`);
}

function findKey(row: any, possibleKeys: string[]): string | undefined {
    const rowKeys = Object.keys(row);
    for (const pk of possibleKeys) {
        const found = rowKeys.find(k => k.toUpperCase() === pk.toUpperCase() || k.toUpperCase().includes(pk.toUpperCase()));
        if (found) return row[found];
    }
    return undefined;
}

async function processData() {
    let totalInseridosGeral = 0;

    for (const currentCsv of CSV_PATHS) {
        console.log(`[IBAMA] Processando CSV: ${currentCsv}...`);
        
        const BATCH_SIZE = 500;
        let batch: any[] = [];
        
        await new Promise<void>((resolve, reject) => {
            const parser = parse({
                delimiter: ';',
                columns: true,
                skip_empty_lines: true,
                relax_quotes: true,
                relax_column_count: true,
                bom: true
            });

            const stream = fs.createReadStream(currentCsv, { encoding: 'utf8' }).pipe(parser);

            stream.on('data', async (row) => {
                try {
                    let cpfCnpj = findKey(row, ['CPF_CNPJ_INFRATOR', 'CPF_CNPJ', 'CNPJ_CPF']);
                    const nomeInfrator = findKey(row, ['NOME_INFRATOR', 'NOME_RAZAO_SOCIAL', 'RAZAO_SOCIAL']);
                    const valorMultaStr = findKey(row, ['VALOR_AUTO', 'VALOR_MULTA', 'VAL', 'VAL_AUTO_INFRACAO']);
                    const tipoInfracao = findKey(row, ['TIPO_INFRACAO', 'TIPO_AUTO']);
                    let dataAuto = findKey(row, ['DAT_AUTO_INFRACAO', 'DATA_AUTO', 'DATA', 'DAT_HORA_AUTO_INFRACAO']);

                    if (!cpfCnpj || !nomeInfrator) return;

                    cpfCnpj = cpfCnpj.replace(/\D/g, '');
                    if (cpfCnpj.length < 11) return;

                    let valor = 0;
                    if (valorMultaStr) {
                        valor = parseFloat(valorMultaStr.replace(/\./g, '').replace(',', '.'));
                    }

                    if (dataAuto && dataAuto.includes('/')) {
                        const [d, m, y] = dataAuto.split(' ')[0].split('/');
                        if (y && y.length === 4) {
                            dataAuto = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                        }
                    }

                    batch.push({
                        cpf_cnpj: cpfCnpj,
                        nome_infrator: nomeInfrator.substring(0, 255),
                        valor_multa: isNaN(valor) ? 0 : valor,
                        tipo_infracao: tipoInfracao || 'NÃO ESPECIFICADO',
                        data_auto: dataAuto || null
                    });

                    if (batch.length >= BATCH_SIZE) {
                        stream.pause();
                        const currentBatch = [...batch];
                        batch = [];
                        
                        const { error } = await supabase
                            .from('ibama_infracoes')
                            .insert(currentBatch);
                            
                        if (error) {
                            console.error('[IBAMA] Erro no lote:', error.message);
                        } else {
                            totalInseridosGeral += currentBatch.length;
                        }
                        stream.resume();
                    }
                } catch (err) {
                }
            });

            stream.on('end', async () => {
                if (batch.length > 0) {
                    const { error } = await supabase
                        .from('ibama_infracoes')
                        .insert(batch);
                        
                    if (!error) totalInseridosGeral += batch.length;
                }
                resolve();
            });

            stream.on('error', (err) => {
                console.error(`[IBAMA] Erro no stream CSV ${currentCsv}:`, err);
                reject(err);
            });
        });
    }
    
    console.log(`[IBAMA] Processamento concluído. ${totalInseridosGeral} infrações totais inseridas.`);
}

async function main() {
    console.log("Iniciando sincronização IBAMA (Dados Reais)...");
    const success = await downloadData();
    if (success) {
        try {
            await prepareDatabase();
            await processData();
        } finally {
            try {
                for (const c of CSV_PATHS) fs.unlinkSync(c);
                fs.unlinkSync(ZIP_PATH);
            } catch(e) {}
        }
    } else {
        console.error("Falha ao sincronizar IBAMA. Se a URL mudou, defina IBAMA_CSV_URL no .env");
        process.exit(1);
    }
}

main();
