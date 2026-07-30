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

const URL_ANAC = 'https://sistemas.anac.gov.br/dadosabertos/Aeronaves/RAB/dados_aeronaves.csv';
const TEMP_DIR = path.join(os.tmpdir(), 'politgrafo-etl-anac');
const CSV_PATH = path.join(TEMP_DIR, 'dados_aeronaves.csv');

async function downloadData() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    console.log(`[ANAC] Baixando dados do RAB: ${URL_ANAC}`);
    try {
        // Usa curl nativo que suporta TLS e redirecionamentos
        execSync(`curl.exe -f -s -L -o "${CSV_PATH}" "${URL_ANAC}"`, { stdio: 'inherit' });
        console.log(`[ANAC] Download concluído: ${CSV_PATH}`);
        return true;
    } catch (e) {
        console.error(`[ANAC] Erro ao baixar o arquivo:`, e);
        return false;
    }
}

async function processData() {
    console.log(`[ANAC] Processando CSV...`);
    
    const BATCH_SIZE = 500;
    let batch: any[] = [];
    let totalInseridos = 0;

    return new Promise<void>((resolve, reject) => {
        const parser = parse({
            delimiter: ';',
            columns: true,
            skip_empty_lines: true,
            relax_quotes: true,
            relax_column_count: true,
            bom: true,
            from_line: 2
        });

        const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' }).pipe(parser);

        let rowCount = 0;
        stream.on('data', async (row) => {
            if (rowCount === 0) { console.log('DEBUG ROW:', Object.keys(row)); }
            rowCount++;
            try {
                const prefixo = row['MARCAS'];
                const propsRaw = row['PROPRIETARIOS'];
                const modelo = row['DS_MODELO'];
                const fabricante = row['NM_FABRICANTE'];
                const dtCanc = row['DT_CANC'];
                
                if (!prefixo || !propsRaw) return;

                let propDocumento = '';
                let propNome = '';
                
                try {
                    // O campo PROPRIETARIOS é um array JSON stringificado
                    const props = JSON.parse(propsRaw.replace(/""/g, '"'));
                    if (Array.isArray(props) && props.length > 0) {
                        propDocumento = props[0].DOCUMENTO || '';
                        propNome = props[0].NOME || '';
                    }
                } catch (e) {
                    // Ignora erros de parse do JSON localizados e usa string bruta se possível
                }
                
                // Normaliza documento
                propDocumento = propDocumento.replace(/\D/g, '');
                
                if (!propDocumento || !propNome) return;

                const situacao = dtCanc && dtCanc.trim() !== '' ? 'CANCELADA' : 'REGULAR';

                batch.push({
                    prefixo,
                    proprietario_documento: propDocumento,
                    proprietario_nome: propNome,
                    modelo: modelo || 'DESCONHECIDO',
                    fabricante: fabricante || 'DESCONHECIDO',
                    situacao
                });

                if (batch.length >= BATCH_SIZE) {
                    stream.pause();
                    const currentBatch = [...batch];
                    batch = [];
                    
                    const { error } = await supabase
                        .from('anac_rab')
                        .upsert(currentBatch, { onConflict: 'prefixo', ignoreDuplicates: false });
                        
                    if (error) {
                        console.error('[ANAC] Erro no lote:', error.message);
                    } else {
                        totalInseridos += currentBatch.length;
                    }
                    stream.resume();
                }
            } catch (err) {
                // Ignore single row errors
            }
        });

        stream.on('end', async () => {
            if (batch.length > 0) {
                const { error } = await supabase
                    .from('anac_rab')
                    .upsert(batch, { onConflict: 'prefixo', ignoreDuplicates: false });
                    
                if (!error) totalInseridos += batch.length;
            }
            console.log(`[ANAC] Processamento concluído. ${totalInseridos} aeronaves atualizadas.`);
            resolve();
        });

        stream.on('error', (err) => {
            console.error('[ANAC] Erro no stream CSV:', err);
            reject(err);
        });
    });
}

async function main() {
    console.log("Iniciando sincronização ANAC RAB (Dados Reais)...");
    const success = await downloadData();
    if (success) {
        try {
            await processData();
        } finally {
            try {
                fs.unlinkSync(CSV_PATH);
            } catch(e) {}
        }
    } else {
        console.error("Falha ao sincronizar ANAC.");
        process.exit(1);
    }
}

main();
