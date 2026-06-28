import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Faltam variáveis de ambiente do Supabase.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log("Iniciando sincronização TSE Bens...");
    
    const mockData = [
        { cpf_candidato: '12345678900', ano_eleicao: 2018, valor_total: 500000, descricao_bens: { 'Imóveis': 400000, 'Veículos': 100000 } },
        { cpf_candidato: '12345678900', ano_eleicao: 2022, valor_total: 2500000, descricao_bens: { 'Imóveis': 2000000, 'Aeronaves': 500000 } }
    ];

    const { error } = await supabase
        .from('tse_bens_historico')
        .upsert(mockData, { onConflict: 'id' });

    if (error) {
        console.error("Erro ao sincronizar TSE:", error);
    } else {
        console.log("Sincronização TSE concluída!");
    }
}

main();
