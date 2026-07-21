import { supabaseAdmin } from "@/lib/supabase-admin";

export interface ImovelUniao {
	id?: number;
	uf: string;
	municipio_nome: string;
	endereco: string;
	tipo_imovel: string;
	area_m2: number;
	valor_imovel: number;
}

/**
 * Busca imóveis da União (SPU) em um dado município.
 * @param nomeMunicípio Nome da cidade
 * @param uf Opcional, para filtragem mais assertiva (ex: 'SP')
 */
export async function buscarImoveisMunicipioSupabase(
	nomeMunicipio: string,
	uf?: string,
): Promise<ImovelUniao[]> {
	if (!supabaseAdmin) {
		console.warn("[SPU] Cliente do Supabase ausente. Abortando busca.");
		return [];
	}

	try {
		let query = supabaseAdmin
			.from("spu_imoveis")
			.select("*")
			.ilike("municipio_nome", `%${nomeMunicipio}%`)
			.limit(50); // Prevenindo memory overload se houver milhares de imóveis

		if (uf) {
			query = query.eq("uf", uf.toUpperCase());
		}

		const { data, error } = await query;

		if (error) {
			console.error("[SPU] Erro na query do Supabase:", error.message);
			return [];
		}

		return (data as ImovelUniao[]) || [];
	} catch (e: any) {
		console.error("[SPU] Falha inesperada ao consultar Supabase:", e.message);
		return [];
	}
}
