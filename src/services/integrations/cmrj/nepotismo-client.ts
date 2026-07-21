import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function checkNepotismoCMRJ(nomePesquisado: string) {
	if (!nomePesquisado || nomePesquisado.length < 5) return null;

	// Evitar falsos positivos com nomes muito curtos ou "S/A", "LTDA"
	const isEmpresa = /S\/?A$|LTDA|MEI|EIRELI/i.test(nomePesquisado);
	if (isEmpresa) return null;

	const supabase = createClient(supabaseUrl, supabaseKey);

	// Usamos ILIKE via pg_trgm
	// Podemos procurar o nome exato ou parte dele (se for muito longo).
	// Para precisão, vamos fazer um match exato (com case insensível) ou um like forte.
	const { data, error } = await supabase
		.from("cmrj_servidores")
		.select("*")
		.ilike("nome", nomePesquisado.trim())
		.limit(1)
		.single();

	if (error || !data) return null;

	return data;
}
