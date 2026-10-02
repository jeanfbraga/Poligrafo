"use client";

import {
	Background,
	BackgroundVariant,
	type EdgeChange,
	MiniMap,
	type NodeChange,
	ReactFlow,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
	forwardRef,
	type MutableRefObject,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import PgEdge from "@/components/edges/PgEdge";
import { TIPOS_NO } from "@/components/nodes/node-types";
import type { DossieEdge, DossieNode } from "@/lib/investigacao/dossie-state";
import type { Direcao } from "@/lib/investigacao/layout";
import { riscoDoNo } from "@/lib/investigacao/risco";
import { DossieNodeView } from "./DossieNodeView";
import { useDossieLayout } from "./useDossieLayout";

export const MIME_EVIDENCIA = "application/x-pg-evidencia";

const nodeTypes = {
	...Object.fromEntries(Object.keys(TIPOS_NO).map((k) => [k, DossieNodeView])),
	default: DossieNodeView,
};
const edgeTypes = { pg: PgEdge, default: PgEdge, smoothstep: PgEdge };

export interface DossieCanvasHandle {
	focar: (id: string) => void;
	/** Leva uma despesa do rail ao canvas e centraliza a câmera nela (depois do layout). */
	adicionarEvidencia: (id: string) => void;
	enquadrar: () => void;
}

interface DossieCanvasProps {
	nodes: DossieNode[];
	edges: DossieEdge[];
	direcao: Direcao;
	onDirecao: (d: Direcao) => void;
	onNodesChange: (c: NodeChange[]) => void;
	onEdgesChange: (c: EdgeChange[]) => void;
	setNodes: (n: DossieNode[]) => void;
	onSelecionar: (id: string | null) => void;
	onSoltarEvidencia: (id: string, pos?: { x: number; y: number }) => void;
	/** Há faixa de investigação no topo (afasta legenda/minimapa). */
	comFaixa: boolean;
	mobile: boolean;
	/** Enquadra automaticamente enquanto o dossiê cresce. */
	enquadrarAuto: boolean;
}

const corMiniMapa = (n: { type?: string; data?: Record<string, unknown> }) => {
	const r = riscoDoNo(n.type ?? "", n.data);
	if (r === "crit") return "#ff4d5e";
	return r === "warn" ? "#ffb224" : "#4f9b6c";
};

function Legenda() {
	return (
		<div className="pg-legend" aria-label="Legenda">
			<span>
				<i style={{ background: "var(--pg-pessoa)" }} />
				Pessoa
			</span>
			<span>
				<i style={{ background: "var(--pg-org)" }} />
				Organização
			</span>
			<span>
				<i style={{ background: "var(--pg-fin)" }} />
				Financeiro
			</span>
			<span>
				<i style={{ background: "var(--pg-doc)" }} />
				Documento
			</span>
			<span style={{ color: "var(--pg-warn)" }}>▲ Atenção</span>
			<span style={{ color: "var(--pg-crit)" }}>◆ Crítico</span>
		</div>
	);
}

interface ControlesProps {
	direcao: Direcao;
	onDirecao: (d: Direcao) => void;
	enquadrar: () => void;
	usuarioMexeu: MutableRefObject<boolean>;
	fixos: MutableRefObject<Set<string>>;
}

function Controles({ direcao, onDirecao, enquadrar, usuarioMexeu, fixos }: ControlesProps) {
	const { zoomIn, zoomOut } = useReactFlow();
	const alternar = () => {
		fixos.current.clear();
		usuarioMexeu.current = false;
		onDirecao(direcao === "LR" ? "TB" : "LR");
	};
	return (
		<div className="pg-ctrl">
			<button type="button" aria-label="Aproximar" onClick={() => zoomIn({ duration: 200 })}>
				<PixelIcon name="plus" size={16} />
			</button>
			<button type="button" aria-label="Afastar" onClick={() => zoomOut({ duration: 200 })}>
				<PixelIcon name="minus" size={16} />
			</button>
			<button
				type="button"
				aria-label="Enquadrar tudo"
				onClick={() => {
					usuarioMexeu.current = false;
					enquadrar();
				}}
			>
				<PixelIcon name="fit" size={16} />
			</button>
			<button
				type="button"
				aria-label="Alternar fluxo horizontal ou vertical"
				title="Fluxo horizontal / vertical"
				onClick={alternar}
			>
				<PixelIcon name="swap" size={16} />
			</button>
		</div>
	);
}

/**
 * Canvas do Dossiê (React Flow): nós em 3 densidades por zoom, arestas
 * ortogonais coloridas pelo risco do destino, layout Dagre LR/TB, minimapa,
 * legenda e soltar despesas do rail. Precisa de <ReactFlowProvider> acima.
 */
export const DossieCanvas = forwardRef<DossieCanvasHandle, DossieCanvasProps>(function DossieCanvas(
	{ nodes, edges, direcao, onDirecao, onNodesChange, onEdgesChange, setNodes, onSelecionar, onSoltarEvidencia, comFaixa, mobile, enquadrarAuto },
	ref,
) {
	const { setCenter, screenToFlowPosition } = useReactFlow();
	const fixos = useRef<Set<string>>(new Set());
	const usuarioMexeu = useRef(false);
	const { enquadrar } = useDossieLayout({ nodes, edges, direcao, setNodes, fixos, enquadrarAuto, usuarioMexeu, comFaixa });

	const nodesRef = useRef(nodes);
	nodesRef.current = nodes;
	const focoPendente = useRef<string | null>(null);

	const centrarNo = useCallback(
		(id: string) => {
			const n = nodesRef.current.find((x) => x.id === id);
			if (!n) return;
			usuarioMexeu.current = true;
			setCenter(n.position.x + 124, n.position.y + 80, { zoom: 0.9, duration: 300 });
		},
		[setCenter],
	);

	// Nó recém-adicionado: espera o layout posicioná-lo e então centraliza a câmera nele.
	useEffect(() => {
		const id = focoPendente.current;
		if (!id || !nodes.some((n) => n.id === id)) return;
		focoPendente.current = null;
		setTimeout(() => centrarNo(id), 400);
	}, [nodes, centrarNo]);

	useImperativeHandle(
		ref,
		() => ({
			enquadrar,
			focar: centrarNo,
			adicionarEvidencia: (id: string) => {
				focoPendente.current = id;
				onSoltarEvidencia(id);
			},
		}),
		[enquadrar, centrarNo, onSoltarEvidencia],
	);

	const aoSoltar = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			const id = e.dataTransfer.getData(MIME_EVIDENCIA);
			if (!id) return;
			const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
			fixos.current.add(id);
			onSoltarEvidencia(id, pos);
		},
		[screenToFlowPosition, onSoltarEvidencia],
	);

	const padrao = useMemo(() => ({ type: "pg" }), []);

	return (
		<div
			className={`pg-canvas${comFaixa ? " pg-canvas--rib" : ""}`}
			onDragOver={(e) => e.preventDefault()}
			onDrop={aoSoltar}
			data-testid="dossie-canvas"
		>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				defaultEdgeOptions={padrao}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onNodeClick={(_, n) => onSelecionar(n.id)}
				onPaneClick={() => onSelecionar(null)}
				onNodeDragStop={(_, n) => fixos.current.add(n.id)}
				onMoveStart={(ev) => {
					if (ev) usuarioMexeu.current = true;
				}}
				nodesConnectable={false}
				minZoom={0.2}
				maxZoom={1.4}
				onlyRenderVisibleElements
				colorMode="dark"
				proOptions={{ hideAttribution: true }}
			>
				<Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="#0e3320" />
				{mobile ? null : (
					<MiniMap
						pannable
						zoomable
						nodeColor={corMiniMapa}
						nodeStrokeWidth={0}
						maskColor="rgba(3,7,5,0.82)"
						ariaLabel="Minimapa"
					/>
				)}
			</ReactFlow>
			{mobile ? null : <Legenda />}
			<Controles direcao={direcao} onDirecao={onDirecao} enquadrar={enquadrar} usuarioMexeu={usuarioMexeu} fixos={fixos} />
			{mobile ? null : <div className="pg-hint">Arraste para mover · role para dar zoom</div>}
		</div>
	);
});
