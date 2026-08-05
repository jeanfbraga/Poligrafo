import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais administrativas do Supabase.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
    console.log("[GARBAGE COLLECTOR] Iniciando rotina de limpeza do banco de dados...");
    
    // Calculamos a data limite de 30 dias atrás
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);
    const dataLimiteISO = dataLimite.toISOString();

    try {
        console.log(`[GARBAGE COLLECTOR] Excluindo pesquisas cacheadas antes de ${dataLimiteISO}...`);
        // A tabela 'pesquisas' armazena o cache dos grafos das investigações antigas
        const { error: erroPesquisas, count: countPesquisas } = await supabaseAdmin
            .from('pesquisas')
            .delete({ count: 'exact' })
            .lt('atualizado_em', dataLimiteISO);

        if (erroPesquisas) {
            console.error("[GARBAGE COLLECTOR] Erro ao limpar pesquisas:", erroPesquisas.message);
        } else {
            console.log(`[GARBAGE COLLECTOR] Sucesso: ${countPesquisas || 0} pesquisas antigas deletadas.`);
        }

        // Limpeza de tabelas temporárias adicionais ou de cache de automação (Ex: tse_doadores_cache)
        // O TSE e CEAP podem crescer muito. Podemos limpar consultas pontuais que já caducaram,
        // mas vamos iniciar mantendo as pesquisas (o grafo gigante) limpo.

        console.log("[GARBAGE COLLECTOR] Rotina de limpeza finalizada com sucesso!");
    } catch (error) {
        console.error("[GARBAGE COLLECTOR] Erro fatal durante a limpeza:", error);
    }
}

run();
