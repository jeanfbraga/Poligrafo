/* ==========================================================================
   Estado do Dossiê — reducer puro.
   Substitui a lógica de eventos que vivia dentro do handleSearch (page.tsx).
   Regras de negócio preservadas:
   - Nós estruturais sempre vão ao canvas; despesas só com score ≥ 60.
   - Despesas com score < 60 ficam em `evidencias` (rail "Despesas").
   - Nós legados de bens (cache antigo) são descartados.
   - Emendas individuais ficam ocultas até o hub (EMENDA_RESUMO) ser expandido.
   Funções pequenas por tipo de evento (complexidade ≤ 10).
   ========================================================================== */
import {
	applyEdgeChanges,
	applyNodeChanges,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
} from "@xyflow/react";
import {
	ETAPAS_INICIAIS,
	type EtapasState,
	marcarConcluida,
	registrarStatus,
} from "./etapas";
import { LIMITE_ATENCAO, LIMITE_CRITICO, riscoDoNo, scoreDoNo } from "./risco";
import type { SseEvent } from "./sse";

export type DossieNode = Node<Record<string, any>>;
export type DossieEdge = Edge;

export interface ApiWarning {
	fonte: string;
	mensagem: string;
}

export interface Candidato {
	nome: string;
	ref: string;
	cargo?: string;
	casa?: string;
	uf?: string;
	id?: string | number;
}

export type JobStatus = "idle" | "running" | "partial" | "done" | "error";

export interface DossieState {
	nodes: DossieNode[];
	edges: DossieEdge[];
	/** Despesas de baixo risco (score < 60): ficam no rail, arrastáveis ao canvas. */
	evidencias: DossieNode[];
	warnings: ApiWarning[];
	candidatos: Candidato[] | null;
	erro: string;
	status: JobStatus;
	mensagem: string;
	log: string[];
	etapas: EtapasState;
	pessoaId: string | null;
	emendaHubId: string | null;
	/** Nº de nós suspeitos apontados pela análise de grafo (null = ainda não rodou). */
	suspeitosGrafo: number | null;
}

export const PESSOA_PLACEHOLDER_ID = "loading-pessoa";
const LOG_MAX = 40;
const SCORE_ATENCAO = LIMITE_ATENCAO;
const SCORE_CRITICO = LIMITE_CRITICO;

export const DOSSIE_VAZIO: DossieState = {
	nodes: [],
	edges: [],
	evidencias: [],
	warnings: [],
	candidatos: null,
	erro: "",
	status: "idle",
	mensagem: "",
	log: [],
	etapas: ETAPAS_INICIAIS,
	pessoaId: null,
	emendaHubId: null,
	suspeitosGrafo: null,
};

const ESTRUTURAIS = new Set([
	"PESSOA",
	"EMPRESA",
	"ORGAO",
	"EMENDA_RESUMO",
	"EMENDA",
	"PROCESSO_JUDICIAL",
	"CONTRATO",
	"RESUMO_GASTOS",
	"DIARIO_OFICIAL_NODE",
]);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function scoreDe(n: { data?: Record<string, unknown> }): number {
	return scoreDoNo(n.data);
}

const PREFIXOS_ID_BENS = ["bens-", "bem-"];
const PREFIXOS_LABEL_BENS = ["BEM DECLARADO:"];

function textoDe(v: unknown): string {
	return String(v ?? "");
}

function ehBemLegado(node: DossieNode): boolean {
	const d = node.data ?? {};
	const label = textoDe(d.label);
	const id = textoDe(node.id);
	if (PREFIXOS_ID_BENS.some((p) => id.startsWith(p))) return true;
	if (PREFIXOS_LABEL_BENS.some((p) => label.startsWith(p))) return true;
	if (label === "Patrimônio Declarado (TSE)") return true;
	return textoDe(d.codigo) === "TSE-BENS" || textoDe(d.objeto).startsWith("Total de Bens");
}

function upsertNode(nodes: DossieNode[], novo: DossieNode): DossieNode[] {
	const i = nodes.findIndex((n) => n.id === novo.id);
	if (i < 0) return [...nodes, novo];
	const cp = [...nodes];
	cp[i] = { ...cp[i], data: { ...cp[i].data, ...novo.data } };
	return cp;
}

function upsertEdge(edges: DossieEdge[], novo: DossieEdge): DossieEdge[] {
	const i = edges.findIndex((e) => e.id === novo.id);
	if (i < 0) return [...edges, novo];
	const cp = [...edges];
	cp[i] = novo;
	return cp;
}

function mapNodes(
	nodes: DossieNode[],
	quando: (n: DossieNode) => boolean,
	patch: (n: DossieNode) => DossieNode,
): DossieNode[] {
	return nodes.map((n) => (quando(n) ? patch(n) : n));
}

function comDados(n: DossieNode, dados: Record<string, unknown>): DossieNode {
	return { ...n, data: { ...n.data, ...dados } };
}

function novaAresta(source: string, target: string, rel: string, label?: string, extra?: Partial<DossieEdge>): DossieEdge {
	return {
		id: `edge-${rel}-${source}-${target}`,
		source,
		target,
		type: "pg",
		label,
		data: { rel },
		...extra,
	};
}

/* -------------------------------------------------------------------------- */
/* Nós                                                                        */
/* -------------------------------------------------------------------------- */

function adicionarPessoa(s: DossieState, node: DossieNode): DossieState {
	const ja = s.nodes.some((n) => n.id === PESSOA_PLACEHOLDER_ID || n.id === node.id || n.type === "PESSOA");
	const dados = { ...node.data, isSearching: s.status === "running" };
	const nodes = ja
		? mapNodes(
				s.nodes,
				(n) => n.id === PESSOA_PLACEHOLDER_ID || n.id === node.id || n.type === "PESSOA",
				(n) => ({ ...n, id: node.id, data: { ...n.data, ...dados } }),
			)
		: [...s.nodes, { ...node, data: dados, position: node.position ?? { x: 0, y: 0 } }];
	const edges = s.edges.map((e) => (e.source === PESSOA_PLACEHOLDER_ID ? { ...e, source: node.id } : e));
	return { ...s, nodes, edges, pessoaId: node.id };
}

function adicionarEmendaIndividual(s: DossieState, node: DossieNode, hubId: string): DossieState {
	const n = { ...node, hidden: true, position: node.position ?? { x: 0, y: 0 } };
	return {
		...s,
		nodes: upsertNode(s.nodes, n),
		edges: upsertEdge(s.edges, novaAresta(hubId, node.id, "emenda-hub", undefined, { hidden: true })),
	};
}

/**
 * Hub das emendas individuais: o resumo de emendas parlamentares (CGU).
 * O resumo do Transferegov (Pix) e o aviso de "offline" também são EMENDA_RESUMO,
 * mas não têm emendas filhas — não podem virar o hub.
 */
export function ehHubDeEmendas(node: DossieNode): boolean {
	if (node.type !== "EMENDA_RESUMO") return false;
	return !/transferegov/i.test(`${node.id} ${String(node.data?.label ?? "")}`);
}

function adicionarEstrutural(s: DossieState, node: DossieNode): DossieState {
	const hubId = ehHubDeEmendas(node) ? node.id : s.emendaHubId;
	if (node.type === "EMENDA" && hubId) return adicionarEmendaIndividual(s, node, hubId);

	const n = { ...node, position: node.position ?? { x: 0, y: 0 } };
	const edges = s.pessoaId
		? upsertEdge(s.edges, novaAresta(s.pessoaId, node.id, node.type ?? "no"))
		: s.edges;
	return { ...s, nodes: upsertNode(s.nodes, n), edges, emendaHubId: hubId };
}

function adicionarSuspeito(s: DossieState, node: DossieNode): DossieState {
	const critico = scoreDe(node) >= SCORE_CRITICO;
	const n = { ...node, position: node.position ?? { x: 0, y: 0 } };
	const edges = s.pessoaId
		? upsertEdge(
				s.edges,
				novaAresta(s.pessoaId, node.id, "ia", critico ? "ALERTA IA CRÍTICO" : "IA SUSPEITO"),
			)
		: s.edges;
	return { ...s, nodes: upsertNode(s.nodes, n), edges };
}

function adicionarEvidencia(s: DossieState, node: DossieNode): DossieState {
	return { ...s, evidencias: upsertNode(s.evidencias, node) };
}

function aoAdicionarNode(s: DossieState, node: DossieNode): DossieState {
	if (ehBemLegado(node)) return s;
	// O resumo da cota não é nó: o total/recorte é calculado de `lib/investigacao/cota` (também p/ caches antigos).
	if (node.type === "CEAP_RESUMO") return s;
	if (node.type === "PESSOA") return adicionarPessoa(s, node);
	if (ESTRUTURAIS.has(node.type ?? "")) return adicionarEstrutural(s, node);
	if (scoreDe(node) >= SCORE_ATENCAO) return adicionarSuspeito(s, node);
	return adicionarEvidencia(s, node);
}

/* -------------------------------------------------------------------------- */
/* Eventos SSE                                                                */
/* -------------------------------------------------------------------------- */

type Manipulador = (s: DossieState, payload: Record<string, any>) => DossieState;

const SEM_DESPESAS = /nenhuma despesa (recente )?encontrada|n[ãa]o possui despesas/i;

/** O backend avisa por STATUS (e não por API_WARNING) quando a casa não devolveu despesas. */
export function avisoDeSemDespesas(s: DossieState, msg: string): DossieState {
	if (!SEM_DESPESAS.test(msg)) return s;
	return aoAvisoApi(s, {
		fonte: "Despesas da casa legislativa",
		mensagem:
			"Nenhuma despesa foi retornada para este político. Pode ser indisponibilidade da fonte ou cache vazio — não é prova de ausência de gastos.",
	});
}

const aoStatus: Manipulador = (s0, p) => {
	const msg = String(p?.msg ?? "");
	const s = avisoDeSemDespesas(s0, msg);
	return {
		...s,
		mensagem: msg,
		log: [...s.log, msg].slice(-LOG_MAX),
		etapas: registrarStatus(s.etapas, msg),
		nodes: mapNodes(
			s.nodes,
			(n) => Boolean(n.data?.isSearching),
			(n) => comDados(n, { currentStatus: msg }),
		),
	};
};

const aoErro: Manipulador = (s, p) => ({
	...s,
	erro: String(p?.mensagem || "Erro no pipeline"),
	status: "error",
});

const aoAvisoApi: Manipulador = (s, p) => {
	if (s.warnings.some((w) => w.fonte === p?.fonte)) return s;
	return { ...s, warnings: [...s.warnings, { fonte: String(p?.fonte), mensagem: String(p?.mensagem) }] };
};

const aoCandidatos: Manipulador = (s, p) => ({
	...s,
	candidatos: Array.isArray(p?.candidatos) ? (p.candidatos as Candidato[]) : null,
});

const aoDone: Manipulador = (s, p) => ({
	...finalizarBusca(s),
	mensagem: p?.msg ? String(p.msg) : s.mensagem,
	status: s.status === "error" ? "error" : "done",
	etapas: marcarConcluida(s.etapas),
});

const aoNodeNovo: Manipulador = (s, p) => aoAdicionarNode(s, p as DossieNode);

const aoAlerta: Manipulador = (s, p) => ({
	...s,
	nodes: mapNodes(
		s.nodes,
		(n) => n.type === "PESSOA",
		(n) => {
			const atuais = Array.isArray(n.data?.alertas) ? (n.data.alertas as string[]) : [];
			return comDados(n, { alertas: [...atuais, String(p?.msg)] });
		},
	),
});

const aoScoresGrafo: Manipulador = (s, p) => {
	const scores = (p ?? {}) as Record<string, { suspicious?: boolean }>;
	const suspeitos = Object.values(scores).filter((m) => m?.suspicious).length;
	return {
		...s,
		suspeitosGrafo: suspeitos,
		nodes: mapNodes(
			s.nodes,
			(n) => Boolean(scores[n.id]),
			(n) => comDados(n, { metrics: scores[n.id] }),
		),
		evidencias: mapNodes(
			s.evidencias,
			(n) => Boolean(scores[n.id]),
			(n) => comDados(n, { metrics: scores[n.id] }),
		),
	};
};

const aoEdgeNova: Manipulador = (s, p) => {
	if (!p?.id || !p?.source || !p?.target) return s;
	if (s.edges.some((e) => e.id === p.id)) return s;
	return { ...s, edges: [...s.edges, { type: "pg", data: { rel: "cache" }, ...(p as DossieEdge) }] };
};

const MANIPULADORES: Record<string, Manipulador> = {
	STATUS: aoStatus,
	ERROR: aoErro,
	API_WARNING: aoAvisoApi,
	CANDIDATOS_ENCONTRADOS: aoCandidatos,
	DONE: aoDone,
	NODE_NOVO: aoNodeNovo,
	ADD_ALERT: aoAlerta,
	GRAPH_ANALYSIS_SCORES: aoScoresGrafo,
	EDGE_NOVA: aoEdgeNova,
};

export function aplicarEvento(s: DossieState, ev: SseEvent): DossieState {
	const h = MANIPULADORES[ev.tipo];
	return h ? h(s, ev.payload) : s;
}

export function aplicarEventos(s: DossieState, eventos: SseEvent[]): DossieState {
	return eventos.reduce(aplicarEvento, s);
}

/* -------------------------------------------------------------------------- */
/* Ciclo de vida                                                              */
/* -------------------------------------------------------------------------- */

function desligarBusca(n: DossieNode): DossieNode {
	return comDados(n, { isSearching: false, currentStatus: undefined });
}

function finalizarBusca(s: DossieState): DossieState {
	return { ...s, nodes: mapNodes(s.nodes, (n) => Boolean(n.data?.isSearching), desligarBusca) };
}

export interface IdentidadeNo {
	label: string;
	cargo?: string;
	uf?: string;
	urlFoto?: string;
	urlFotoFallback?: string;
}

/** Começa uma investigação: limpa tudo e mostra o card da pessoa em "carregando". */
export function iniciarDossie(identidade: IdentidadeNo): DossieState {
	const placeholder: DossieNode = {
		id: PESSOA_PLACEHOLDER_ID,
		type: "PESSOA",
		position: { x: 0, y: 0 },
		data: {
			label: identidade.label.toUpperCase(),
			cargo: identidade.cargo || (identidade.uf === "FEDERAL" ? "GOVERNO FEDERAL" : identidade.uf ? `POLÍTICO (${identidade.uf})` : "POLÍTICO"),
			uf: identidade.uf,
			urlFoto: identidade.urlFoto,
			urlFotoFallback: identidade.urlFotoFallback,
			isSearching: true,
			currentStatus: "Iniciando conexão...",
		},
	};
	return {
		...DOSSIE_VAZIO,
		status: "running",
		mensagem: "Estabelecendo conexão segura com bases governamentais...",
		nodes: [placeholder],
		pessoaId: PESSOA_PLACEHOLDER_ID,
	};
}

/** Fim natural do stream sem DONE explícito. */
export function fimDoStream(s: DossieState): DossieState {
	const base = finalizarBusca(s);
	if (base.status !== "running") return base;
	return { ...base, status: "done", etapas: marcarConcluida(base.etapas) };
}

export function interromper(s: DossieState): DossieState {
	return { ...finalizarBusca(s), status: "partial" };
}

export function falhar(s: DossieState, mensagem: string): DossieState {
	return { ...finalizarBusca(s), erro: mensagem, status: "error" };
}

/* -------------------------------------------------------------------------- */
/* Interações do canvas                                                       */
/* -------------------------------------------------------------------------- */

export function aplicarMudancasNodes(s: DossieState, changes: NodeChange[]): DossieState {
	return { ...s, nodes: applyNodeChanges(changes, s.nodes) as DossieNode[] };
}

export function aplicarMudancasEdges(s: DossieState, changes: EdgeChange[]): DossieState {
	return { ...s, edges: applyEdgeChanges(changes, s.edges) };
}

export function substituirPosicoes(s: DossieState, nodes: DossieNode[]): DossieState {
	return { ...s, nodes };
}

/** Expande/recolhe as emendas individuais ligadas ao hub. */
export function alternarEmendas(s: DossieState, hubId: string): DossieState {
	const hub = s.nodes.find((n) => n.id === hubId);
	if (!hub) return s;
	// só as emendas ligadas a ESTE hub: sem aresta elas ficariam soltas na coluna da pessoa
	const filhas = new Set(s.edges.filter((e) => e.source === hubId && e.data?.rel === "emenda-hub").map((e) => e.target));
	if (filhas.size === 0) return s;
	const expandir = !hub.data?.isExpanded;
	const nodes = s.nodes.map((n) => {
		if (n.id === hubId) return comDados(n, { isExpanded: expandir });
		if (filhas.has(n.id)) return { ...n, hidden: !expandir };
		return n;
	});
	const edges = s.edges.map((e) => (e.source === hubId && e.data?.rel === "emenda-hub" ? { ...e, hidden: !expandir } : e));
	return { ...s, nodes, edges };
}

export function marcarNoBuscando(s: DossieState, id: string, ligado: boolean, msg?: string): DossieState {
	return {
		...s,
		nodes: mapNodes(
			s.nodes,
			(n) => n.id === id,
			(n) => comDados(n, { isSearching: ligado, currentStatus: ligado ? msg : undefined }),
		),
	};
}

/** Leva uma despesa do rail ao canvas, ligando-a à pessoa. */
export function evidenciaParaCanvas(
	s: DossieState,
	id: string,
	posicao?: { x: number; y: number },
): DossieState {
	const item = s.evidencias.find((e) => e.id === id);
	if (!item || s.nodes.some((n) => n.id === id)) return s;
	const score = scoreDe(item) || 50;
	const edges = s.pessoaId
		? upsertEdge(s.edges, novaAresta(s.pessoaId, id, "evidencia", `EVIDÊNCIA (${score}/100)`))
		: s.edges;
	return {
		...s,
		nodes: [...s.nodes, { ...item, position: posicao ?? item.position ?? { x: 0, y: 0 } }],
		edges,
		evidencias: s.evidencias.filter((e) => e.id !== id),
	};
}

export function descartarAviso(s: DossieState, fonte: string): DossieState {
	return { ...s, warnings: s.warnings.filter((w) => w.fonte !== fonte) };
}

/* -------------------------------------------------------------------------- */
/* Pivôs (drill-down a partir de um nó): CNPJ, sócio e contratos              */
/* -------------------------------------------------------------------------- */

export type ModoPivo = "cnpj" | "socio";

const SOBRENOMES_COMUNS = new Set([
	"silva", "santos", "oliveira", "souza", "pereira", "costa", "carvalho", "almeida", "ferreira", "ribeiro",
]);

function ultimoSobrenome(nome: string): string {
	const partes = nome.trim().split(/\s+/);
	return (partes[partes.length - 1] ?? "").toLowerCase();
}

/** Alerta de possível parentesco: mesmo sobrenome raro entre o político e um sócio. */
export function possivelParentesco(nomeCivilPolitico: string | undefined, nomeSocio: string): boolean {
	if (!nomeCivilPolitico) return false;
	const a = ultimoSobrenome(nomeCivilPolitico);
	const b = ultimoSobrenome(nomeSocio);
	return a === b && a.length > 3 && !SOBRENOMES_COMUNS.has(a);
}

function soDigitos(v: unknown): string {
	return String(v ?? "").replace(/\D/g, "");
}

function empresaExistente(s: DossieState, cnpj: string): DossieNode | undefined {
	return s.nodes.find((n) => n.type === "EMPRESA" && soDigitos(n.data?.cnpj) === cnpj);
}

function arestaDoPivoCnpj(s: DossieState, origem: string, node: DossieNode): DossieEdge {
	const pessoa = s.nodes.find((n) => n.type === "PESSOA");
	if (node.type === "SOCIO") {
		const parente = possivelParentesco(pessoa?.data?.nomeCivil, String(node.data?.label ?? ""));
		return novaAresta(origem, node.id, parente ? "parentesco" : "socio", parente ? "ALERTA: POSSÍVEL PARENTESCO" : "SÓCIO (QSA)");
	}
	return novaAresta(origem, node.id, "fornecedor", "FORNECEDOR");
}

/** Novo nó vindo de um pivô por CNPJ (QSA, contratos, sanções...). */
export function aplicarNoDoPivoCnpj(s: DossieState, node: DossieNode): DossieState {
	const origem = String(node.data?._origemId ?? (node as { _origemId?: string })._origemId ?? "");
	const n = { ...node, position: node.position ?? { x: 0, y: 0 } };
	const edges = origem ? upsertEdge(s.edges, arestaDoPivoCnpj(s, origem, node)) : s.edges;
	return { ...s, nodes: upsertNode(s.nodes, n), edges };
}

export interface ResultadoPivoSocio {
	estado: DossieState;
	/** true quando a empresa já estava no painel (só ligamos a aresta). */
	duplicada: boolean;
	/** true quando o nó recebido era uma EMPRESA. */
	ehEmpresa: boolean;
}

/** Novo nó vindo da busca reversa de sócio (EMPRESA em que ele também participa). */
export function aplicarNoDaBuscaReversa(s: DossieState, node: DossieNode): ResultadoPivoSocio {
	const origem = String((node as { _origemId?: string })._origemId ?? node.data?._origemId ?? "");
	const ehEmpresa = node.type === "EMPRESA";
	const existente = ehEmpresa ? empresaExistente(s, soDigitos(node.data?.cnpj)) : undefined;
	const alvoId = existente?.id ?? node.id;
	const edges = origem
		? upsertEdge(s.edges, novaAresta(origem, alvoId, "participacao", "PARTICIPAÇÃO", { style: { strokeDasharray: "5,5" } }))
		: s.edges;
	if (existente) return { estado: { ...s, edges }, duplicada: true, ehEmpresa };
	const n = { ...node, position: node.position ?? { x: 0, y: 0 } };
	return { estado: { ...s, nodes: upsertNode(s.nodes, n), edges }, duplicada: false, ehEmpresa };
}

/** Contratos do PNCP ligados ao nó de origem (fornecedor/empresa). */
export function adicionarContratosPncp(
	s: DossieState,
	origemId: string,
	contratos: Array<Record<string, any>>,
	analise?: Record<string, any>,
): DossieState {
	let estado = s;
	for (const c of contratos) {
		const id = `pncp-${c.numeroControlePNCP}`;
		const av = analise?.contratos_avaliados?.find((a: { numeroControlePNCP?: string }) => a.numeroControlePNCP === c.numeroControlePNCP);
		const geral = Number(analise?.score_letalidade_geral ?? 0);
		const node: DossieNode = {
			id,
			type: "CONTRATO",
			position: { x: 0, y: 0 },
			data: {
				label: c.numeroControlePNCP,
				objeto: c.objetoContrato,
				valor: c.valorInicial,
				dataDocumento: c.dataAssinatura || c.dataVigenciaInicio,
				nomeFornecedor: c.orgaoEntidade?.razaoSocial,
				classificacao: av?.classificacao || "N/A",
				enquadramento_normativo: av?.enquadramento_normativo || "-",
				motivo_ia: av?.motivo_ia || (geral > 50 ? "Risco sistêmico identificado no lote." : null),
				score_letalidade: av?.score_letalidade ?? (geral || 20),
			},
		};
		estado = {
			...estado,
			nodes: upsertNode(estado.nodes, node),
			edges: upsertEdge(estado.edges, novaAresta(origemId, id, "contrato", "CONTRATO PÚBLICO")),
		};
	}
	return estado;
}

/* -------------------------------------------------------------------------- */
/* Derivados para a UI                                                        */
/* -------------------------------------------------------------------------- */

export interface ContagemDossie {
	nos: number;
	criticos: number;
	atencao: number;
}

export function contarDossie(s: DossieState): ContagemDossie {
	const achados = [...s.nodes, ...s.evidencias].filter((n) => n.type !== "PESSOA");
	const riscos = achados.map((n) => riscoDoNo(n.type ?? "", n.data));
	return {
		nos: s.nodes.length,
		criticos: riscos.filter((r) => r === "crit").length,
		atencao: riscos.filter((r) => r === "warn").length,
	};
}
