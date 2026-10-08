/* ==========================================================================
   Store da investigação — reducer puro sobre o DossieState.
   O Provider (components/investigacao) guarda este estado acima das rotas,
   por isso a investigação continua em segundo plano ao navegar.
   ========================================================================== */
import type { EdgeChange, NodeChange } from "@xyflow/react";
import type { Alvo } from "./alvo";
import {
	adicionarContratosPncp,
	alternarEmendas,
	aplicarEventos,
	aplicarMudancasEdges,
	aplicarMudancasNodes,
	aplicarNoDaBuscaReversa,
	aplicarNoDoPivoCnpj,
	descartarAviso,
	DOSSIE_VAZIO,
	type DossieNode,
	type DossieState,
	evidenciaParaCanvas,
	falhar,
	fimDoStream,
	interromper,
	marcarNoBuscando,
	substituirPosicoes,
	PESSOA_PLACEHOLDER_ID,
} from "./dossie-state";
import type { SseEvent } from "./sse";

export interface StoreState {
	alvo: Alvo | null;
	dossie: DossieState;
	/** epoch ms do início da investigação principal. */
	inicio: number | null;
	/** epoch ms do fim (done/partial/error). */
	fim: number | null;
	/** Um drill-down (CNPJ/sócio/contratos) está em andamento. */
	pivotando: boolean;
	/** Contadores da busca reversa em andamento (para o toast final). */
	reversa: { total: number; novas: number };
}

export const STORE_INICIAL: StoreState = {
	alvo: null,
	dossie: DOSSIE_VAZIO,
	inicio: null,
	fim: null,
	pivotando: false,
	reversa: { total: 0, novas: 0 },
};

export type Acao =
	| { t: "START"; alvo: Alvo; dossie: DossieState; agora: number }
	| { t: "EVENTOS"; eventos: SseEvent[] }
	| { t: "FIM"; agora: number }
	| { t: "INTERROMPER"; agora: number }
	| { t: "FALHA"; msg: string; agora: number }
	| { t: "NODES"; changes: NodeChange[] }
	| { t: "EDGES"; changes: EdgeChange[] }
	| { t: "SET_NODES"; nodes: DossieNode[] }
	| { t: "EMENDAS"; hubId: string }
	| { t: "BUSCANDO"; id: string; ligado: boolean; msg?: string }
	| { t: "EVIDENCIA"; id: string; posicao?: { x: number; y: number } }
	| { t: "AVISO_FECHAR"; fonte: string }
	| { t: "LIMPAR_CANDIDATOS" }
	| { t: "LIMPAR_ERRO" }
	| { t: "RESET" }
	| { t: "RESTAURAR"; alvo: Alvo; dossie: DossieState; inicio: number | null; fim: number | null }
	| { t: "PIVO_CNPJ"; node: DossieNode }
	| { t: "PIVO_SOCIO"; node: DossieNode }
	| { t: "PIVO_CONTRATOS"; origemId: string; contratos: Array<Record<string, any>>; analise?: Record<string, any> }
	| { t: "PIVOTANDO"; ligado: boolean };

type Manipuladores = { [K in Acao["t"]]: (s: StoreState, a: Extract<Acao, { t: K }>) => StoreState };

const comDossie = (s: StoreState, dossie: DossieState): StoreState => ({ ...s, dossie });

const H: Manipuladores = {
	START: (s, a) => ({
		...s,
		alvo: a.alvo,
		dossie: a.dossie,
		inicio: a.agora,
		fim: null,
		pivotando: false,
		reversa: { total: 0, novas: 0 },
	}),
	EVENTOS: (s, a) => comDossie(s, aplicarEventos(s.dossie, a.eventos)),
	FIM: (s, a) => ({ ...comDossie(s, fimDoStream(s.dossie)), fim: s.fim ?? a.agora }),
	INTERROMPER: (s, a) => ({ ...comDossie(s, interromper(s.dossie)), fim: a.agora }),
	FALHA: (s, a) => ({ ...comDossie(s, falhar(s.dossie, a.msg)), fim: a.agora }),
	NODES: (s, a) => comDossie(s, aplicarMudancasNodes(s.dossie, a.changes)),
	EDGES: (s, a) => comDossie(s, aplicarMudancasEdges(s.dossie, a.changes)),
	SET_NODES: (s, a) => comDossie(s, substituirPosicoes(s.dossie, a.nodes)),
	EMENDAS: (s, a) => comDossie(s, alternarEmendas(s.dossie, a.hubId)),
	BUSCANDO: (s, a) => comDossie(s, marcarNoBuscando(s.dossie, a.id, a.ligado, a.msg)),
	EVIDENCIA: (s, a) => comDossie(s, evidenciaParaCanvas(s.dossie, a.id, a.posicao)),
	AVISO_FECHAR: (s, a) => comDossie(s, descartarAviso(s.dossie, a.fonte)),
	LIMPAR_CANDIDATOS: (s) => comDossie(s, { ...s.dossie, candidatos: null }),
	LIMPAR_ERRO: (s) => comDossie(s, { ...s.dossie, erro: "" }),
	RESET: () => STORE_INICIAL,
	RESTAURAR: (s, a) => ({ ...s, alvo: a.alvo, dossie: a.dossie, inicio: a.inicio, fim: a.fim, pivotando: false }),
	PIVO_CNPJ: (s, a) => comDossie(s, aplicarNoDoPivoCnpj(s.dossie, a.node)),
	PIVO_SOCIO: (s, a) => {
		const r = aplicarNoDaBuscaReversa(s.dossie, a.node);
		const total = s.reversa.total + (r.ehEmpresa ? 1 : 0);
		const novas = s.reversa.novas + (r.ehEmpresa && !r.duplicada ? 1 : 0);
		return { ...comDossie(s, r.estado), reversa: { total, novas } };
	},
	PIVO_CONTRATOS: (s, a) => comDossie(s, adicionarContratosPncp(s.dossie, a.origemId, a.contratos, a.analise)),
	PIVOTANDO: (s, a) => ({ ...s, pivotando: a.ligado, reversa: a.ligado ? { total: 0, novas: 0 } : s.reversa }),
};

export function reduzirStore(s: StoreState, a: Acao): StoreState {
	return (H[a.t] as (s: StoreState, a: Acao) => StoreState)(s, a);
}

/* -------------------------------------------------------------------------- */
/* Store externo (compatível com useSyncExternalStore)                        */
/* -------------------------------------------------------------------------- */

export interface Store {
	getState: () => StoreState;
	dispatch: (a: Acao) => void;
	subscribe: (fn: () => void) => () => void;
}

/** Store síncrono: o controlador lê o estado logo após cada dispatch. */
export function criarStore(inicial: StoreState = STORE_INICIAL): Store {
	let state = inicial;
	const assinantes = new Set<() => void>();
	return {
		getState: () => state,
		dispatch: (a) => {
			state = reduzirStore(state, a);
			assinantes.forEach((fn) => fn());
		},
		subscribe: (fn) => {
			assinantes.add(fn);
			return () => assinantes.delete(fn);
		},
	};
}

/* -------------------------------------------------------------------------- */
/* Persistência (sessionStorage)                                              */
/* -------------------------------------------------------------------------- */

export const CHAVE_SESSAO = "pg:dossie:v3";

export interface Persistido {
	alvo: Alvo;
	dossie: DossieState;
	inicio: number | null;
	fim: number | null;
}

/** Verifica se o dossiê tem conteúdo real além do placeholder inicial de carregamento. */
export function temConteudoDossie(dossie: DossieState): boolean {
	const nosReais = (dossie.nodes ?? []).filter((n) => n.id !== PESSOA_PLACEHOLDER_ID);
	return nosReais.length > 0 || (dossie.evidencias ?? []).length > 0;
}

/** O que vale guardar: dossiês concluídos ou parciais com algo para mostrar além do placeholder. */
export function devePersistir(s: StoreState): boolean {
	if (!s.alvo) return false;
	const { status } = s.dossie;
	return (status === "done" || status === "partial") && temConteudoDossie(s.dossie);
}

export function serializar(s: StoreState): string | null {
	if (!devePersistir(s) || !s.alvo) return null;
	const p: Persistido = { alvo: s.alvo, dossie: s.dossie, inicio: s.inicio, fim: s.fim };
	return JSON.stringify(p);
}

/** Sessões salvas antes de o resumo da cota deixar de ser nó ainda o carregam: descarta. */
function semResumoLegado(p: Persistido): Persistido {
	// RESUMO_GASTOS não sai: é o Raio-X de Gastos dos vereadores da CMRJ.
	const fora = (n: { type?: string }) => n.type !== "CEAP_RESUMO";
	const d = p.dossie;
	return { ...p, dossie: { ...d, nodes: d.nodes.filter(fora), evidencias: (d.evidencias ?? []).filter(fora) } };
}

export function desserializar(raw: string | null): Persistido | null {
	if (!raw) return null;
	try {
		const p = JSON.parse(raw) as Persistido;
		if (!p?.alvo || !p?.dossie?.nodes) return null;
		const limpo = semResumoLegado(p);
		return temConteudoDossie(limpo.dossie) ? limpo : null;
	} catch {
		return null;
	}
}

/** Compara dois alvos: mesma ref, ou mesmo nome (sem acento/caixa) quando não há ref. */
export function mesmoAlvo(a: Alvo | null, b: Alvo | null): boolean {
	if (!a || !b) return false;
	if (a.ref && b.ref) return a.ref === b.ref;
	return a.nome.trim().toLowerCase() === b.nome.trim().toLowerCase();
}
