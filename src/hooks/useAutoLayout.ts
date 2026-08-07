import {
	type Edge,
	type Node,
	useNodesInitialized,
	useReactFlow,
} from "@xyflow/react";
import dagre from "dagre";
import { useEffect, useRef } from "react";

export function useAutoLayout(nodes: Node[], edges: Edge[]) {
	const { setNodes, fitView } = useReactFlow();
	const isLayoutRunning = useRef(false);
	const lastLayoutSignature = useRef("");
	const nodesInitialized = useNodesInitialized();

	useEffect(() => {
		// Assinatura única do grafo atual (quais nós e arestas existem + seus tamanhos)
		const currentSignature = `${nodes.map((n) => `${n.id}:${n.measured?.width || 0}x${n.measured?.height || 0}`).join(",")}|${edges.map((e) => e.id).join(",")}`;

		// Roda o layout apenas se houverem nós suficientes, não estiver rodando, e todos já estiverem desenhados/medidos
		// E PRINCIPALMENTE: Apenas se a assinatura do grafo mudou (evita loop infinito)
		if (
			nodes.length < 2 ||
			isLayoutRunning.current ||
			!nodesInitialized ||
			currentSignature === lastLayoutSignature.current
		) {
			return;
		}

		isLayoutRunning.current = true;
		lastLayoutSignature.current = currentSignature;

		// Instancia o grafo Dagre
		const dagreGraph = new dagre.graphlib.Graph();
		dagreGraph.setDefaultEdgeLabel(() => ({}));

		// Define opções do layout (rankdir LR = Esquerda para Direita, TB = Topo para Baixo)
		// O nodeSep e rankSep definem o espaçamento obrigatório em pixels, garantindo ZERO sobreposição
		dagreGraph.setGraph({
			rankdir: "TB",
			nodesep: 100, // Espaçamento horizontal entre os nós
			ranksep: 200, // Espaçamento vertical entre os "níveis" da investigação
			align: "UL", // Alinhamento
		});

		// Alimenta os nós no Dagre com os tamanhos reais medidos
		nodes.forEach((n) => {
			if (n.hidden) return; // Ignora nós ocultos para não ocuparem espaço fantasma
			const w = n.measured?.width || n.width || 350;
			const h = n.measured?.height || n.height || 150;

			dagreGraph.setNode(n.id, { width: w, height: h });
		});

		// Alimenta as arestas
		edges.forEach((e) => {
			if (e.hidden) return; // Ignora arestas ocultas
			// Previne crash caso a aresta aponte para um nó oculto/inexistente no Dagre
			const sourceNode = nodes.find(n => n.id === e.source);
			const targetNode = nodes.find(n => n.id === e.target);
			
			// Se o nó não existir ou estiver oculto, não adiciona a aresta no Dagre
			if (!sourceNode || !targetNode || sourceNode.hidden || targetNode.hidden) return;

			dagreGraph.setEdge(e.source, e.target);
		});

		try {
			// Executa o cálculo matematicamente (é síncrono e instantâneo)
			dagre.layout(dagreGraph);

		// 1. Encontrar o nó âncora (PESSOA ou o primeiro nó) para evitar que o grafo "fuja" da tela
		const anchorNode = nodes.find(n => n.type === 'PESSOA' && !n.hidden) || nodes.find(n => !n.hidden) || nodes[0];
		let offsetX = 0;
		let offsetY = 0;

		if (anchorNode) {
			const anchorDagrePos = dagreGraph.node(anchorNode.id);
			if (anchorDagrePos) {
				const w = anchorNode.measured?.width || anchorNode.width || 350;
				const h = anchorNode.measured?.height || anchorNode.height || 150;
				const newAnchorX = anchorDagrePos.x - w / 2;
				const newAnchorY = anchorDagrePos.y - h / 2;
				
				offsetX = anchorNode.position.x - newAnchorX;
				offsetY = anchorNode.position.y - newAnchorY;
			}
		}

		// Pega as novas posições. O Dagre retorna coordenadas de Top-Left + Offset interno.
		const layoutedNodes = nodes.map((n) => {
			if (n.hidden) return n; // Mantém a posição original de nós ocultos

			const nodeWithPosition = dagreGraph.node(n.id);
			if (!nodeWithPosition) return n; // Prevenção de falha

			const w = n.measured?.width || n.width || 350;
			const h = n.measured?.height || n.height || 150;

			// Transforma o centro do Dagre para o top-left do React Flow e aplica o offset
			const targetX = (nodeWithPosition.x - w / 2) + offsetX;
			const targetY = (nodeWithPosition.y - h / 2) + offsetY;

			return {
				...n,
				position: {
					x: targetX,
					y: targetY,
				},
			};
		});

			// Atualiza a tela de uma vez só!
			setNodes(layoutedNodes);
		} catch (error) {
			console.error("Erro ao rodar Dagre layout:", error);
		} finally {
			// Dá um pequeno respiro pro React renderizar (removido fitView automático para não roubar a câmera)
			setTimeout(() => {
				isLayoutRunning.current = false;
			}, 50);
		}
	}, [
		nodes,
		edges,
		setNodes,
		nodesInitialized,
		fitView
	]);
}
