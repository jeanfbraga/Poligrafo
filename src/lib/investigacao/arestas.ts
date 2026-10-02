/* ==========================================================================
   Derivados do grafo para a UI: arestas com risco/estado, contagem de
   conexões e vizinhos de um nó (usado no inspetor).
   ========================================================================== */
import type { DossieEdge, DossieNode } from "./dossie-state";
import { riscoDoNo } from "./risco";

/** Cada aresta herda o risco do nó de destino; com seleção, liga (hot) ou esmaece (dim). */
export function prepararArestas(
	nodes: DossieNode[],
	edges: DossieEdge[],
	selecionado: string | null,
): DossieEdge[] {
	const riscos = new Map(nodes.map((n) => [n.id, riscoDoNo(n.type ?? "", n.data)]));
	return edges.map((e) => {
		const ligada = selecionado !== null && (e.source === selecionado || e.target === selecionado);
		const estado = selecionado === null ? "" : ligada ? "hot" : "dim";
		return {
			...e,
			type: "pg",
			data: { ...e.data, risco: riscos.get(e.target) ?? "ok", estado },
		};
	});
}

export function contarConexoes(edges: DossieEdge[]): Map<string, number> {
	const m = new Map<string, number>();
	for (const e of edges) {
		m.set(e.source, (m.get(e.source) ?? 0) + 1);
		m.set(e.target, (m.get(e.target) ?? 0) + 1);
	}
	return m;
}

export interface Vizinho {
	id: string;
	/** Rótulo da relação (label da aresta ou tipo). */
	rel: string;
	/** true = aresta sai do nó consultado (→); false = chega nele (←). */
	saida: boolean;
}

export function vizinhosDe(id: string, edges: DossieEdge[]): Vizinho[] {
	const out: Vizinho[] = [];
	for (const e of edges) {
		if (e.source !== id && e.target !== id) continue;
		const rel = String(e.label ?? e.data?.rel ?? "").toUpperCase();
		out.push({ id: e.source === id ? e.target : e.source, rel, saida: e.source === id });
	}
	return out;
}
