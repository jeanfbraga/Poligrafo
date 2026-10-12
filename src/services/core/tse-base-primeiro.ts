/**
 * Identificação eleitoral do alvo pelas nossas bases (eleitos + patrimônio). O DivulgaCand
 * do TSE ao vivo recusa servidores de nuvem (Vercel em iad1 e gru1) e saiu em 12/10/2026:
 * sem o eleito na base, o alvo segue sem dados do TSE (não há consulta que responda).
 *
 * Senador: a base acha o eleito só pelo nome de urna (o Senado não publica CPF), e eleito
 * achado por nome não tem o CPF adotado. O nome civil oficial do Senado igual ao do eleito
 * confirma a pessoa.
 */
import type { TseCandidateResult } from "@/app/api/investigar/tse";
import { nomeCivilDoSenador } from "@/services/integrations/senado/nome-civil";
import { buscarEleitoDoAlvo, confirmarPeloNomeCivil, type AlvoEleito, type EleitoDoAlvo } from "@/services/integrations/tse/eleitos";
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
	nomeCivilSenador: (id: unknown) => Promise<string | null>;
}

const PADRAO: DependenciasTse = {
	buscarEleito: buscarEleitoDoAlvo,
	daBase: tseDaBase,
	nomeCivilSenador: (id) => nomeCivilDoSenador(id),
};

const ORIGEM_BASE = "Base do TSE no Polígrafo (eleitos e bens declarados)";
const CARGO_SENADOR = "5";

function detalheDaBase(r: TseCandidateResult): string {
	const anos = (r.historicoPatrimonio ?? []).map((h) => h.ano).join(" e ");
	return anos ? `Eleito e patrimônio declarado (${anos})` : "Eleito confirmado (sem declaração de bens na base)";
}

async function eleitoDoAlvo(consulta: ConsultaTseDoAlvo, deps: DependenciasTse): Promise<EleitoDoAlvo | null> {
	const eleito = await deps.buscarEleito(consulta.alvo).catch(() => null);
	if (!eleito?.porNome || consulta.alvo.cargoTse !== CARGO_SENADOR) return eleito;
	const civil = await deps.nomeCivilSenador(consulta.alvo.id).catch(() => null);
	return confirmarPeloNomeCivil(eleito, civil, "nome civil confirmado pelo Senado Federal");
}

export async function dadosTseDoAlvo(
	consulta: ConsultaTseDoAlvo,
	sendEvent: Emissor,
	deps: DependenciasTse = PADRAO,
): Promise<{ tseResult: TseCandidateResult | null; eleito: EleitoDoAlvo | null }> {
	const eleito = await eleitoDoAlvo(consulta, deps);
	const daBase = await deps.daBase(eleito).catch(() => null);
	if (daBase) {
		sendEvent("STATUS", { msg: "[TSE] Dados eleitorais e patrimônio lidos da nossa base (arquivos oficiais do TSE)." });
		emitirEtapa(sendEvent, { fonte: "tse", estado: "concluida", origem: ORIGEM_BASE, detalhe: detalheDaBase(daBase) });
		return { tseResult: daBase, eleito };
	}
	emitirEtapa(sendEvent, { fonte: "tse", estado: "vazia", origem: ORIGEM_BASE, detalhe: "Sem eleito correspondente na base do TSE" });
	return { tseResult: null, eleito };
}
