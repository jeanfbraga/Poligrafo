/**
 * Quem é o alvo, a partir da ref escolhida (FEDERAL:CAMARA:id, FEDERAL:SENADO:id, assembleias,
 * municípios, GOVERNADOR/PREFEITO/PRESIDENTE). Monta o antigo `deputadoBasico`.
 * Formatos de ref em services/core/alvo-ref.ts.
 */
import { buscarPolitico, buscarSenadoresLista } from "@/app/api/investigar/scrapers/legislativo";
import { buscarCpfNoTSE } from "@/app/api/investigar/tse";
import { alvoLocalDaRef, interpretarRef } from "@/services/core/alvo-ref";
import congressoIndex from "@/services/integrations/data/congresso-index.json";
import { type Execucao, status } from "./contexto";

type Casa = "CAMARA" | "SENADO";

const URI_CASA: Record<Casa, (id: string) => string> = {
	CAMARA: (id) => `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`,
	SENADO: (id) => `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${id}`,
};

function nomeDigitado(e: Execucao): string {
	return (e.p.nomeBruto || e.p.nomeParaBusca).toUpperCase();
}

function basicoFederal(e: Execucao, casa: Casa, id: string, nome: string, uf?: string) {
	return { id, uri: URI_CASA[casa](id), nome, uf: uf || e.p.ufScope || "BR", idLegislatura: 57, casa };
}

function doIndice(id: string): any {
	return (congressoIndex as any[]).find((p: any) => String(p.id) === String(id));
}

async function deputadoFederal(e: Execucao, id: string): Promise<any> {
	const local = doIndice(id);
	if (local) return basicoFederal(e, "CAMARA", id, local.nome, local.uf);
	const daApi: any = await buscarPolitico(`id=${id}`);
	if (!daApi) return basicoFederal(e, "CAMARA", id, nomeDigitado(e));
	daApi.id = id;
	daApi.casa = "CAMARA";
	return daApi;
}

async function senador(e: Execucao, id: string): Promise<any> {
	const local = doIndice(id);
	if (local) return basicoFederal(e, "SENADO", id, local.nome, local.uf);
	const lista = await buscarSenadoresLista(e.p.nomeParaBusca);
	return lista.find((s) => String(s.id) === id) || basicoFederal(e, "SENADO", id, nomeDigitado(e));
}

const CARGO_TSE: Record<string, string> = { GOVERNADOR: "3", PRESIDENTE: "1", PREFEITO: "11" };
const CASA_EXECUTIVO: Record<string, string> = { GOVERNADOR: "GOVERNO_ESTADUAL", PRESIDENTE: "PRESIDENCIA_DA_REPUBLICA", PREFEITO: "PREFEITURA" };

/** GOVERNADOR|PREFEITO|PRESIDENTE:{UF}:{nome}: documento pelo TSE ao vivo. */
async function executivo(e: Execucao, ref: string): Promise<any> {
	const partes = ref.split(":");
	const cargoTipo = partes[0];
	const uf = partes.length >= 2 ? partes[1].toUpperCase() : "BR";
	const nome = partes.length >= 3 ? partes[2] : e.p.nomeParaBusca;
	// Tenta buscar o documento no TSE dinamicamente
	status(e, `Buscando ${cargoTipo} "${nome}" na base eleitoral TSE...`);
	const tseDados = await buscarCpfNoTSE(nome, uf, CARGO_TSE[cargoTipo]);
	return {
		id: tseDados?.documentoPrincipal?.replace(/\D/g, "") || nome,
		uri: "",
		nome: tseDados?.nome || nome,
		uf,
		idLegislatura: tseDados?.anoEleicao || 2023,
		casa: CASA_EXECUTIVO[cargoTipo],
		// Preserva os dados do TSE para o nó PESSOA
		_tseResult: tseDados,
	};
}

const EXECUTIVOS = /^(GOVERNADOR|PREFEITO|PRESIDENTE):/;

/** null = ref sem alvo (a rota avisa e encerra). */
export async function resolverAlvoDireto(e: Execucao): Promise<any | null> {
	const ref = e.p.forceRef ?? "";
	if (ref.startsWith("FEDERAL:CAMARA:")) return deputadoFederal(e, ref.split(":")[2]);
	if (ref.startsWith("FEDERAL:SENADO:")) return senador(e, ref.split(":")[2]);
	// Municipais e assembleias, inclusive ESTADUAL:{UF}:{doc} (antes sem tratamento)
	// e prefeito de SP/RJ (antes virava vereador): ver services/core/alvo-ref.ts
	const local = alvoLocalDaRef(interpretarRef(ref), e.p.nomeBruto || e.p.nomeParaBusca);
	if (local) return local;
	return EXECUTIVOS.test(ref) ? executivo(e, ref) : null;
}
