import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import https from 'https';


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

async function run() {
    console.log("[CMRJ ETL] Iniciando sincronização da Relação de Servidores da Câmara Municipal do Rio de Janeiro...");

    const baseUrl = 'https://aplicsc.camara.rj.gov.br';
    const initUrl = `${baseUrl}/scriptcase/Sistemas/Portal_Transparencia/DadosAbertos/Cons_Relacao_Servidores_API_json/?ANOINGRESSO=0`;

    console.log(`[CMRJ ETL] 1. Requisitando endpoint disparador: ${initUrl}`);
    const initResponse = await fetch(initUrl);
    const initHtml = await initResponse.text();

    // A resposta é um HTML gerado pelo ScriptCase contendo um redirecionamento via JS
    // Ex: window.location='/scriptcase/tmp/Relacao_Servidores.json';
    const match = initHtml.match(/window\.location='([^']+)'/);
    if (!match) {
        console.error("[CMRJ ETL] Falha ao encontrar o link de redirecionamento no HTML.");
        console.log(initHtml.substring(0, 500));
        process.exit(1);
    }

    const jsonPath = match[1];
    const jsonUrl = `${baseUrl}${jsonPath}`;
    
    console.log(`[CMRJ ETL] 2. Baixando payload JSON gerado: ${jsonUrl}`);
    const jsonResponse = await fetch(jsonUrl);
    const data = await jsonResponse.json() as any[];

    if (!Array.isArray(data)) {
        console.error("[CMRJ ETL] O payload retornado não é um array válido.");
        process.exit(1);
    }

    console.log(`[CMRJ ETL] 3. Payload recebido com sucesso! Total de servidores ativos: ${data.length}`);

    let batch = [];
    let count = 0;

    // Limpamos a tabela primeiro para ser um "Sync" total (wipe and replace)
    // Usaremos delete by id > 0 para limpar os registros antigos sem dar drop table.
    console.log("[CMRJ ETL] 4. Limpando tabela cmrj_servidores atual...");
    const { error: deleteError } = await supabaseAdmin.from('cmrj_servidores').delete().neq('id', 0);
    if (deleteError) {
        console.error("[CMRJ ETL] Erro ao limpar tabela:", deleteError.message);
    }

    console.log("[CMRJ ETL] 5. Inserindo novos dados...");
    
    for (const record of data) {
        batch.push({
            nome: record['Nome']?.trim(),
            vinculo: record['Vínculo']?.trim(),
            simbolo: record['Símbolo']?.trim() || null,
            cargo: record['Cargo ou Função Gratificada']?.trim() || null,
            lotacao: record['Lotação']?.trim(),
            data_ingresso: record['Data de Ingresso']?.trim(),
            data_publicacao: record['Data de Publicação']?.trim(),
            num_resolucao: record['Num. da Resolução']?.trim()
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

    console.log(`[CMRJ ETL] Sincronização concluída com sucesso! Foram inseridos ${count} servidores.`);
}

async function insertBatch(batch: any[]) {
    const { error } = await supabaseAdmin.from('cmrj_servidores').insert(batch);
    if (error) {
        console.error("[CMRJ ETL] Erro ao inserir lote:", error.message);
    } else {
        console.log(`[CMRJ ETL] Lote de ${batch.length} servidores salvo com sucesso.`);
    }
}

run().catch(err => {
    console.error("[CMRJ ETL] Erro fatal:", err);
});
