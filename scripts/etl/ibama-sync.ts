import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
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
    console.log("Iniciando sincronização IBAMA...");
    // Em produção, isso faria download do CSV do IBAMA via stream.
    // Como POC, leremos de um arquivo local simulado ou faremos dummy insert.
    
    // Inserindo dados de teste simulando CSV parse para teste do Polígrafo
    const mockData = [
        { cpf_cnpj: '00000000000191', nome_infrator: 'EMPRESA TESTE S/A', valor_multa: 500000, tipo_infracao: 'Desmatamento', data_auto: '2024-01-01' },
        { cpf_cnpj: '11111111111111', nome_infrator: 'MADEIREIRA ILEGAL', valor_multa: 1500000, tipo_infracao: 'Transporte Ilegal de Madeira', data_auto: '2023-05-15' }
    ];

    const { error } = await supabase
        .from('ibama_infracoes')
        .upsert(mockData, { onConflict: 'id' });

    if (error) {
        console.error("Erro ao sincronizar IBAMA:", error);
    } else {
        console.log("Sincronização IBAMA concluída!");
    }
}

main();
