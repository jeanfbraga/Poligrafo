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
import { emitirEtapa } from "@/services/core/etapas-ao-vivo";
import { type AlvoCasa, buscarCasaLegislativa, type CasaLegislativa } from "@/services/integrations/pncp/casa-legislativa";
import { contratosComCopia, type ResultadoContratos } from "@/services/integrations/pncp/contratos-guardados";
import type { ContratoOrgao } from "@/services/integrations/pncp/contratos-orgao";
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

/** Lista de contratos ou o resultado com a origem (ao vivo ou cópia guardada no banco). */
type FonteDeContratos = (cnpj: string) => Promise<ContratoOrgao[] | ResultadoContratos>;

export interface DepsContratosEnte {
	porIbge: (cod: string) => Promise<EnteSiconfi | null>;
	porNome: (uf: string, municipio: string) => Promise<EnteSiconfi | null>;
	estadual: (uf: string) => Promise<EnteSiconfi | null>;
	contratos: FonteDeContratos;
	/** CNPJ da casa legislativa (busca do PNCP). */
	casa?: (alvo: AlvoCasa) => Promise<CasaLegislativa | null>;
	/** Contratos da casa (sem isto, usa `contratos`). */
	contratosDaCasa?: FonteDeContratos;
}

const DEPS_PADRAO: Required<DepsContratosEnte> = {
	porIbge: (cod) => buscarEntePorIbge(cod),
	porNome: (uf, municipio) => buscarEnteSiconfi(uf, municipio),
	estadual: (uf) => buscarEnteEstadual(uf),
	// Cópia guardada no Banco de Perfil (24 h; até 30 dias se o PNCP cair): pncp/contratos-guardados.ts
	contratos: (cnpj) => contratosComCopia(cnpj),
	casa: (alvo) => buscarCasaLegislativa(alvo),
	// A casa contrata pouco (ALESP: 287 em 12 meses): uma página de 500 basta e alivia o PNCP.
	contratosDaCasa: (cnpj) => contratosComCopia(cnpj, { paginas: 1 }),
};

/** De onde vieram os contratos quando não foi ao vivo. */
export interface CopiaGuardada {
	/** ISO da consulta guardada. */
	em: string;
	/** true = mais de 24 h, usada porque o PNCP não respondeu agora. */
	antiga: boolean;
}

function comoResultado(r: ContratoOrgao[] | ResultadoContratos): ResultadoContratos {
	return Array.isArray(r) ? { contratos: r, origem: "ao_vivo", guardadoEm: null } : r;
}

function copiaDe(r: ResultadoContratos): CopiaGuardada | null {
	if (r.origem === "ao_vivo" || !r.guardadoEm) return null;
	return { em: r.guardadoEm, antiga: r.origem === "guardado_antigo" };
}

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

const FUSO = { timeZone: "America/Sao_Paulo" } as const;

function dataDe(iso: string): string {
	return new Date(iso).toLocaleDateString("pt-BR", FUSO);
}

function dataHora(iso: string): string {
	return `${dataDe(iso)} às ${new Date(iso).toLocaleTimeString("pt-BR", { ...FUSO, hour: "2-digit", minute: "2-digit" })}`;
}

/** Fim da linha do log quando os contratos vieram da cópia guardada. */
function notaDaCopia(copia: CopiaGuardada | null): string {
	if (!copia) return "";
	return copia.antiga ? ` O PNCP não respondeu agora: são os contratos guardados em ${dataHora(copia.em)}.` : ` Consulta guardada de ${dataHora(copia.em)}.`;
}

/** Mesma frase para o órgão fiscalizado e para a casa: "Órgão (lugar): N contrato(s)…". */
function linhaDosContratos(orgao: string, despesas: DespesaNormalizada[], copia: CopiaGuardada | null): string {
	const total = despesas.reduce((s, d) => s + d.valorDocumento, 0);
	const noDossie = despesas.length > NOS_NO_DOSSIE ? `Os ${NOS_NO_DOSSIE} maiores aparecem no dossiê; todos entram nos cruzamentos.` : "Todos aparecem no dossiê e entram nos cruzamentos.";
	return `[PNCP] ${orgao}: ${despesas.length} contrato(s) nos últimos 12 meses (${brl(total)}). ${noDossie}${notaDaCopia(copia)}`;
}

function linhaSemContratos(orgao: string, copia: CopiaGuardada | null): string {
	return `[PNCP] ${orgao}: nenhum contrato publicado no PNCP nos últimos 12 meses (o órgão pode publicar em portal próprio).${notaDaCopia(copia)}`;
}

function linhaFalha(orgao: string): string {
	return `[PNCP] ${orgao}: o PNCP não respondeu; contratos não consultados (não quer dizer que não existam).`;
}

const ORIGEM_PNCP = "PNCP (portal federal de contratos)";

/** "(cópia de 08/10/2026)" ou "(cópia de 01/10/2026; o PNCP não respondeu agora)". */
function sufixoDaCopia(copia: CopiaGuardada | null): string {
	if (!copia) return "";
	return copia.antiga ? ` (cópia de ${dataDe(copia.em)}; o PNCP não respondeu agora)` : ` (cópia de ${dataDe(copia.em)})`;
}

/** Resultado para a lista de fontes da tela (evento ETAPA): "61 contratos: Governo (Distrito Federal)". */
function etapaDosContratos(sendEvent: Emissor, orgao: string, despesas: DespesaNormalizada[], copia: CopiaGuardada | null): void {
	const sufixo = sufixoDaCopia(copia);
	emitirEtapa(sendEvent, despesas.length
		? { fonte: "pncp", estado: "concluida", origem: ORIGEM_PNCP, detalhe: `${despesas.length} ${despesas.length === 1 ? "contrato" : "contratos"}: ${orgao}${sufixo}` }
		: { fonte: "pncp", estado: "vazia", origem: ORIGEM_PNCP, detalhe: `${orgao}: nenhum contrato no PNCP em 12 meses${sufixo}` });
}

export type ColetaEnte =
	| { situacao: "NAO_SE_APLICA" }
	| { situacao: "SEM_ENTE" }
	| { situacao: "FALHA"; erro: unknown; orgao?: string }
	| { situacao: "OK"; ente: EnteSiconfi; despesas: DespesaNormalizada[]; copia?: CopiaGuardada | null };

/**
 * Só a busca (sem emitir nada): o pipe começa isto logo depois da identidade,
 * em paralelo com o resto (o PNCP leva ~20 s por página), e emite no fim.
 * Nunca rejeita.
 */
export async function coletarContratosDoEnte(alvo: AlvoEnte, deps: DepsContratosEnte = DEPS_PADRAO): Promise<ColetaEnte> {
	if (alvo.esfera !== "MUNICIPAL" && alvo.esfera !== "ESTADUAL") return { situacao: "NAO_SE_APLICA" };
	let orgao: string | undefined;
	try {
		const ente = await localizarEnte(alvo, deps);
		if (!ente?.cnpj) return { situacao: "SEM_ENTE" };
		orgao = rotulo(ente);
		const r = comoResultado(await deps.contratos(ente.cnpj));
		return { situacao: "OK", ente, despesas: r.contratos.map((c) => contratoParaDespesa(c, ente)), copia: copiaDe(r) };
	} catch (erro) {
		return { situacao: "FALHA", erro, orgao };
	}
}

/** Registra no log, emite os maiores como nós de contexto e devolve todos para o motor de cruzamentos. */
export function emitirColetaDoEnte(coleta: ColetaEnte, pessoaId: string, sendEvent: Emissor): DespesaNormalizada[] {
	if (coleta.situacao === "NAO_SE_APLICA") return [];
	if (coleta.situacao === "FALHA") {
		console.warn("[PNCP] Falha nos contratos do órgão:", coleta.erro);
		sendEvent("STATUS", { msg: linhaFalha(coleta.orgao ?? "Órgão do mandato") });
		return [];
	}
	if (coleta.situacao === "SEM_ENTE") {
		sendEvent("STATUS", { msg: "[PNCP] Órgão do mandato não localizado no SICONFI; contratos do órgão não consultados." });
		return [];
	}
	const { ente, despesas } = coleta;
	const copia = coleta.copia ?? null;
	etapaDosContratos(sendEvent, rotulo(ente), despesas, copia);
	if (despesas.length === 0) {
		sendEvent("STATUS", { msg: linhaSemContratos(rotulo(ente), copia) });
		return [];
	}
	sendEvent("STATUS", { msg: linhaDosContratos(rotulo(ente), despesas, copia) });
	for (const no of nosDeContratosDoEnte(despesas, pessoaId, NOS_NO_DOSSIE, "contrato-pncp")) sendEvent("NODE_NOVO", no);
	return despesas;
}

const CARGOS_COM_CASA = new Set(["13", "7", "8"]);

export type ColetaCasa =
	| { situacao: "NAO_SE_APLICA" }
	| { situacao: "SEM_CASA"; tipo: string }
	| { situacao: "FALHA"; erro: unknown; orgao: string }
	| { situacao: "OK"; casa: CasaLegislativa; despesas: DespesaNormalizada[]; copia?: CopiaGuardada | null };

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
	let orgao = tipoDaCasa(alvo);
	try {
		const destino = await destinoDaCasa(alvo, deps);
		const casa = destino ? await (deps.casa ?? DEPS_PADRAO.casa)(destino) : null;
		if (!casa) return { situacao: "SEM_CASA", tipo: orgao };
		orgao = casa.rotulo;
		const r = comoResultado(await (deps.contratosDaCasa ?? deps.contratos)(casa.cnpj));
		return { situacao: "OK", casa, despesas: r.contratos.map((c) => despesaDoContrato(c, casa.rotulo)), copia: copiaDe(r) };
	} catch (erro) {
		return { situacao: "FALHA", erro, orgao };
	}
}

export function emitirColetaDaCasa(coleta: ColetaCasa, pessoaId: string, sendEvent: Emissor): DespesaNormalizada[] {
	if (coleta.situacao === "NAO_SE_APLICA") return [];
	if (coleta.situacao === "FALHA") {
		console.warn("[PNCP] Falha nos contratos da casa legislativa:", coleta.erro);
		sendEvent("STATUS", { msg: linhaFalha(coleta.orgao) });
		return [];
	}
	if (coleta.situacao === "SEM_CASA") {
		sendEvent("STATUS", { msg: `[PNCP] ${coleta.tipo} não encontrada na busca do PNCP; contratos da casa não consultados.` });
		return [];
	}
	const { casa, despesas } = coleta;
	const copia = coleta.copia ?? null;
	etapaDosContratos(sendEvent, casa.rotulo, despesas, copia);
	if (despesas.length === 0) {
		sendEvent("STATUS", { msg: linhaSemContratos(casa.rotulo, copia) });
		return [];
	}
	sendEvent("STATUS", { msg: linhaDosContratos(casa.rotulo, despesas, copia) });
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
