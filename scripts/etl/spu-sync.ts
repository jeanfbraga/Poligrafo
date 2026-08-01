import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ERRO: Faltam credenciais do Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// URL estável identificada (mantida pelo SEGES Raio-X)
const URL_SPU = process.env.SPU_CSV_URL || 'https://repositorio.dados.gov.br/seges/raio-x/patrimonio-uniao.csv';
const TEMP_DIR = path.join(os.tmpdir(), 'politgrafo-etl-spu');
const CSV_PATH = path.join(TEMP_DIR, 'patrimonio-uniao.csv');

async function downloadData() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    console.log(`[SPU] Baixando dados de Imóveis da União: ${URL_SPU}`);
    try {
        // curl é disponível nativamente no Linux (CI) e Windows 10+
        const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
        execSync(`${curlCmd} -f -s -L -o "${CSV_PATH}" "${URL_SPU}"`, { stdio: 'inherit' });
        console.log(`[SPU] Download concluído: ${CSV_PATH}`);
        return true;
    } catch (e) {
        console.error(`[SPU] Erro ao baixar o arquivo:`, e);
        return false;
    }
}

async function prepareDatabase() {
    console.log('[SPU] Limpando tabela antiga (Truncate)...');
    
    let totalDeleted = 0;
    while (true) {
        const { data, error } = await supabase
            .from('spu_imoveis')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000') // truque para deletar todos
            .select('id')
            .limit(5000);

        if (error) {
            console.error('[SPU] Erro ao deletar registros:', error.message);
            break;
        }

        const count = data ? data.length : 0;
        totalDeleted += count;

        if (count === 0) break;
    }
    console.log(`[SPU] ${totalDeleted} registros antigos removidos.`);
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
    console.log(`[SPU] Processando CSV...`);
    
    const BATCH_SIZE = 500;
    let batch: any[] = [];
    let totalInseridos = 0;

    return new Promise<void>((resolve, reject) => {
        const parser = parse({
            delimiter: ',', // O CSV do Raio-X usa vírgula
            columns: true,
            skip_empty_lines: true,
            relax_quotes: true,
            relax_column_count: true,
            bom: true
        });

        const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' }).pipe(parser);

        let rowCount = 0;
        stream.on('data', async (row) => {
            if (rowCount === 0) { 
                console.log('DEBUG ROW KEYS:', Object.keys(row)); 
            }
            rowCount++;
            
            try {
                const uf = findKey(row, ['uf']);
                const municipio = findKey(row, ['municipio_nome', 'municipio']);
                const endereco = findKey(row, ['endereco']);
                const tipoImovel = findKey(row, ['tipo_imovel']);
                const areaStr = findKey(row, ['metro_quadrado_area', 'area_terreno_m2', 'area_m2']);
                const valorStr = findKey(row, ['valor_imovel']);

                let area = 0;
                if (areaStr && areaStr !== '-' && areaStr !== '—') {
                    area = parseFloat(areaStr.replace(',', '.'));
                }
                
                let valor = 0;
                if (valorStr && valorStr !== '-' && valorStr !== '—') {
                    valor = parseFloat(valorStr.replace(',', '.'));
                }

                if (!endereco) return;

                batch.push({
                    uf: uf?.trim().toUpperCase() || null,
                    municipio_nome: municipio?.trim() || null,
                    endereco: endereco.trim(),
                    tipo_imovel: tipoImovel?.trim() || null,
                    area_m2: isNaN(area) ? 0 : area,
                    valor_imovel: isNaN(valor) ? 0 : valor
                });

                if (batch.length >= BATCH_SIZE) {
                    stream.pause();
                    
                    // Deduplicate batch by 'endereco' to prevent PostgreSQL 'ON CONFLICT DO UPDATE command cannot affect row a second time'
                    const uniqueBatch = [];
                    const seen = new Set();
                    for (const item of batch) {
                        if (!seen.has(item.endereco)) {
                            seen.add(item.endereco);
                            uniqueBatch.push(item);
                        }
                    }
                    
                    batch = [];
                    
                    const { error } = await supabase
                        .from('spu_imoveis')
                        .upsert(uniqueBatch, { onConflict: 'endereco' });
                        
                    if (error) {
                        console.error('[SPU] Erro no lote:', error.message);
                    } else {
                        totalInseridos += uniqueBatch.length;
                    }
                    stream.resume();
                }
            } catch (err) {
            }
        });

        stream.on('end', async () => {
            if (batch.length > 0) {
                const uniqueBatch = [];
                const seen = new Set();
                for (const item of batch) {
                    if (!seen.has(item.endereco)) {
                        seen.add(item.endereco);
                        uniqueBatch.push(item);
                    }
                }
                const { error } = await supabase
                    .from('spu_imoveis')
                    .upsert(uniqueBatch, { onConflict: 'endereco' });
                    
                if (!error) totalInseridos += uniqueBatch.length;
            }
            console.log(`[SPU] Processamento concluído. ${totalInseridos} imóveis inseridos únicos.`);
            resolve();
        });

        stream.on('error', (err) => {
            console.error('[SPU] Erro no stream CSV:', err);
            reject(err);
        });
    });
}

async function main() {
    console.log("Iniciando sincronização SPU (Dados Reais)...");
    const success = await downloadData();
    if (success) {
        try {
            await prepareDatabase();
            await processData();
        } finally {
            try {
                if (CSV_PATH) fs.unlinkSync(CSV_PATH);
            } catch(e) {}
        }
    } else {
        console.error("Falha ao baixar dados do SPU.");
        process.exit(1);
    }
}

main();
