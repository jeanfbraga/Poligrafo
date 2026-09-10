import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export interface NepotismoCamaraMatch {
	deputado_id: number;
	nome: string;
	cargo: string;
	periodo?: string;
	tipoVinculo: "GABINETE_DIRETO" | "CAMARA_GERAL";
}

/**
 * Verifica se um nome pesquisado (sócio de fornecedor ou doador)
 * consta na folha de servidores/comissionados da Câmara dos Deputados.
 * 
 * @param nomePesquisado Nome da pessoa física a verificar
 * @param idDeputadoAlvo ID do deputado atualmente sob investigação
 */
function ehNomeInvalidoParaPessoa(nome: string): boolean {
	if (!nome || nome.trim().length < 5) return true;
	return /S\/?A$|LTDA|MEI|EIRELI|ASSOCIACAO|INSTITUTO/i.test(nome.trim());
}

async function buscarServidorGabinete(nome: string, idDeputado?: number) {
	let query = supabasePerfilAdmin
		.from("camara_servidores_gabinete")
		.select("*")
		.ilike("nome", nome)
		.limit(1);

	if (idDeputado) {
		query = query.eq("deputado_id", idDeputado);
	}

	const { data, error } = await query.maybeSingle();
	return !error && data ? data : null;
}

/**
 * Verifica se um nome pesquisado (sócio de fornecedor ou doador)
 * consta na folha de servidores/comissionados da Câmara dos Deputados.
 * 
 * @param nomePesquisado Nome da pessoa física a verificar
 * @param idDeputadoAlvo ID do deputado atualmente sob investigação
 */
export async function checkNepotismoCamara(
	nomePesquisado: string,
	idDeputadoAlvo?: number,
): Promise<NepotismoCamaraMatch | null> {
	if (ehNomeInvalidoParaPessoa(nomePesquisado)) return null;

	const nomeLimpo = nomePesquisado.trim();

	try {
		if (idDeputadoAlvo) {
			const direto = await buscarServidorGabinete(nomeLimpo, idDeputadoAlvo);
			if (direto) {
				return {
					deputado_id: direto.deputado_id,
					nome: direto.nome,
					cargo: direto.cargo || "Secretário Parlamentar",
					periodo: direto.periodo,
					tipoVinculo: "GABINETE_DIRETO",
				};
			}
		}

		const geral = await buscarServidorGabinete(nomeLimpo);
		if (geral) {
			const ehDireto = Boolean(idDeputadoAlvo && geral.deputado_id === idDeputadoAlvo);
			return {
				deputado_id: geral.deputado_id,
				nome: geral.nome,
				cargo: geral.cargo || "Secretário Parlamentar",
				periodo: geral.periodo,
				tipoVinculo: ehDireto ? "GABINETE_DIRETO" : "CAMARA_GERAL",
			};
		}

		return null;
	} catch (err: any) {
		console.warn("[NEPOTISMO CAMARA] Falha ao consultar servidores:", err.message);
		return null;
	}
}
