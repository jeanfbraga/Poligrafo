/* ==========================================================================
   Layout do Dossiê — Dagre determinístico, LR (padrão) ou TB.
   As dimensões vêm de uma ESTIMATIVA do card "full" (não do DOM medido):
   assim o layout não depende do zoom (densidade full/slim/dot) e não entra
   em loop de re-medição.
   ========================================================================== */
import dagre from "dagre";
import type { DossieEdge, DossieNode } from "./dossie-state";

export type Direcao = "LR" | "TB";

export const LARGURA_CARD = 248;

export interface DadosAltura {
	campos: number;
	temMedidor: boolean;
	temMotivo: boolean;
	motivoLen: number;
	subLen: number;
	tituloLen: number;
	carregando: boolean;
	/** Bloco "Avaliação IA" (nível, nota e barra) acima da justificativa. */
	temScore?: boolean;
	/** Destaque textual longo (corpo menor, mas quebra em várias linhas). */
	heroLongo?: boolean;
	/** Linha "Crítico por regra: …" no bloco de IA (2 linhas de texto micro). */
	temRegra?: boolean;
}

const CHARS_POR_LINHA = 30;

function linhas(len: number, max: number): number {
	return Math.max(1, Math.min(max, Math.ceil(len / CHARS_POR_LINHA)));
}

/**
 * Bloco "Avaliação IA" (nível + nota + barra). Com justificativa, o espaço já está
 * quase todo na estimativa do motivo (medido no navegador); sem ela, o bloco é inteiro.
 */
function alturaBlocoIA(d: DadosAltura): number {
	if (!d.temScore) return 0;
	const base = d.temMotivo ? 4 : 46;
	return d.temRegra ? base + 34 : base;
}

/** Altura estimada do card em densidade full (px). Levemente conservadora. */
export function alturaEstimada(d: DadosAltura): number {
	const cabecalho = 34;
	const corpoPadding = 20;
	const titulo = linhas(d.tituloLen, 2) * 19;
	const sub = d.subLen > 0 ? linhas(d.subLen, 2) * 18 : 0;
	const hero = d.heroLongo ? 82 : 62;
	const linhasCampos = Math.ceil(d.campos / 2);
	const campos = d.campos > 0 ? linhasCampos * 40 : 0;
	const medidor = d.temMedidor ? 36 : 0;
	const bloco = alturaBlocoIA(d);
	const motivo = d.temMotivo ? 14 + linhas(d.motivoLen, 5) * 18 : 0;
	const carregando = d.carregando ? 52 : 0;
	const rodape = 30;
	const gaps = 8 * 4;
	return cabecalho + corpoPadding + titulo + sub + hero + campos + medidor + bloco + motivo + carregando + rodape + gaps;
}

/* -------------------------------------------------------------------------- */
/* Colisões: nós que entram no canvas nunca ficam por cima de outros          */
/* -------------------------------------------------------------------------- */

export interface Ponto {
	x: number;
	y: number;
}
export interface Retangulo extends Ponto {
	w: number;
	h: number;
}

/** Espaço livre mínimo entre dois cards. */
const FOLGA = 24;
const MAX_ANEIS = 14;

export function colide(a: Retangulo, b: Retangulo, folga = FOLGA): boolean {
	return a.x < b.x + b.w + folga && b.x < a.x + a.w + folga && a.y < b.y + b.h + folga && b.y < a.y + a.h + folga;
}

function anelDeOffsets(k: number): [number, number][] {
	const out: [number, number][] = [];
	for (let dx = -k; dx <= k; dx++) {
		for (let dy = -k; dy <= k; dy++) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) === k) out.push([dx, dy]);
		}
	}
	return out;
}

function abaixoDeTudo(desejada: Ponto, ocupados: Retangulo[]): Ponto {
	const fundo = ocupados.reduce((m, o) => Math.max(m, o.y + o.h), desejada.y);
	return { x: desejada.x, y: fundo + FOLGA };
}

/**
 * Posição livre mais próxima da desejada (busca em anéis crescentes, passo de
 * meio card). Se a desejada já está livre, devolve ela mesma.
 */
export function posicaoLivre(desejada: Ponto, tam: { w: number; h: number }, ocupados: Retangulo[]): Ponto {
	const livre = (p: Ponto) => !ocupados.some((o) => colide({ ...p, ...tam }, o));
	if (livre(desejada)) return desejada;
	const passoX = tam.w / 2 + FOLGA;
	const passoY = tam.h / 2 + FOLGA;
	const distancia = (p: Ponto) => Math.hypot(p.x - desejada.x, p.y - desejada.y);
	for (let k = 1; k <= MAX_ANEIS; k++) {
		const achou = anelDeOffsets(k)
			.map(([dx, dy]) => ({ x: desejada.x + dx * passoX, y: desejada.y + dy * passoY }))
			.sort((a, b) => distancia(a) - distancia(b))
			.find(livre);
		if (achou) return achou;
	}
	return abaixoDeTudo(desejada, ocupados);
}

export type AlturaDoNo = (n: DossieNode) => number;

export interface ResultadoLayout {
	posicoes: Map<string, { x: number; y: number }>;
}

export interface OpcoesLayout {
	direcao: Direcao;
	altura: AlturaDoNo;
	/** Nós que o usuário arrastou: mantêm a posição atual. */
	fixos?: ReadonlySet<string>;
}

function montarGrafo(nodes: DossieNode[], edges: DossieEdge[], o: OpcoesLayout): dagre.graphlib.Graph {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));
	g.setGraph({
		rankdir: o.direcao,
		nodesep: o.direcao === "LR" ? 48 : 72,
		ranksep: o.direcao === "LR" ? 120 : 110,
		align: "UL",
	});
	const visiveis = new Set<string>();
	for (const n of nodes) {
		if (n.hidden) continue;
		visiveis.add(n.id);
		g.setNode(n.id, { width: LARGURA_CARD, height: o.altura(n) });
	}
	for (const e of edges) {
		if (e.hidden || !visiveis.has(e.source) || !visiveis.has(e.target)) continue;
		g.setEdge(e.source, e.target);
	}
	return g;
}

/** Assinatura do grafo: se não mudar, o layout não precisa rodar de novo. */
export function assinaturaLayout(nodes: DossieNode[], edges: DossieEdge[], o: OpcoesLayout): string {
	const ns = nodes.filter((n) => !n.hidden).map((n) => `${n.id}:${o.altura(n)}`).join(",");
	const es = edges.filter((e) => !e.hidden).map((e) => e.id).join(",");
	return `${o.direcao}|${ns}|${es}`;
}

/**
 * Calcula as posições (canto superior esquerdo) de cada nó visível.
 * A pessoa investigada ancora o desenho: o grafo é deslocado para que ela
 * permaneça onde estava (sem "pulos" quando chegam novos nós).
 */
type Posicoes = Map<string, { x: number; y: number }>;

function posicoesDoDagre(nodes: DossieNode[], g: dagre.graphlib.Graph): Posicoes {
	const posicoes: Posicoes = new Map();
	for (const n of nodes) {
		const p = n.hidden ? undefined : g.node(n.id);
		if (p) posicoes.set(n.id, { x: p.x - p.width / 2, y: p.y - p.height / 2 });
	}
	return posicoes;
}

/** Desloca tudo para que a pessoa investigada permaneça onde já estava. */
function ancorarNaPessoa(nodes: DossieNode[], posicoes: Posicoes): void {
	const ancora = nodes.find((n) => n.type === "PESSOA" && !n.hidden);
	const nova = ancora ? posicoes.get(ancora.id) : undefined;
	if (!ancora || !nova) return;
	const dx = ancora.position.x - nova.x;
	const dy = ancora.position.y - nova.y;
	if (dx === 0 && dy === 0) return;
	for (const [id, p] of posicoes) posicoes.set(id, { x: p.x + dx, y: p.y + dy });
}

function manterFixos(nodes: DossieNode[], posicoes: Posicoes, fixos: ReadonlySet<string>): void {
	for (const n of nodes) {
		if (fixos.has(n.id)) posicoes.set(n.id, { ...n.position });
	}
}

function retangulosVisiveis(nodes: DossieNode[], posicoes: Posicoes, altura: AlturaDoNo): Map<string, Retangulo> {
	const rects = new Map<string, Retangulo>();
	for (const n of nodes) {
		const p = n.hidden ? undefined : posicoes.get(n.id);
		if (p) rects.set(n.id, { ...p, w: LARGURA_CARD, h: altura(n) });
	}
	return rects;
}

/**
 * Nós fixos (soltos/arrastados pelo usuário) que acabaram sobre outro card são
 * levados ao espaço livre mais próximo. Os demais nós não se movem.
 */
function afastarFixosSobrepostos(nodes: DossieNode[], posicoes: Posicoes, o: OpcoesLayout): void {
	if (!o.fixos || o.fixos.size === 0) return;
	const rects = retangulosVisiveis(nodes, posicoes, o.altura);
	for (const [id, meu] of rects) {
		if (!o.fixos.has(id)) continue;
		const outros = [...rects].filter(([outro]) => outro !== id).map(([, r]) => r);
		if (!outros.some((r) => colide(meu, r))) continue;
		const livre = posicaoLivre({ x: meu.x, y: meu.y }, { w: meu.w, h: meu.h }, outros);
		posicoes.set(id, livre);
		rects.set(id, { ...meu, ...livre });
	}
}

export function calcularLayout(nodes: DossieNode[], edges: DossieEdge[], o: OpcoesLayout): ResultadoLayout {
	const g = montarGrafo(nodes, edges, o);
	if (g.nodeCount() === 0) return { posicoes: new Map() };
	dagre.layout(g);
	const posicoes = posicoesDoDagre(nodes, g);
	ancorarNaPessoa(nodes, posicoes);
	if (o.fixos) manterFixos(nodes, posicoes, o.fixos);
	afastarFixosSobrepostos(nodes, posicoes, o);
	return { posicoes };
}

/** Aplica as posições calculadas; devolve os mesmos nós se nada mudou. */
export function aplicarPosicoes(nodes: DossieNode[], r: ResultadoLayout): DossieNode[] {
	let mudou = false;
	const novos = nodes.map((n) => {
		const p = r.posicoes.get(n.id);
		if (!p || (p.x === n.position.x && p.y === n.position.y)) return n;
		mudou = true;
		return { ...n, position: p };
	});
	return mudou ? novos : nodes;
}
