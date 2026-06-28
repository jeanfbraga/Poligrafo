import { fetchWithTimeout, normalizeString } from '../../tse';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function buscarServidoresCMRJ(nomeVereador: string): Promise<any[]> {
    if (!nomeVereador) return [];
    
    console.log(`[CÂMARA RJ] Buscando servidores para o vereador: ${nomeVereador}`);
    const servidoresRelacionados: any[] = [];
    
    try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // 1. Find the cabinet number for this vereador
        const { data: gabineteData, error: gabineteError } = await supabase
            .from('cmrj_vereador_gabinete')
            .select('gabinete_numero')
            .ilike('nome_urna', `%${nomeVereador.trim()}%`)
            .limit(1)
            .single();
            
        if (gabineteError || !gabineteData) {
            console.warn(`[CÂMARA RJ] Gabinete não encontrado para: ${nomeVereador}. Erro:`, gabineteError?.message);
            return [];
        }
        
        const lotacao = gabineteData.gabinete_numero;
        console.log(`[CÂMARA RJ] Encontrado gabinete para ${nomeVereador}: ${lotacao}`);
        
        // 2. Fetch servants for this cabinet
        const { data: servidores, error: servidoresError } = await supabase
            .from('cmrj_servidores')
            .select('*')
            .eq('lotacao', lotacao);
            
        if (servidoresError || !servidores) {
            console.warn(`[CÂMARA RJ] Falha ao buscar servidores do ${lotacao}:`, servidoresError?.message);
            return [];
        }
        
        for (const serv of servidores) {
            servidoresRelacionados.push({
                nome: serv.nome,
                cargo: serv.cargo,
                salario: serv.remuneracao || "N/A",
                tipoVinculo: "Comissionado" // Todo servidor de gabinete é comissionado
            });
        }
        
        console.log(`[CÂMARA RJ] ${servidoresRelacionados.length} servidores encontrados para ${nomeVereador}`);
        
    } catch (error: any) {
        console.warn(`[CÂMARA RJ] Falha ao extrair servidores via Supabase:`, error.message);
    }
    
    return servidoresRelacionados;
}

