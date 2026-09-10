import {
	type Edge,
	type Node,
	useNodesInitialized,
	useReactFlow,
} from "@xyflow/react";
import dagre from "dagre";
import { useEffect, useRef } from "react";

function criarDagreGraph(nodes: Node[], edges: Edge[]): dagre.graphlib.Graph {
	const dagreGraph = new dagre.graphlib.Graph();
	dagreGraph.setDefaultEdgeLabel(() => ({}));
	dagreGraph.setGraph({
		rankdir: "TB",
		nodesep: 100,
		ranksep: 200,
		align: "UL",
	});

	nodes.forEach((n) => {
		if (n.hidden) return;
		const w = n.measured?.width || n.width || 350;
		const h = n.measured?.height || n.height || 150;
		dagreGraph.setNode(n.id, { width: w, height: h });
	});

	edges.forEach((e) => {
		if (e.hidden) return;
		const sourceNode = nodes.find((n) => n.id === e.source);
		const targetNode = nodes.find((n) => n.id === e.target);
		if (!sourceNode || !targetNode || sourceNode.hidden || targetNode.hidden) return;
		dagreGraph.setEdge(e.source, e.target);
	});

	return dagreGraph;
}

function calcularOffsets(anchorNode: Node | undefined, dagreGraph: dagre.graphlib.Graph) {
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

	return { offsetX, offsetY };
}

function aplicarPosicoesNodes(
	nodes: Node[],
	dagreGraph: dagre.graphlib.Graph,
	offsetX: number,
	offsetY: number,
): Node[] {
	return nodes.map((n) => {
		if (n.hidden) return n;

		const nodeWithPosition = dagreGraph.node(n.id);
		if (!nodeWithPosition) return n;

		const w = n.measured?.width || n.width || 350;
		const h = n.measured?.height || n.height || 150;
		const targetX = nodeWithPosition.x - w / 2 + offsetX;
		const targetY = nodeWithPosition.y - h / 2 + offsetY;

		return {
			...n,
			position: {
				x: targetX,
				y: targetY,
			},
		};
	});
}

export function useAutoLayout(nodes: Node[], edges: Edge[]) {
	const { setNodes, fitView } = useReactFlow();
	const isLayoutRunning = useRef(false);
	const lastLayoutSignature = useRef("");
	const nodesInitialized = useNodesInitialized();

	useEffect(() => {
		const currentSignature = `${nodes.map((n) => `${n.id}:${n.measured?.width || 0}x${n.measured?.height || 0}`).join(",")}|${edges.map((e) => e.id).join(",")}`;

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

		const dagreGraph = criarDagreGraph(nodes, edges);

		try {
			dagre.layout(dagreGraph);

			const anchorNode = nodes.find((n) => n.type === "PESSOA" && !n.hidden) || nodes.find((n) => !n.hidden) || nodes[0];
			const { offsetX, offsetY } = calcularOffsets(anchorNode, dagreGraph);
			const layoutedNodes = aplicarPosicoesNodes(nodes, dagreGraph, offsetX, offsetY);

			setNodes(layoutedNodes);
		} catch (error) {
			console.error("Erro ao rodar Dagre layout:", error);
		} finally {
			setTimeout(() => {
				isLayoutRunning.current = false;
			}, 50);
		}
	}, [
		nodes,
		edges,
		setNodes,
		nodesInitialized,
		fitView,
	]);
}
