import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const transparenciaKey = process.env.TRANSPARENCIA_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("ERRO: Faltando credenciais do Supabase.");
    process.exit(1);
}

if (!transparenciaKey) {
    console.error("ERRO: Faltando chave TRANSPARENCIA_API_KEY.");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const ANO_ATUAL = new Date().getFullYear();
const API_BASE = 'https://api.portaldatransparencia.gov.br/api-de-dados/emendas';

// Auxiliar para converter valor "10.000,00" para float
function parseValor(valor: string | undefined): number {
    if (!valor) return 0;
    const clean = valor.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

async function syncAno(ano: number) {
    console.log(`[EMENDAS PIX SYNC] Buscando Emendas PIX (Transparência) para o ano ${ano}...`);
    
    let pagina = 1;
    let hasMore = true;
    let totalSynced = 0;

    // Limpa o ano atual para evitar duplicatas antes do repopulate
    console.log(`[EMENDAS PIX SYNC] Limpando registros antigos de ${ano}...`);
    await supabaseAdmin.from('emendas_pix').delete().eq('ano', ano);

    while (hasMore) {
        const url = `${API_BASE}?ano=${ano}&pagina=${pagina}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'chave-api-dados': transparenciaKey!,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.error(`[EMENDAS PIX SYNC] Erro HTTP ${response.status}: ${response.statusText}`);
                break;
            }

            const data = await response.json();
            
            if (!Array.isArray(data) || data.length === 0) {
                hasMore = false;
                break;
            }

            // Filtramos apenas as transferências especiais ("emendas PIX")
            const pixData = data.filter((e: any) => 
                e.tipoEmenda && e.tipoEmenda.includes('Transferências Especiais')
            );

            if (pixData.length > 0) {
                const batch = pixData.map((raw: any) => ({
                    id: `${raw.codigoEmenda || 'N/A'}-${ano}`,
                    ano: raw.ano || ano,
                    autor: raw.nomeAutor || 'DESCONHECIDO',
                    uf_destino: raw.localidadeDoGasto ? raw.localidadeDoGasto.split('-').pop()?.trim() : 'N/A',
                    municipio_destino: raw.localidadeDoGasto || 'N/A',
                    valor_custeio: parseValor(raw.valorEmpenhado), // Usando empenhado como proxy
                    valor_investimento: parseValor(raw.valorPago) // Usando pago como proxy de investimento no dataset simplificado
                }));

                const uniqueBatch = Array.from(new Map(batch.map((item: any) => [item.id, item])).values());

                const { error } = await supabaseAdmin
                    .from('emendas_pix')
                    .upsert(uniqueBatch, { onConflict: 'id' });

                if (error) {
                    console.error(`[EMENDAS PIX SYNC] Erro ao inserir lote:`, error.message);
                    break;
                }

                totalSynced += uniqueBatch.length;
            }
            
            console.log(`[EMENDAS PIX SYNC] Página ${pagina} processada. Acumulado: ${totalSynced} emendas PIX sincronizadas...`);
            pagina++;

            // Proteção para não estourar a API caso o loop saia do controle
            if (pagina > 500) {
                console.log("[EMENDAS PIX SYNC] Atingiu limite de segurança (500 páginas).");
                break;
            }

        } catch (e: any) {
            console.error(`[EMENDAS PIX SYNC] Erro na request:`, e.message);
            break;
        }
    }
    
    console.log(`[EMENDAS PIX SYNC] Finalizado para ${ano}. Total: ${totalSynced}`);
}

async function run() {
    console.log("[EMENDAS PIX SYNC] Iniciando...");
    await syncAno(ANO_ATUAL);
    await syncAno(ANO_ATUAL - 1); 
    console.log("[EMENDAS PIX SYNC] Concluído com sucesso!");
}

run().catch(console.error);
