import cytoscape from "cytoscape";
import Graph from "graphology";
import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import pagerank from "graphology-metrics/centrality/pagerank";
import type { GraphAnalysisResult } from "../types/graph-analysis";

export function analyzeGraphNetwork(nodesInput: any[]): GraphAnalysisResult {
	if (!nodesInput || nodesInput.length === 0) return {};

	const graph = new Graph();
	const cyElements: any[] = [];

	// Mapeamento para resolução de bypass de hubs artificiais
	const bypassNodes = new Set<string>();
	const nodeMap = new Map<string, any>();

	nodesInput.forEach((n) => {
		nodeMap.set(n.id, n);
		if (n.type === "EMENDA_RESUMO" || n.type === "RESUMO_GASTOS") {
			bypassNodes.add(n.id);
		}
	});

	// 1. Reconstrução de Nós (ignorando agregadores)
	nodesInput.forEach((n) => {
		if (!bypassNodes.has(n.id)) {
			if (!graph.hasNode(n.id)) {
				graph.addNode(n.id, { type: n.type });
			}
			cyElements.push({
				data: { id: n.id, type: n.type },
			});
		}
	});

	// Função auxiliar para encontrar a origem estrutural real
	const getRealSource = (node: any): string | null => {
		let current = node;
		let depth = 0;
		// O pipeline emite a origem como `_origemId` (prefixo underscore);
		// aceita também `origemId` para compatibilidade com caches antigos.
		while (current && depth < 5) {
			const origem: string | undefined = current._origemId ?? current.origemId;
			if (!origem) return null;
			if (!bypassNodes.has(origem)) {
				return origem;
			}
			current = nodeMap.get(origem);
			depth++;
		}
		return null;
	};

	// 2. Construção de Arestas Analíticas Reais
	nodesInput.forEach((n) => {
		if (bypassNodes.has(n.id)) return;

		const realSourceId = getRealSource(n);

		if (realSourceId && realSourceId !== n.id && graph.hasNode(realSourceId)) {
			if (!graph.hasEdge(realSourceId, n.id)) {
				graph.addEdge(realSourceId, n.id);
				cyElements.push({
					data: {
						id: `edge-analytical-${realSourceId}-${n.id}`,
						source: realSourceId,
						target: n.id,
					},
				});
			}
		}
	});

	if (graph.order === 0) return {};

	// ==========================================
	// BACKEND: GRAPHOLOGY (Centralidade e Hubs)
	// ==========================================
	let prScores: Record<string, number> = {};
	let bcScores: Record<string, number> = {};

	try {
		prScores = pagerank(graph);
	} catch (e) {
		console.warn("[Graphology] Erro no PageRank:", e);
	}

	try {
		bcScores = betweennessCentrality(graph);
	} catch (e) {
		console.warn("[Graphology] Erro no Betweenness:", e);
	}

	// Normalização Min-Max para scores ficarem estritamente entre 0 e 1
	const maxPr = Math.max(...Object.values(prScores), 1e-10);
	const maxBc = Math.max(...Object.values(bcScores), 1e-10);

	// ==========================================
	// BACKEND: CYTOSCAPE (Algoritmos Relacionais / Componentes)
	// ==========================================
	const componentsMapping: Record<string, number> = {};
	try {
		const cy = cytoscape({
			headless: true,
			elements: cyElements,
		});

		const components = cy.elements().components();
		components.forEach((component: any, index: number) => {
			component.nodes().forEach((node: any) => {
				componentsMapping[node.id()] = index;
			});
		});
	} catch (e) {
		console.warn("[Cytoscape] Erro ao instanciar analítico:", e);
	}

function pontuarTipoGrafo(type: string) {
	if (type === "EMPRESA" || type === "CONTRATO") return 2;
	if (type === "SOCIO") return 1;
	return 0;
}

function calcularScoreSuspeicao(bc: number, degree: number, type: string) {
	let suspicionScore = 0;
	if (bc >= 0.6) suspicionScore += 3;
	else if (bc >= 0.3) suspicionScore += 1;

	if (degree > 0 && degree <= 5 && bc >= 0.4) suspicionScore += 1;
	if (degree > 15) suspicionScore -= 2;

	suspicionScore += pontuarTipoGrafo(type);

	const suspicious = type !== "PESSOA" && suspicionScore >= 4;
	return { suspicionScore, suspicious };
}

function montarNodeAnalysis(
	n: any,
	bypassNodes: Set<string>,
	graph: any,
	prScores: Record<string, number>,
	maxPr: number,
	bcScores: Record<string, number>,
	maxBc: number,
	componentsMapping: Record<string, number>,
) {
	if (bypassNodes.has(n.id)) {
		return {
			degree: 0,
			betweennessCentrality: 0,
			pagerank: 0,
			componentId: -1,
			suspicionScore: 0,
			suspicious: false,
		};
	}

	const degree = graph.degree(n.id);
	const pr = (prScores[n.id] || 0) / maxPr;
	const bc = (bcScores[n.id] || 0) / maxBc;
	const componentId = componentsMapping[n.id] !== undefined ? componentsMapping[n.id] : -1;
	const type = graph.getNodeAttribute(n.id, "type");
	const { suspicionScore, suspicious } = calcularScoreSuspeicao(bc, degree, type);

	return {
		degree,
		betweennessCentrality: bc,
		pagerank: pr,
		componentId,
		suspicionScore,
		suspicious,
	};
}

// ==========================================
// MONTAGEM DO RESULTADO
// ==========================================
const results: GraphAnalysisResult = {};

nodesInput.forEach((n) => {
	results[n.id] = montarNodeAnalysis(
		n,
		bypassNodes,
		graph,
		prScores,
		maxPr,
		bcScores,
		maxBc,
		componentsMapping,
	);
});

	return results;
}

// touch
