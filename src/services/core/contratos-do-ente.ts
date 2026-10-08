/**
 * Contratos do ÓRGÃO ligado ao mandato (Fase 4, cobertura por alçada; nota 29).
 *
 * - Prefeito e vereador → contratos da prefeitura (o vereador fiscaliza a prefeitura).
 * - Governador e deputado estadual/distrital → contratos do governo do estado.
 * - Cargos federais → nada (a União tem milhares de órgãos; fica para outra etapa).
 * - Vereador e deputado estadual/distrital → também a PRÓPRIA casa (câmara municipal,
 *   assembleia, Câmara Legislativa do DF), achada pela busca do PNCP (casa-legislativa.ts).
 *
 * O órgão vem do SICONFI (CNPJ de cada ente) pelo código do IBGE da base de
 * eleitos — sem ambiguidade de nome — e, sem ele, pelo nome do município.
 * Os contratos vêm do PNCP (`cnpjOrgao`, conferido). Os 20 maiores viram nós
 * de contexto no dossiê; TODOS entram no motor de cruzamentos como
 * CONTRATADO_ENTE (doador ou fornecedor da campanha contratado pelo órgão).
 */
import { type DespesaNormalizada, nosDeContratosDoEnte } from "@/services/core/despesa-normalizada";
import { type AlvoCasa, buscarCasaLegislativa, type CasaLegislativa } from "@/services/integrations/pncp/casa-legislativa";
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
	/** Cargo no TSE: vereador (13) e deputado estadual/distrital (7, 8) também têm a própria casa. */
	cargoTse?: string | null;
}

export interface DepsContratosEnte {
	porIbge: (cod: string) => Promise<EnteSiconfi | null>;
	porNome: (uf: string, municipio: string) => Promise<EnteSiconfi | null>;
	estadual: (uf: string) => Promise<EnteSiconfi | null>;
	contratos: (cnpj: string) => Promise<ContratoOrgao[]>;
	/** CNPJ da casa legislativa (busca do PNCP). */
	casa?: (alvo: AlvoCasa) => Promise<CasaLegislativa | null>;
}

const DEPS_PADRAO: Required<DepsContratosEnte> = {
	porIbge: (cod) => buscarEntePorIbge(cod),
	porNome: (uf, municipio) => buscarEnteSiconfi(uf, municipio),
	estadual: (uf) => buscarEnteEstadual(uf),
	contratos: (cnpj) => buscarContratosDoOrgao(cnpj),
	casa: (alvo) => buscarCasaLegislativa(alvo),
};

/** Quantos contratos viram nó no dossiê (os demais só entram nos cruzamentos). */
export const NOS_NO_DOSSIE = 20;

export async function localizarEnte(alvo: AlvoEnte, deps: DepsContratosEnte = DEPS_PADRAO): Promise<EnteSiconfi | null> {
	if (alvo.esfera === "ESTADUAL") return deps.estadual(alvo.uf);
	if (alvo.esfera !== "MUNICIPAL") return null;
	if (alvo.codIbge) return deps.porIbge(alvo.codIbge);
	return alvo.municipio ? deps.porNome(alvo.uf, alvo.municipio.replace(/-/g, " ")) : null;
}

function despesaDoContrato(c: ContratoOrgao, orgao: string): DespesaNormalizada {
	return {
		cnpjCpfFornecedor: c.niFornecedor,
		nomeFornecedor: c.nomeFornecedor || "FORNECEDOR NÃO IDENTIFICADO",
		tipoDespesa: c.objeto.slice(0, 200) || "CONTRATO",
		valorDocumento: c.valorGlobal,
		dataDocumento: c.dataAssinatura,
		urlDocumento: c.url,
		fonte: `PNCP — ${orgao}`,
		natureza: "ENTE",
		emendaParlamentar: c.emendaParlamentar,
	};
}

export function contratoParaDespesa(c: ContratoOrgao, ente: EnteSiconfi): DespesaNormalizada {
	return despesaDoContrato(c, ente.ente);
}

type Emissor = (tipo: string, payload: any) => void;

/** "R$ 325.000" com espaço normal (o formato de moeda do Intl usa espaço não separável). */
function brl(v: number): string {
	return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

/** "Prefeitura (Rio de Janeiro)": a preposição (de/do/da) depende do lugar, por isso os parênteses. */
function rotulo(ente: EnteSiconfi): string {
	return ente.esfera === "M" ? `Prefeitura (${ente.ente})` : `Governo (${ente.ente})`;
}

/** Mesma frase para o órgão fiscalizado e para a casa: "Órgão (lugar): N contrato(s)…". */
function linhaDosContratos(orgao: string, despesas: DespesaNormalizada[]): string {
	const total = despesas.reduce((s, d) => s + d.valorDocumento, 0);
	return `[PNCP] ${orgao}: ${despesas.length} contrato(s) nos últimos 12 meses (${brl(total)}). Os ${Math.min(NOS_NO_DOSSIE, despesas.length)} maiores aparecem no dossiê; todos entram nos cruzamentos.`;
}

function linhaSemContratos(orgao: string): string {
	return `[PNCP] ${orgao}: nenhum contrato publicado no PNCP nos últimos 12 meses (o órgão pode publicar em portal próprio).`;
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
		sendEvent("STATUS", { msg: linhaSemContratos(rotulo(ente)) });
		return [];
	}
	sendEvent("STATUS", { msg: linhaDosContratos(rotulo(ente), despesas) });
	for (const no of nosDeContratosDoEnte(despesas, pessoaId, NOS_NO_DOSSIE, "contrato-pncp")) sendEvent("NODE_NOVO", no);
	return despesas;
}

const CARGOS_COM_CASA = new Set(["13", "7", "8"]);

export type ColetaCasa =
	| { situacao: "NAO_SE_APLICA" }
	| { situacao: "SEM_CASA"; tipo: string }
	| { situacao: "FALHA"; erro: unknown }
	| { situacao: "OK"; casa: CasaLegislativa; despesas: DespesaNormalizada[] };

/** "Câmara Municipal", "Assembleia Legislativa" ou "Câmara Legislativa" (para o log). */
export function tipoDaCasa(alvo: AlvoEnte): string {
	if (alvo.esfera === "MUNICIPAL") return "Câmara Municipal";
	return alvo.uf.toUpperCase() === "DF" ? "Câmara Legislativa" : "Assembleia Legislativa";
}

/** Vereador sem código IBGE na base: o SICONFI (lista em cache) dá o código pelo nome do município. */
async function destinoDaCasa(alvo: AlvoEnte, deps: DepsContratosEnte): Promise<AlvoCasa | null> {
	if (alvo.esfera === "ESTADUAL") return { esfera: "ESTADUAL", uf: alvo.uf };
	if (alvo.codIbge) return { esfera: "MUNICIPAL", codIbge: String(alvo.codIbge) };
	const ente = alvo.municipio ? await deps.porNome(alvo.uf, alvo.municipio.replace(/-/g, " ")) : null;
	return ente?.cod_ibge ? { esfera: "MUNICIPAL", codIbge: String(ente.cod_ibge) } : null;
}

/** Contratos da própria casa legislativa (vereador, deputado estadual e distrital). Nunca rejeita. */
export async function coletarContratosDaCasa(alvo: AlvoEnte, deps: DepsContratosEnte = DEPS_PADRAO): Promise<ColetaCasa> {
	const temCasa = CARGOS_COM_CASA.has(String(alvo.cargoTse ?? "")) && (alvo.esfera === "MUNICIPAL" || alvo.esfera === "ESTADUAL");
	if (!temCasa) return { situacao: "NAO_SE_APLICA" };
	try {
		const destino = await destinoDaCasa(alvo, deps);
		const casa = destino ? await (deps.casa ?? DEPS_PADRAO.casa)(destino) : null;
		if (!casa) return { situacao: "SEM_CASA", tipo: tipoDaCasa(alvo) };
		const despesas = (await deps.contratos(casa.cnpj)).map((c) => despesaDoContrato(c, casa.rotulo));
		return { situacao: "OK", casa, despesas };
	} catch (erro) {
		return { situacao: "FALHA", erro };
	}
}

export function emitirColetaDaCasa(coleta: ColetaCasa, pessoaId: string, sendEvent: Emissor): DespesaNormalizada[] {
	if (coleta.situacao === "NAO_SE_APLICA") return [];
	if (coleta.situacao === "FALHA") {
		console.warn("[PNCP] Falha nos contratos da casa legislativa:", coleta.erro);
		return [];
	}
	if (coleta.situacao === "SEM_CASA") {
		sendEvent("STATUS", { msg: `[PNCP] ${coleta.tipo} não encontrada na busca do PNCP; contratos da casa não consultados.` });
		return [];
	}
	const { casa, despesas } = coleta;
	if (despesas.length === 0) {
		sendEvent("STATUS", { msg: linhaSemContratos(casa.rotulo) });
		return [];
	}
	sendEvent("STATUS", { msg: linhaDosContratos(casa.rotulo, despesas) });
	for (const no of nosDeContratosDoEnte(despesas, pessoaId, NOS_NO_DOSSIE, "contrato-casa")) sendEvent("NODE_NOVO", no);
	return despesas;
}

export interface ColetaMandato {
	ente: ColetaEnte;
	casa: ColetaCasa;
}

/** Órgão fiscalizado (prefeitura/governo) e a própria casa, em paralelo. Nunca rejeita. */
export async function coletarContratosDoMandato(alvo: AlvoEnte, deps: DepsContratosEnte = DEPS_PADRAO): Promise<ColetaMandato> {
	const [ente, casa] = await Promise.all([coletarContratosDoEnte(alvo, deps), coletarContratosDaCasa(alvo, deps)]);
	return { ente, casa };
}

/** Emite os dois e devolve TODOS os contratos para o motor de cruzamentos. */
export function emitirColetaDoMandato(coleta: ColetaMandato, pessoaId: string, sendEvent: Emissor): DespesaNormalizada[] {
	return [...emitirColetaDoEnte(coleta.ente, pessoaId, sendEvent), ...emitirColetaDaCasa(coleta.casa, pessoaId, sendEvent)];
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
