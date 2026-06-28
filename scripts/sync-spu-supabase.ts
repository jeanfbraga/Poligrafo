import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase (Service Role para ignorar RLS e fazer bypass)
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO CRÍTICO: Faltando credenciais administrativas do Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const BATCH_SIZE = 1000;

async function run() {
    console.log("[SPU SYNC] Iniciando sincronização SPU -> Supabase");
    const csvPath = path.join(process.cwd(), 'scripts', 'patrimonio-uniao.csv');

    if (!fs.existsSync(csvPath)) {
        console.error(`[SPU SYNC] Arquivo não encontrado: ${csvPath}`);
        console.log("Baixe o arquivo CSV do SPU e coloque em scripts/patrimonio-uniao.csv");
        process.exit(1);
    }

    let batch: any[] = [];
    let count = 0;

    const parser = fs.createReadStream(csvPath).pipe(parse({
        columns: true,
        skip_empty_lines: true,
        delimiter: ';' // Pode precisar ajustar baseado no arquivo real do SPU
    }));

    for await (const record of parser) {
        batch.push({
            uf: record['UF']?.trim().toUpperCase(),
            municipio_nome: record['Municipio']?.trim(),
            endereco: record['Endereco']?.trim(),
            tipo_imovel: record['Tipo_Imovel']?.trim(),
            area_m2: parseFloat(record['Area_m2']?.replace(',', '.') || '0'),
            valor_imovel: parseFloat(record['Valor_Imovel']?.replace(',', '.') || '0')
        });

        if (batch.length >= BATCH_SIZE) {
            await insertBatch(batch);
            count += batch.length;
            batch = [];
        }
    }

    if (batch.length > 0) {
        await insertBatch(batch);
        count += batch.length;
    }

    console.log(`[SPU SYNC] Concluído! ${count} registros inseridos/atualizados.`);
}

async function insertBatch(batch: any[]) {
    const { error } = await supabaseAdmin
        .from('spu_imoveis')
        .upsert(batch, { onConflict: 'endereco' }); // Endereço como chave, ajuste conforme o schema real

    if (error) {
        console.error("[SPU SYNC] Erro ao inserir lote:", error.message);
    } else {
        console.log(`[SPU SYNC] Lote de ${batch.length} registros inserido com sucesso.`);
    }
}

run().catch(console.error);
