/**
 * Identificação eleitoral do alvo lendo PRIMEIRO as nossas bases (eleitos + patrimônio) e só
 * depois, se faltar, o DivulgaCand do TSE ao vivo. Fora da função legada do investigador.
 */
import { buscarCpfNoTSE, type TseCandidateResult } from "@/app/api/investigar/tse";
import { buscarEleitoDoAlvo, type AlvoEleito, type EleitoDoAlvo } from "@/services/integrations/tse/eleitos";
import { tseDaBase } from "@/services/integrations/tse/tse-da-base";
import { emitirEtapa } from "./etapas-ao-vivo";

type Emissor = (tipo: string, payload: any) => void;

export interface ConsultaTseDoAlvo {
	alvo: AlvoEleito & { nome: string; uf: string; cargoTse: string };
	nomeCivil?: string;
	municipio?: string;
}

export interface DependenciasTse {
	buscarEleito: (alvo: AlvoEleito) => Promise<EleitoDoAlvo | null>;
	daBase: (eleito: EleitoDoAlvo | null) => Promise<TseCandidateResult | null>;
	aoVivo: typeof buscarCpfNoTSE;
}

const PADRAO: DependenciasTse = { buscarEleito: buscarEleitoDoAlvo, daBase: tseDaBase, aoVivo: buscarCpfNoTSE };

const ORIGEM_BASE = "Base do TSE no Polígrafo (eleitos e bens declarados)";

function detalheDaBase(r: TseCandidateResult): string {
	const anos = (r.historicoPatrimonio ?? []).map((h) => h.ano).join(" e ");
	return anos ? `Eleito e patrimônio declarado (${anos})` : "Eleito confirmado (sem declaração de bens na base)";
}

export async function dadosTseDoAlvo(
	consulta: ConsultaTseDoAlvo,
	sendEvent: Emissor,
	deps: DependenciasTse = PADRAO,
): Promise<{ tseResult: TseCandidateResult | null; eleito: EleitoDoAlvo | null }> {
	const eleito = await deps.buscarEleito(consulta.alvo).catch(() => null);
	const daBase = await deps.daBase(eleito).catch(() => null);
	if (daBase) {
		sendEvent("STATUS", { msg: "[TSE] Dados eleitorais e patrimônio lidos da nossa base (sem consultar o site do TSE)." });
		emitirEtapa(sendEvent, { fonte: "tse", estado: "concluida", origem: ORIGEM_BASE, detalhe: detalheDaBase(daBase) });
		return { tseResult: daBase, eleito };
	}
	const { nome, uf, cargoTse } = consulta.alvo;
	const aoVivo = await deps.aoVivo(nome, uf, cargoTse, consulta.nomeCivil, consulta.municipio);
	return { tseResult: aoVivo, eleito };
}
