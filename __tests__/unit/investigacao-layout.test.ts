import { describe, expect, it } from "vitest";
import type { DossieEdge, DossieNode } from "@/lib/investigacao/dossie-state";
import {
	alturaEstimada,
	aplicarPosicoes,
	assinaturaLayout,
	calcularLayout,
	colide,
	LARGURA_CARD,
	posicaoLivre,
	type Retangulo,
} from "@/lib/investigacao/layout";

const no = (id: string, type = "DESPESA", extra: Partial<DossieNode> = {}): DossieNode => ({
	id,
	type,
	position: { x: 0, y: 0 },
	data: {},
	...extra,
});
const aresta = (source: string, target: string, extra: Partial<DossieEdge> = {}): DossieEdge => ({
	id: `${source}-${target}`,
	source,
	target,
	...extra,
});
const altura = () => 200;
const base = { campos: 0, temMedidor: false, temMotivo: false, motivoLen: 0, subLen: 0, tituloLen: 10, carregando: false };

describe("alturaEstimada", () => {
	it("cresce com campos, medidor, motivo e carregamento", () => {
		const a = alturaEstimada(base);
		expect(alturaEstimada({ ...base, campos: 4 })).toBeGreaterThan(a);
		expect(alturaEstimada({ ...base, temMedidor: true })).toBeGreaterThan(a);
		expect(alturaEstimada({ ...base, temMotivo: true, motivoLen: 120 })).toBeGreaterThan(a);
		expect(alturaEstimada({ ...base, carregando: true })).toBeGreaterThan(a);
	});

	it("título longo ocupa até 2 linhas; motivo até 5", () => {
		expect(alturaEstimada({ ...base, tituloLen: 500 })).toBe(alturaEstimada({ ...base, tituloLen: 60 }));
		const m = (len: number) => alturaEstimada({ ...base, temMotivo: true, motivoLen: len });
		expect(m(5000)).toBe(m(150));
	});
});

describe("alturaEstimada — bloco de avaliação da IA", () => {
	it("sem justificativa o bloco (nível + nota + barra) soma altura; com justificativa quase nada", () => {
		const semScore = alturaEstimada(base);
		expect(alturaEstimada({ ...base, temScore: true })).toBeGreaterThanOrEqual(semScore + 40);
		const comMotivo = alturaEstimada({ ...base, temMotivo: true, motivoLen: 40 });
		const comMotivoEScore = alturaEstimada({ ...base, temMotivo: true, motivoLen: 40, temScore: true });
		expect(comMotivoEScore - comMotivo).toBeLessThanOrEqual(10);
	});

	it("destaque textual longo aumenta a altura", () => {
		expect(alturaEstimada({ ...base, heroLongo: true })).toBeGreaterThan(alturaEstimada(base));
	});
});

describe("colisões", () => {
	const r = (x: number, y: number, w = 248, h = 200): Retangulo => ({ x, y, w, h });

	it("colide considera a folga entre cards", () => {
		expect(colide(r(0, 0), r(250, 0))).toBe(true); // 2px de distância < folga
		expect(colide(r(0, 0), r(248 + 24, 0))).toBe(false);
	});

	it("posicaoLivre devolve a própria posição quando está livre", () => {
		expect(posicaoLivre({ x: 1000, y: 1000 }, { w: 248, h: 200 }, [r(0, 0)])).toEqual({ x: 1000, y: 1000 });
	});

	it("posicaoLivre sai de cima de um card e não encosta em nenhum outro", () => {
		const ocupados = [r(0, 0), r(280, 0), r(0, 240), r(280, 240)];
		const p = posicaoLivre({ x: 10, y: 10 }, { w: 248, h: 200 }, ocupados);
		expect(ocupados.some((o) => colide({ ...p, w: 248, h: 200 }, o))).toBe(false);
	});

	it("posicaoLivre escolhe a posição livre mais próxima da desejada", () => {
		const p = posicaoLivre({ x: 0, y: 0 }, { w: 248, h: 200 }, [r(0, 0)]);
		const longe = posicaoLivre({ x: 0, y: 0 }, { w: 248, h: 200 }, [r(0, 0)]);
		expect(p).toEqual(longe);
		expect(Math.hypot(p.x, p.y)).toBeLessThan(600);
	});
});

describe("calcularLayout — nó fixo sobre outro card", () => {
	it("um nó solto/arrastado em cima de outro é levado ao espaço livre mais próximo", () => {
		const base2 = [no("p", "PESSOA"), no("a")];
		const e = [aresta("p", "a")];
		const sem = calcularLayout(base2, e, { direcao: "LR", altura }).posicoes;
		const pa = sem.get("a")!;
		// "b" foi solto exatamente sobre "a"
		const nodes2 = [...base2, no("b", "DESPESA", { position: { ...pa } })];
		const r = calcularLayout(nodes2, [...e, aresta("p", "b")], { direcao: "LR", altura, fixos: new Set(["b"]) }).posicoes;
		const ret = (id: string): Retangulo => ({ ...r.get(id)!, w: LARGURA_CARD, h: 200 });
		expect(colide(ret("b"), ret("a"))).toBe(false);
		expect(colide(ret("b"), ret("p"))).toBe(false);
	});
});

describe("calcularLayout", () => {
	const nodes = [no("p", "PESSOA"), no("a"), no("b"), no("c")];
	const edges = [aresta("p", "a"), aresta("p", "b"), aresta("a", "c")];

	it("LR: filhos ficam à direita do pai; TB: abaixo", () => {
		const lr = calcularLayout(nodes, edges, { direcao: "LR", altura }).posicoes;
		expect(lr.get("a")!.x).toBeGreaterThan(lr.get("p")!.x);
		expect(lr.get("c")!.x).toBeGreaterThan(lr.get("a")!.x);
		const tb = calcularLayout(nodes, edges, { direcao: "TB", altura }).posicoes;
		expect(tb.get("a")!.y).toBeGreaterThan(tb.get("p")!.y);
	});

	it("irmãos não se sobrepõem (altura estimada respeitada)", () => {
		const lr = calcularLayout(nodes, edges, { direcao: "LR", altura }).posicoes;
		const dy = Math.abs(lr.get("a")!.y - lr.get("b")!.y);
		expect(dy).toBeGreaterThanOrEqual(200);
		const dxTb = Math.abs(calcularLayout(nodes, edges, { direcao: "TB", altura }).posicoes.get("a")!.x - calcularLayout(nodes, edges, { direcao: "TB", altura }).posicoes.get("b")!.x);
		expect(dxTb).toBeGreaterThanOrEqual(LARGURA_CARD);
	});

	it("a pessoa ancora o desenho na posição que já tinha", () => {
		const n2 = [no("p", "PESSOA", { position: { x: 500, y: 300 } }), no("a")];
		const r = calcularLayout(n2, [aresta("p", "a")], { direcao: "LR", altura }).posicoes;
		expect(r.get("p")).toEqual({ x: 500, y: 300 });
	});

	it("nós e arestas ocultos ficam fora do layout", () => {
		const r = calcularLayout([no("p", "PESSOA"), no("h", "EMENDA", { hidden: true })], [aresta("p", "h")], { direcao: "LR", altura }).posicoes;
		expect(r.has("h")).toBe(false);
		expect(r.has("p")).toBe(true);
	});

	it("nós fixos (arrastados) mantêm a posição", () => {
		const n2 = [no("p", "PESSOA"), no("a", "DESPESA", { position: { x: 999, y: 888 } })];
		const r = calcularLayout(n2, [aresta("p", "a")], { direcao: "LR", altura, fixos: new Set(["a"]) }).posicoes;
		expect(r.get("a")).toEqual({ x: 999, y: 888 });
	});

	it("grafo vazio devolve mapa vazio", () => {
		expect(calcularLayout([], [], { direcao: "LR", altura }).posicoes.size).toBe(0);
	});
});

describe("assinaturaLayout e aplicarPosicoes", () => {
	it("a assinatura muda com direção, altura, nós e arestas", () => {
		const n = [no("p", "PESSOA"), no("a")];
		const e = [aresta("p", "a")];
		const s1 = assinaturaLayout(n, e, { direcao: "LR", altura });
		expect(assinaturaLayout(n, e, { direcao: "TB", altura })).not.toBe(s1);
		expect(assinaturaLayout(n, e, { direcao: "LR", altura: () => 300 })).not.toBe(s1);
		expect(assinaturaLayout([...n, no("b")], e, { direcao: "LR", altura })).not.toBe(s1);
		expect(assinaturaLayout(n, [], { direcao: "LR", altura })).not.toBe(s1);
		expect(assinaturaLayout(n, e, { direcao: "LR", altura })).toBe(s1);
	});

	it("aplicarPosicoes preserva a identidade quando nada muda", () => {
		const n = [no("a", "DESPESA", { position: { x: 1, y: 2 } })];
		const same = aplicarPosicoes(n, { posicoes: new Map([["a", { x: 1, y: 2 }]]) });
		expect(same).toBe(n);
		const mudou = aplicarPosicoes(n, { posicoes: new Map([["a", { x: 5, y: 6 }]]) });
		expect(mudou[0].position).toEqual({ x: 5, y: 6 });
	});
});
