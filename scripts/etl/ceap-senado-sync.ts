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

const ANO_ATUAL = new Date().getFullYear();
const BATCH_SIZE = 1000;
const TEMP_DIR = path.join(process.cwd(), '.tmp_ceap_senado');

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

async function prepare(ano: number) {
    console.log(`[SENADO SYNC] Limpando dados antigos (ano ${ano})...`);
    try {
        const { error } = await supabaseAdmin
            .from('ceap_despesas_cache')
            .delete()
            .eq('ano', ano)
            .eq('casa', 'SENADO');
            
        if (error) {
            console.error(`[SENADO SYNC] Erro ao deletar despesas antigas: ${error.message}`);
        } else {
            console.log(`[SENADO SYNC] Despesas antigas (ano ${ano}) deletadas com sucesso.`);
        }
    } catch (e) {
        console.error(`[SENADO SYNC] Erro fatal no delete:`, e);
    }
}

async function downloadCsv(ano: number): Promise<string | null> {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    const csvPath = path.join(TEMP_DIR, `Senado-${ano}.csv`);

    console.log(`[SENADO SYNC] Baixando despesas do Senado para ${ano}...`);
    const url = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${ano}/csv`;
    console.log(`URL: ${url}`);

    try {
        // -f: fail silently on server errors, -L: follow redirects, -o: output file
        execSync(`curl -f -L -o "${csvPath}" ${url}`, { stdio: 'inherit' });
    } catch (e) {
        console.log(`[SENADO SYNC] Arquivo para o ano ${ano} não encontrado ou erro no curl.`);
        return null;
    }

    const stat = fs.statSync(csvPath);
    if (stat.size < 5000) {
        console.error(`[SENADO SYNC] Arquivo muito pequeno. Abortando.`);
        return null;
    }

    return csvPath;
}

// ============================================================================
// EXECUÇÃO POR ANO
// ============================================================================

function parsearCsvSenado(csvPath: string): any[] {
    const fileContent = fs.readFileSync(csvPath, 'latin1');
    const lines = fileContent.split('\n');
    const realContent = lines.slice(1).join('\n');
    return parse(realContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ';',
        relax_quotes: true,
        relax_column_count: true,
        bom: true
    });
}

function extrairValorReembolsado(val: string | undefined): number {
    if (!val) return 0;
    return Number(val.replace(/\./g, "").replace(",", "."));
}

function mapearRegistroSenado(record: any, ano: number): Record<string, any> | null {
    if (!record['SENADOR']) return null;

    const idSenadorStr = record['CODIGO_PARLAMENTAR'] || "0";
    const idSenador = parseInt(idSenadorStr, 10);
    if (!idSenador || isNaN(idSenador)) return null;

    const valorDespesa = extrairValorReembolsado(record['VALOR_REEMBOLSADO']);
    const cnpjCpf = record['CNPJ_CPF'] ? record['CNPJ_CPF'].replace(/[^\d]/g, "") : null;

    return {
        id_deputado: idSenador,
        ano,
        cnpj_cpf_fornecedor: cnpjCpf,
        nome_fornecedor: record['FORNECEDOR'] || 'FORNECEDOR NÃO IDENTIFICADO',
        tipo_despesa: record['TIPO_DESPESA'] || 'SEM TIPO',
        valor_documento: valorDespesa,
        data_documento: record['DATA'] || `${ano}-01-01`,
        url_documento: record['DOCUMENTO'] || null,
        casa: 'SENADO',
        atualizado_em: new Date().toISOString()
    };
}

async function salvarLoteSenado(batch: any[]): Promise<void> {
    if (batch.length === 0) return;
    const { error } = await supabaseAdmin.from('ceap_despesas_cache').insert(batch);
    if (error) console.error(`[SENADO SYNC] Erro ao inserir lote:`, error.message);
}

async function runForYear(ano: number): Promise<{ success: boolean; count: number }> {
    const csvPath = await downloadCsv(ano);
    if (!csvPath) return { success: false, count: 0 };

    await prepare(ano);
    console.log(`[SENADO SYNC] Parseando e inserindo CSV: ${csvPath}`);

    let batch: any[] = [];
    let count = 0;
    const records = parsearCsvSenado(csvPath);

    for (const record of records) {
        const item = mapearRegistroSenado(record, ano);
        if (!item) continue;

        batch.push(item);
        count++;

        if (batch.length >= BATCH_SIZE) {
            await salvarLoteSenado(batch);
            batch = [];
        }
    }

    await salvarLoteSenado(batch);
    return { success: true, count };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log(`[SENADO SYNC] Iniciando sincronização da CEAP do Senado...`);

    // Senado é mais leve, baixar o ano atual e o anterior
    const anos = [ANO_ATUAL, ANO_ATUAL - 1];

    for (const ano of anos) {
        console.log(`\n======================================================`);
        console.log(` Processando ano: ${ano}`);
        console.log(`======================================================`);
        const { success, count } = await runForYear(ano);
        if (success) {
            console.log(`✅ [SENADO SYNC] Ano ${ano} concluído. Total de registros processados: ${count}`);
        } else {
            console.log(`❌ [SENADO SYNC] Falha no processamento do ano ${ano}.`);
        }
    }

    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }

    console.log(`\n🎉 [SENADO SYNC] Sincronização finalizada!`);
    process.exit(0);
}

main().catch(err => {
    console.error("[SENADO SYNC] Fatal erro:", err);
    process.exit(1);
});
