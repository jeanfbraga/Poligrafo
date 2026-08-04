import { supabaseAdmin } from "@/lib/supabase-admin";

export interface AnacRab {
	prefixo: string;
	proprietario_documento: string;
	proprietario_nome: string;
	modelo: string;
	situacao: string;
	fabricante: string;
}

export async function buscarAeronavesProprietario(
	nomeOuDoc: string,
): Promise<AnacRab[]> {
	try {
		// Documento (CPF 11 / CNPJ 14 dígitos) casa na coluna de documento;
		// qualquer outra coisa é tratada como nome. Antes o CNPJ era jogado
		// contra proprietario_nome e nunca casava — a frota nunca aparecia.
		const doc = String(nomeOuDoc).replace(/\D/g, "");
		const isDoc =
			(doc.length === 11 || doc.length === 14) &&
			doc === String(nomeOuDoc).trim();

		let query = supabaseAdmin.from("anac_rab").select("*");
		query = isDoc
			? query.eq("proprietario_documento", doc)
			: query.ilike("proprietario_nome", `%${nomeOuDoc}%`);

		const { data, error } = await query.limit(5);

		if (error) throw error;
		return data || [];
	} catch (e: any) {
		console.warn(
			"[ANAC] Erro ao buscar aeronaves no Supabase:",
			e.message || e,
		);
		return [];
	}
}
