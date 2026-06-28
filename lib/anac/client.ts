import { supabaseAdmin } from '../supabase-admin';

export interface AnacRab {
    prefixo: string;
    proprietario_documento: string;
    proprietario_nome: string;
    modelo: string;
    situacao: string;
    fabricante: string;
}

export async function buscarAeronavesProprietario(nomeOuDoc: string): Promise<AnacRab[]> {
    try {
        const { data, error } = await supabaseAdmin
            .from('anac_rab')
            .select('*')
            .ilike('proprietario_nome', `%${nomeOuDoc}%`)
            .limit(5);
            
        if (error) throw error;
        return data || [];
    } catch (e: any) {
        console.warn("[ANAC] Erro ao buscar aeronaves no Supabase:", e.message || e);
        return [];
    }
}
