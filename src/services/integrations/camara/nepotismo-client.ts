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
export async function checkNepotismoCamara(
	nomePesquisado: string,
	idDeputadoAlvo?: number,
): Promise<NepotismoCamaraMatch | null> {
	if (!nomePesquisado || nomePesquisado.trim().length < 5) return null;

	const nomeLimpo = nomePesquisado.trim();

	// Evitar falsos positivos com termos corporativos
	if (/S\/?A$|LTDA|MEI|EIRELI|ASSOCIACAO|INSTITUTO/i.test(nomeLimpo)) {
		return null;
	}

	try {
		// 1. Prioridade: verificar se está no gabinete do PRÓPRIO deputado investigado
		if (idDeputadoAlvo) {
			const { data: direto, error: errDireto } = await supabasePerfilAdmin
				.from("camara_servidores_gabinete")
				.select("*")
				.eq("deputado_id", idDeputadoAlvo)
				.ilike("nome", nomeLimpo)
				.limit(1)
				.maybeSingle();

			if (!errDireto && direto) {
				return {
					deputado_id: direto.deputado_id,
					nome: direto.nome,
					cargo: direto.cargo || "Secretário Parlamentar",
					periodo: direto.periodo,
					tipoVinculo: "GABINETE_DIRETO",
				};
			}
		}

		// 2. Consulta em toda a base da Câmara (outros gabinetes ou geral)
		const { data: geral, error: errGeral } = await supabasePerfilAdmin
			.from("camara_servidores_gabinete")
			.select("*")
			.ilike("nome", nomeLimpo)
			.limit(1)
			.maybeSingle();

		if (!errGeral && geral) {
			return {
				deputado_id: geral.deputado_id,
				nome: geral.nome,
				cargo: geral.cargo || "Secretário Parlamentar",
				periodo: geral.periodo,
				tipoVinculo: idDeputadoAlvo && geral.deputado_id === idDeputadoAlvo
					? "GABINETE_DIRETO"
					: "CAMARA_GERAL",
			};
		}

		return null;
	} catch (err: any) {
		console.warn("[NEPOTISMO CAMARA] Falha ao consultar servidores:", err.message);
		return null;
	}
}
