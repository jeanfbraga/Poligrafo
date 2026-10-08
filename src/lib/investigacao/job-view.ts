/* ==========================================================================
   Visão do job — modelo pronto para a UI (painel, faixa, chip, banner).
   ========================================================================== */
import type { Alvo } from "./alvo";
import { contarDossie } from "./dossie-state";
import {
	calcularProgresso,
	type EtapaStatus,
	FONTES,
	formatarRelogio,
	notaDaFonte,
	type ProblemaDeFonte,
	problemasDeConexao,
	resumirEtapas,
	statusDaFonte,
	TEXTO_ETAPA,
} from "./etapas";
import { mesmoAlvo, type StoreState } from "./store";

export type EstadoJob = "idle" | "running" | "partial" | "done" | "error";

export interface EtapaView {
	id: string;
	nome: string;
	/** Descrição fixa da fonte ("contratos e licitações"). */
	detalhe: string;
	status: EtapaStatus;
	texto: string;
	/** O que aconteceu agora, em linguagem simples ("61 contratos…", "PNCP: demorou demais…"). */
	nota: string | null;
}

export interface JobView {
	estado: EstadoJob;
	pct: number;
	relogio: string;
	concluidas: number;
	total: number;
	aplicaveis: number;
	nos: number;
	criticos: number;
	atencao: number;
	/** Última mensagem do servidor (ou vazio). */
	log: string;
	erro: string;
	etapas: EtapaView[];
	/** Fontes em que algum site não respondeu (quadro "Algumas fontes não responderam"). */
	problemas: ProblemaDeFonte[];
	/** Há outra investigação (de outro alvo) em andamento. */
	outraEmAndamento: boolean;
	temNos: boolean;
}

function estadoDo(state: StoreState, alvo: Alvo | null | undefined): EstadoJob {
	if (alvo && !mesmoAlvo(state.alvo, alvo)) return "idle";
	return state.alvo ? state.dossie.status : "idle";
}

function etapasView(state: StoreState, ativo: boolean, rodando: boolean): EtapaView[] {
	return FONTES.map((f) => {
		const status: EtapaStatus = ativo ? statusDaFonte(state.dossie.etapas, f.id, rodando) : "wait";
		const nota = ativo ? notaDaFonte(state.dossie.etapas, f.id, status) : null;
		return { id: f.id, nome: f.nome, detalhe: f.detalhe, status, texto: TEXTO_ETAPA[status], nota };
	});
}

/** "[PNCP] Governo (DF): 61 contrato(s)…" → "PNCP · Governo (DF): 61 contrato(s)…" (sem etiqueta técnica). */
export function textoDoLog(msg: string): string {
	return String(msg ?? "").replace(/^\[([^\]]+)\]:?\s*/, "$1 · ");
}

function viewIdle(state: StoreState, esperavaAlvo: boolean): JobView {
	return {
		estado: "idle",
		pct: 0,
		relogio: formatarRelogio(0),
		concluidas: 0,
		total: FONTES.length,
		aplicaveis: FONTES.length,
		nos: 0,
		criticos: 0,
		atencao: 0,
		log: "",
		erro: "",
		etapas: etapasView(state, false, false),
		problemas: [],
		outraEmAndamento: esperavaAlvo && state.dossie.status === "running" && state.alvo !== null,
		temNos: false,
	};
}

function viewAtivo(state: StoreState, estado: EstadoJob, segundos: number): JobView {
	const d = state.dossie;
	const rodando = estado === "running";
	const resumo = resumirEtapas(d.etapas, rodando);
	const cont = contarDossie(d);
	return {
		estado,
		pct: calcularProgresso(d.etapas, rodando),
		relogio: formatarRelogio(segundos),
		concluidas: resumo.concluidas,
		total: resumo.total,
		aplicaveis: resumo.aplicaveis,
		nos: cont.nos,
		criticos: cont.criticos,
		atencao: cont.atencao,
		log: textoDoLog(d.log[d.log.length - 1] ?? ""),
		erro: d.erro,
		etapas: etapasView(state, true, rodando),
		problemas: problemasDeConexao(d.etapas, rodando),
		outraEmAndamento: false,
		temNos: d.nodes.length > 0,
	};
}

/**
 * Constrói a visão do job. Com `alvo`, só reflete o store se for o MESMO alvo
 * (o Perfil de Fulano não mostra a investigação de Beltrano).
 */
export function jobView(state: StoreState, alvo?: Alvo | null, segundos = 0): JobView {
	const estado = estadoDo(state, alvo);
	return estado === "idle" ? viewIdle(state, Boolean(alvo)) : viewAtivo(state, estado, segundos);
}

/* -------------------------------------------------------------------------- */
/* Ação principal do Perfil (botão do topo)                                    */
/* -------------------------------------------------------------------------- */

export type TipoAcaoJob = "iniciar" | "rolar" | "abrir";

export interface AcaoJob {
	tipo: TipoAcaoJob;
	rotulo: string;
	dica: string;
	/** 0–100 quando há progresso a mostrar; `null` caso contrário. */
	progresso: number | null;
}

const ACOES_POR_ESTADO: Record<EstadoJob, (v: JobView) => AcaoJob> = {
	idle: () => ({ tipo: "iniciar", rotulo: "Investigar parlamentar", dica: `Cruza ${FONTES.length} fontes oficiais e IA · leva alguns minutos, em segundo plano`, progresso: null }),
	running: (v) => ({ tipo: "abrir", rotulo: `Acompanhar ao vivo · ${v.pct}%`, dica: `${v.relogio} · ${v.concluidas}/${v.aplicaveis} fontes`, progresso: v.pct }),
	partial: (v) => ({ tipo: "rolar", rotulo: "Investigação interrompida", dica: "Ver opções para recomeçar", progresso: v.pct }),
	error: () => ({ tipo: "rolar", rotulo: "Investigação falhou", dica: "Ver detalhes e tentar de novo", progresso: null }),
	done: (v) => ({ tipo: "abrir", rotulo: "Abrir dossiê", dica: `${v.nos} nós · ◆ ${v.criticos} · ▲ ${v.atencao}`, progresso: 100 }),
};

/** O que o botão principal do Perfil faz e diz em cada estado da investigação. */
export function acaoDoJob(v: JobView): AcaoJob {
	return ACOES_POR_ESTADO[v.estado](v);
}
