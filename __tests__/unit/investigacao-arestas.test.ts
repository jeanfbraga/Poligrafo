import { describe, expect, it } from "vitest";
import { contarConexoes, prepararArestas, vizinhosDe } from "@/lib/investigacao/arestas";
import type { DossieEdge, DossieNode } from "@/lib/investigacao/dossie-state";

const no = (id: string, type: string, data: Record<string, unknown> = {}): DossieNode => ({
	id,
	type,
	position: { x: 0, y: 0 },
	data,
});
const ar = (source: string, target: string, label?: string): DossieEdge => ({ id: `${source}>${target}`, source, target, label });

const nodes = [no("p", "PESSOA"), no("d", "DESPESA", { score_letalidade: 90 }), no("e", "EMPRESA", { score_letalidade: 65 }), no("c", "CONTRATO")];
const edges = [ar("p", "d", "IA"), ar("p", "e"), ar("e", "c")];

describe("prepararArestas", () => {
	it("herda o risco do nó de destino", () => {
		const r = prepararArestas(nodes, edges, null);
		expect(r.find((e) => e.target === "d")?.data?.risco).toBe("crit");
		expect(r.find((e) => e.target === "e")?.data?.risco).toBe("warn");
		expect(r.find((e) => e.target === "c")?.data?.risco).toBe("ok");
		expect(r.every((e) => e.type === "pg")).toBe(true);
	});

	it("sem seleção nenhuma aresta fica hot/dim", () => {
		expect(prepararArestas(nodes, edges, null).every((e) => e.data?.estado === "")).toBe(true);
	});

	it("com seleção: ligadas ficam hot e as demais dim", () => {
		const r = prepararArestas(nodes, edges, "e");
		expect(r.find((e) => e.id === "p>e")?.data?.estado).toBe("hot");
		expect(r.find((e) => e.id === "e>c")?.data?.estado).toBe("hot");
		expect(r.find((e) => e.id === "p>d")?.data?.estado).toBe("dim");
	});

	it("aresta para nó inexistente assume risco ok", () => {
		expect(prepararArestas(nodes, [ar("p", "x")], null)[0].data?.risco).toBe("ok");
	});
});

describe("contarConexoes e vizinhosDe", () => {
	it("conta entradas e saídas", () => {
		const m = contarConexoes(edges);
		expect(m.get("p")).toBe(2);
		expect(m.get("e")).toBe(2);
		expect(m.get("c")).toBe(1);
		expect(m.get("zzz")).toBeUndefined();
	});

	it("lista vizinhos com direção e rótulo", () => {
		const v = vizinhosDe("e", edges.map((e) => ({ ...e, data: { rel: "empresa" } })));
		expect(v).toEqual([
			{ id: "p", rel: "EMPRESA", saida: false },
			{ id: "c", rel: "EMPRESA", saida: true },
		]);
		expect(vizinhosDe("p", edges)[0]).toEqual({ id: "d", rel: "IA", saida: true });
	});
});
