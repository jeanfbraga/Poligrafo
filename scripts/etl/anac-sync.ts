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
    console.log("Iniciando sincronização ANAC RAB...");
    // Em produção, leria o dataset diário RAB.zip.
    
    const mockData = [
        { prefixo: 'PR-XYZ', proprietario_documento: '00000000000191', proprietario_nome: 'EMPRESA TESTE S/A', modelo: 'KING AIR C90', situacao: 'AERONAVEGAVEL', fabricante: 'BEECHCRAFT' },
        { prefixo: 'PT-LBS', proprietario_documento: '12345678900', proprietario_nome: 'POLITICO GENERICO DA SILVA', modelo: 'ROBINSON R44', situacao: 'AERONAVEGAVEL', fabricante: 'ROBINSON HELICOPTER' }
    ];

    const { error } = await supabase
        .from('anac_rab')
        .upsert(mockData, { onConflict: 'prefixo' });

    if (error) {
        console.error("Erro ao sincronizar ANAC:", error);
    } else {
        console.log("Sincronização ANAC concluída!");
    }
}

main();
