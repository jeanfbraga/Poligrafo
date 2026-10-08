/**
 * Contratos do ÓRGÃO ligado ao mandato (Fase 4, cobertura por alçada; nota 29).
 *
 * - Prefeito e vereador → contratos da prefeitura (o vereador fiscaliza a prefeitura).
 * - Governador e deputado estadual/distrital → contratos do governo do estado.
 * - Cargos federais → nada (a União tem milhares de órgãos; fica para outra etapa).
 *
 * O órgão vem do SICONFI (CNPJ de cada ente) pelo código do IBGE da base de
 * eleitos — sem ambiguidade de nome — e, sem ele, pelo nome do município.
 * Os contratos vêm do PNCP (`cnpjOrgao`, conferido). Os 20 maiores viram nós
 * de contexto no dossiê; TODOS entram no motor de cruzamentos como
 * CONTRATADO_ENTE (doador ou fornecedor da campanha contratado pelo órgão).
 */
import { type DespesaNormalizada, nosDeContratosDoEnte } from "@/services/core/despesa-normalizada";
import { buscarContratosDoOrgao, type ContratoOrgao } from "@/services/integrations/pncp/contratos-orgao";
import {
	buscarEnteEstadual,
	buscarEntePorIbge,
	buscarEnteSiconfi,
	type EnteSiconfi,
} from "@/services/integrations/siconfi/client";

export interface AlvoEnte {
	esfera: string;
	uf: string;
	/** Código IBGE do município (da base tse_eleitos). */
	codIbge?: string | null;
	/** Nome ou slug do município (reserva quando não há código IBGE). */
	municipio?: string | null;
}

export interface DepsContratosEnte {
	porIbge: (cod: string) => Promise<EnteSiconfi | null>;
	porNome: (uf: string, municipio: string) => Promise<EnteSiconfi | null>;
	estadual: (uf: string) => Promise<EnteSiconfi | null>;
	contratos: (cnpj: string) => Promise<ContratoOrgao[]>;
}

const DEPS_PADRAO: DepsContratosEnte = {
	porIbge: (cod) => buscarEntePorIbge(cod),
	porNome: (uf, municipio) => buscarEnteSiconfi(uf, municipio),
	estadual: (uf) => buscarEnteEstadual(uf),
	contratos: (cnpj) => buscarContratosDoOrgao(cnpj),
};

/** Quantos contratos viram nó no dossiê (os demais só entram nos cruzamentos). */
export const NOS_NO_DOSSIE = 20;

export async function localizarEnte(alvo: AlvoEnte, deps: DepsContratosEnte = DEPS_PADRAO): Promise<EnteSiconfi | null> {
	if (alvo.esfera === "ESTADUAL") return deps.estadual(alvo.uf);
	if (alvo.esfera !== "MUNICIPAL") return null;
	if (alvo.codIbge) return deps.porIbge(alvo.codIbge);
	return alvo.municipio ? deps.porNome(alvo.uf, alvo.municipio.replace(/-/g, " ")) : null;
}

export function contratoParaDespesa(c: ContratoOrgao, ente: EnteSiconfi): DespesaNormalizada {
	return {
		cnpjCpfFornecedor: c.niFornecedor,
		nomeFornecedor: c.nomeFornecedor || "FORNECEDOR NÃO IDENTIFICADO",
		tipoDespesa: c.objeto.slice(0, 200) || "CONTRATO",
		valorDocumento: c.valorGlobal,
		dataDocumento: c.dataAssinatura,
		urlDocumento: c.url,
		fonte: `PNCP — ${ente.ente}`,
		natureza: "ENTE",
		emendaParlamentar: c.emendaParlamentar,
	};
}

type Emissor = (tipo: string, payload: any) => void;

/** "R$ 325.000" com espaço normal (o formato de moeda do Intl usa espaço não separável). */
function brl(v: number): string {
	return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

function rotulo(ente: EnteSiconfi): string {
	return ente.esfera === "M" ? `Prefeitura de ${ente.ente}` : `Governo de ${ente.ente}`;
}

export type ColetaEnte =
	| { situacao: "NAO_SE_APLICA" }
	| { situacao: "SEM_ENTE" }
	| { situacao: "FALHA"; erro: unknown }
	| { situacao: "OK"; ente: EnteSiconfi; despesas: DespesaNormalizada[] };

/**
 * Só a busca (sem emitir nada): o pipe começa isto logo depois da identidade,
 * em paralelo com o resto (o PNCP leva ~20 s por página), e emite no fim.
 * Nunca rejeita.
 */
export async function coletarContratosDoEnte(alvo: AlvoEnte, deps: DepsContratosEnte = DEPS_PADRAO): Promise<ColetaEnte> {
	if (alvo.esfera !== "MUNICIPAL" && alvo.esfera !== "ESTADUAL") return { situacao: "NAO_SE_APLICA" };
	try {
		const ente = await localizarEnte(alvo, deps);
		if (!ente?.cnpj) return { situacao: "SEM_ENTE" };
		const despesas = (await deps.contratos(ente.cnpj)).map((c) => contratoParaDespesa(c, ente));
		return { situacao: "OK", ente, despesas };
	} catch (erro) {
		return { situacao: "FALHA", erro };
	}
}

/** Registra no log, emite os maiores como nós de contexto e devolve todos para o motor de cruzamentos. */
export function emitirColetaDoEnte(coleta: ColetaEnte, pessoaId: string, sendEvent: Emissor): DespesaNormalizada[] {
	if (coleta.situacao === "NAO_SE_APLICA") return [];
	if (coleta.situacao === "FALHA") {
		console.warn("[PNCP] Falha nos contratos do órgão:", coleta.erro);
		return [];
	}
	if (coleta.situacao === "SEM_ENTE") {
		sendEvent("STATUS", { msg: "[PNCP] Órgão do mandato não localizado no SICONFI; contratos do órgão não consultados." });
		return [];
	}
	const { ente, despesas } = coleta;
	if (despesas.length === 0) {
		sendEvent("STATUS", { msg: `[PNCP] ${rotulo(ente)} sem contratos publicados no PNCP nos últimos 12 meses (o órgão pode publicar em portal próprio).` });
		return [];
	}
	const total = despesas.reduce((s, d) => s + d.valorDocumento, 0);
	sendEvent("STATUS", {
		msg: `[PNCP] ${despesas.length} contrato(s) de ${rotulo(ente)} nos últimos 12 meses (${brl(total)}). Os ${Math.min(NOS_NO_DOSSIE, despesas.length)} maiores aparecem no dossiê; todos entram nos cruzamentos.`,
	});
	for (const no of nosDeContratosDoEnte(despesas, pessoaId, NOS_NO_DOSSIE, "contrato-pncp")) sendEvent("NODE_NOVO", no);
	return despesas;
}

/** Busca e emite de uma vez (usado nos testes e onde não há o que paralelizar). */
export async function emitirContratosDoEnte(
	alvo: AlvoEnte,
	pessoaId: string,
	sendEvent: Emissor,
	deps: DepsContratosEnte = DEPS_PADRAO,
): Promise<DespesaNormalizada[]> {
	return emitirColetaDoEnte(await coletarContratosDoEnte(alvo, deps), pessoaId, sendEvent);
}
