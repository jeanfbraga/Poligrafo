import { supabaseAdmin } from "@/lib/supabase-admin";

export interface IbamaInfracao {
	cpf_cnpj: string;
	nome_infrator: string;
	valor_multa: number;
	tipo_infracao: string;
	data_auto: string;
}

export async function buscarInfracoesIbama(
	cpfOuCnpj: string,
): Promise<IbamaInfracao[]> {
	try {
		const docLimpo = cpfOuCnpj.replace(/\D/g, "");
		const { data, error } = await supabaseAdmin
			.from("ibama_infracoes")
			.select("*")
			.eq("cpf_cnpj", docLimpo);

		if (error) throw error;
		return data || [];
	} catch (e: any) {
		console.warn(
			"[IBAMA] Erro ao buscar infrações no Supabase:",
			e.message || e,
		);
		return [];
	}
}
