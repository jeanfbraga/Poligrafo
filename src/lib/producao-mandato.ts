/* ==========================================================================
   Produção legislativa separada por mandato: um deputado pode ter passagens
   anteriores (suplência, outras legislaturas) e só o mandato atual deve
   contar como "projetos de autoria" de hoje.
   ========================================================================== */
import { INICIO_LEGISLATURA } from "@/lib/mandato";

type Registro = Record<string, any>;

export interface ProducaoPorMandato {
	atuais: Registro[];
	anteriores: Registro[];
	/** Data (AAAA-MM-DD) a partir da qual a proposição conta como do mandato atual. */
	inicioMandato: string;
}

/** Posse na legislatura atual; sem essa informação, o início da legislatura. */
export function inicioDoMandatoAtual(perfil: Registro | null | undefined): string {
	const posse = String(perfil?.data_posse ?? "").slice(0, 10);
	return posse > INICIO_LEGISLATURA ? posse : INICIO_LEGISLATURA;
}

const dataDe = (p: Registro): string => String(p?.data_apresentacao ?? "").slice(0, 10);

/** Proposição sem data não é descartada: fica no mandato atual (não há como provar que é antiga). */
export function separarProducao(producao: Registro[] | null | undefined, perfil: Registro | null | undefined): ProducaoPorMandato {
	const inicioMandato = inicioDoMandatoAtual(perfil);
	const atuais: Registro[] = [];
	const anteriores: Registro[] = [];
	for (const p of producao ?? []) {
		const d = dataDe(p);
		(d && d < inicioMandato ? anteriores : atuais).push(p);
	}
	return { atuais, anteriores, inicioMandato };
}
