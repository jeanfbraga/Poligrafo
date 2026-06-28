import { supabaseAdmin } from '@/lib/supabase-admin';

export interface TseBensHistorico {
    cpf_candidato: string;
    ano_eleicao: number;
    valor_total: number;
    descricao_bens: any;
}

export async function buscarBensHistoricoTSE(cpf: string): Promise<TseBensHistorico[]> {
    try {
        const docLimpo = cpf.replace(/\D/g, '');
        const { data, error } = await supabaseAdmin
            .from('tse_bens_historico')
            .select('*')
            .eq('cpf_candidato', docLimpo)
            .order('ano_eleicao', { ascending: false });
            
        if (error) throw error;
        return data || [];
    } catch (e: any) {
        console.warn("[TSE] Erro ao buscar bens históricos no Supabase:", e.message || e);
        return [];
    }
}
