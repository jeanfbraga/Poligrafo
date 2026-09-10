import { parse } from 'csv-parse/sync';
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

const TEMP_DIR = path.join(process.cwd(), '.tmp_cgu');
const BATCH_SIZE = 1500;

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function getDownloadDate(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}

async function downloadZipForBase(baseName: string): Promise<{ zipPath: string, dateStr: string } | null> {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // Tenta baixar a partir de D-1 até D-10 para lidar com finais de semana e feriados da CGU
    for (let offset = 1; offset <= 10; offset++) {
        const dateStr = getDownloadDate(offset);
        const zipPath = path.join(TEMP_DIR, `${baseName}_${dateStr}.zip`);
        
        console.log(`[CGU SYNC] Tentando baixar ${baseName.toUpperCase()} para a data ${dateStr}...`);
        const url = `https://portaldatransparencia.gov.br/download-de-dados/${baseName}/${dateStr}`;
        
        try {
            // A CGU retorna 404 se o arquivo do dia não existir. curl -f falha silenciosamente.
            execSync(`curl -f -L -o "${zipPath}" ${url}`, { stdio: 'ignore' });
            
            const stat = fs.statSync(zipPath);
            if (stat.size > 1000) {
                console.log(`[CGU SYNC] Sucesso ao baixar ${baseName} (${dateStr}). Tamanho: ${Math.round(stat.size/1024)} KB`);
                return { zipPath, dateStr };
            }
        } catch (e) {
            // Falhou, tenta o próximo dia
        }
    }
    
    console.error(`[CGU SYNC] Não foi possível encontrar dados recentes para ${baseName}.`);
    return null;
}

async function prepare(baseName: string) {
    const tipo = baseName.toUpperCase();
    console.log(`[CGU SYNC] Limpando dados antigos da base ${tipo}...`);
    try {
        const { error } = await supabaseAdmin
            .from('cgu_sancoes_cache')
            .delete()
            .eq('tipo_sancao', tipo);
        if (error) console.error(`[CGU SYNC] Erro ao deletar ${tipo}:`, error.message);
    } catch (e) {
        console.error(`[CGU SYNC] Erro fatal no delete:`, e);
    }
}

// ============================================================================
// PROCESSAMENTO
// ============================================================================

function extrairArquivoZipCgu(zipPath: string, tipo: string): boolean {
    console.log(`[CGU SYNC] Extraindo ${tipo}...`);
    try {
        try {
            execSync(`tar -xf "${zipPath}" -C "${TEMP_DIR}"`, { stdio: 'ignore' });
        } catch {
            execSync(`unzip -o "${zipPath}" -d "${TEMP_DIR}"`, { stdio: 'ignore' });
        }
        return true;
    } catch {
        console.error(`[CGU SYNC] Erro ao extrair ZIP do ${tipo}.`);
        return false;
    }
}

function encontrarCsvExtraido(tipo: string): string | null {
    const files = fs.readdirSync(TEMP_DIR);
    const csvFile = files.find(f => f.toUpperCase().includes(tipo) && f.endsWith('.csv'));
    if (!csvFile) {
        console.error(`[CGU SYNC] Arquivo CSV não encontrado dentro do ZIP de ${tipo}.`);
        return null;
    }
    return path.join(TEMP_DIR, csvFile);
}

function extrairIdentificacaoCgu(record: any): { cpfCnpj: string; nome: string | null } | null {
    const rawDoc = record['CPF OU CNPJ DO SANCIONADO'] || record['CPF'] || record['CPF/CNPJ'];
    if (!rawDoc) return null;

    const cpfCnpj = rawDoc.replace(/[^\d]/g, "");
    if (cpfCnpj.length < 11) return null;

    const rawNome = record['NOME DO SANCIONADO'] || record['NOME'] || record['NOME DA PESSOA'];
    return {
        cpfCnpj,
        nome: rawNome ? rawNome.toUpperCase() : null
    };
}

function extrairDatasCgu(record: any) {
    const dataInicio = record['DATA INÍCIO SANÇÃO'] || record['DATA DE INÍCIO DA SANÇÃO'] || null;
    const dataFim = record['DATA FINAL SANÇÃO'] || record['DATA DE FIM DA SANÇÃO'] || null;
    return { dataInicio, dataFim };
}

function extrairDescricaoCgu(record: any): string | null {
    return record['FUNDAMENTAÇÃO LEGAL'] || record['DESCRIÇÃO DA FUNÇÃO'] || record['MOTIVO'] || null;
}

function mapearRegistroCgu(record: any, tipo: string) {
    const ident = extrairIdentificacaoCgu(record);
    if (!ident) return null;

    const { dataInicio, dataFim } = extrairDatasCgu(record);
    const orgao = record['ÓRGÃO SANCIONADOR'] || record['ÓRGÃO'] || null;

    return {
        cpf_cnpj: ident.cpfCnpj,
        nome: ident.nome,
        tipo_sancao: tipo,
        data_inicio: dataInicio,
        data_fim: dataFim,
        orgao,
        descricao: extrairDescricaoCgu(record),
        created_at: new Date().toISOString()
    };
}

async function salvarLoteCgu(batch: any[], tipo: string): Promise<void> {
    if (batch.length === 0) return;
    const { error } = await supabaseAdmin.from('cgu_sancoes_cache').insert(batch);
    if (error) console.error(`[CGU SYNC] Erro ao inserir lote de ${tipo}:`, error.message);
}

async function processBase(baseName: string) {
    const result = await downloadZipForBase(baseName);
    if (!result) return;

    const tipo = baseName.toUpperCase();
    if (!extrairArquivoZipCgu(result.zipPath, tipo)) return;

    const csvPath = encontrarCsvExtraido(tipo);
    if (!csvPath) return;

    await prepare(baseName);
    console.log(`[CGU SYNC] Parseando e inserindo CSV: ${csvPath}`);
    
    const fileContent = fs.readFileSync(csvPath, 'latin1'); 
    const records: any[] = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ';',
        relax_quotes: true,
        relax_column_count: true,
        bom: true
    });

    let batch: any[] = [];
    let count = 0;

    for (const record of records) {
        const item = mapearRegistroCgu(record, tipo);
        if (!item) continue;

        batch.push(item);
        count++;

        if (batch.length >= BATCH_SIZE) {
            await salvarLoteCgu(batch, tipo);
            batch = [];
        }
    }

    await salvarLoteCgu(batch, tipo);
    console.log(`✅ [CGU SYNC] ${tipo} concluído! Registros: ${count}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log(`[CGU SYNC] Iniciando sincronização massiva da CGU...`);

    const bases = ['ceis', 'cnep', 'ceaf', 'pep'];

    for (const base of bases) {
        await processBase(base);
    }

    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }

    console.log(`\n🎉 [CGU SYNC] Sincronização finalizada!`);
    process.exit(0);
}

main().catch(err => {
    console.error("[CGU SYNC] Fatal erro:", err);
    process.exit(1);
});
