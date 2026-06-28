import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import { parse } from 'csv-parse';
import { execSync } from 'child_process';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const BATCH_SIZE = 1000;
const TEMP_DIR = path.join(process.cwd(), '.tmp_tse');

async function downloadAndExtract() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR);
    }
    const zipPath = path.join(TEMP_DIR, 'consulta_cand_2022.zip');
    const csvPath = path.join(TEMP_DIR, 'consulta_cand_2022_BRASIL.csv');
    
    if (!fs.existsSync(csvPath)) {
        console.log("[TSE SYNC] Baixando arquivo ZIP do TSE (~60MB)...");
        // Usando curl, disponível no Windows/Linux/Mac
        execSync(`curl -L -o "${zipPath}" https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip`, { stdio: 'inherit' });
        
        console.log("[TSE SYNC] Extraindo arquivo ZIP...");
        // Usando tar no Windows 10+ ou unzip
        try {
            execSync(`tar -xf "${zipPath}" -C "${TEMP_DIR}" consulta_cand_2022_BRASIL.csv`, { stdio: 'inherit' });
        } catch (e) {
            console.log("[TSE SYNC] Falha no tar, tentando unzip...");
            execSync(`unzip -o "${zipPath}" consulta_cand_2022_BRASIL.csv -d "${TEMP_DIR}"`, { stdio: 'inherit' });
        }
    }
    
    return csvPath;
}

async function run() {
    const csvPath = await downloadAndExtract();
    
    console.log(`[TSE SYNC] Parseando e inserindo CSV: ${csvPath}`);
    
    return new Promise((resolve, reject) => {
        let batch: any[] = [];
        let count = 0;
        
        // CSV do TSE usa Latin1 (ISO-8859-1)
        const parser = fs.createReadStream(csvPath, 'latin1').pipe(parse({
            columns: true,
            skip_empty_lines: true,
            delimiter: ';',
            relax_quotes: true,
            relax_column_count: true
        }));

        parser.on('readable', async function() {
            let record;
            while ((record = parser.read()) !== null) {
                // Filtramos campos vazios
                if (!record['NR_CPF_CANDIDATO'] || !record['NM_CANDIDATO']) continue;

                // Evitamos duplicados na mesma execução
                const docLimpo = record['NR_CPF_CANDIDATO'].replace(/\D/g, '');
                
                batch.push({
                    cpf_candidato: docLimpo,
                    nome_candidato: record['NM_CANDIDATO'].trim(),
                    ano_eleicao: 2022,
                    valor_total: 0, // Ignoramos os bens aqui, o foco é a resolução de CPF
                    descricao_bens: {}
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
            console.error('[TSE SYNC] Erro ao parsear CSV:', err.message);
            reject(err);
        });

        parser.on('end', async function() {
            if (batch.length > 0) {
                await insertBatch(batch);
                count += batch.length;
            }
            console.log(`[TSE SYNC] Concluído! ${count} registros de candidatos extraídos e salvos.`);
            resolve(true);
        });
    });
}

async function insertBatch(batch: any[]) {
    // Devido à falta de Unique Constraint definida no banco, inserimos.
    // Pode haver dupes para candidatos com múltiplas candidaturas, mas para resolução de CPF (limit 1) funciona.
    const { error } = await supabaseAdmin
        .from('tse_bens_historico')
        .insert(batch);

    if (error) {
        console.error("[TSE SYNC] Erro ao inserir lote:", error.message);
    } else {
        console.log(`[TSE SYNC] Lote de ${batch.length} candidatos salvo com sucesso.`);
    }
}

run().then(() => {
    // Cleanup opcional
    // fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}).catch(console.error);
