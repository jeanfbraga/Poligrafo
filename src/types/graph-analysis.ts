export interface AnalyticalEdge {
	id: string;
	source: string;
	target: string;
	relationType?: string;
}

export interface NodeMetrics {
	/** Identifica o volume absoluto de conexões diretas de um nó. Útil para encontrar "hubs" locais na rede. */
	degree: number;
	/** Identifica entidades que atuam como "pontes" ou "laranjas", conectando sub-redes isoladas (normalizado 0-1) */
	betweennessCentrality: number;
	/** Identifica entidades de maior influência e prestígio na rede (normalizado 0-1) */
	pagerank: number;
	/** Identifica componentes conectados (subgrafos paralelos) gerado pelo Cytoscape */
	componentId: string | number;
	/** Score numérico de suspeição consolidado */
	suspicionScore: number;
	/** Flag visual baseada no suspicionScore */
	suspicious: boolean;
}

export type GraphAnalysisResult = Record<string, NodeMetrics>;
