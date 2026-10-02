"use client";

import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getSmoothStepPath,
} from "@xyflow/react";
import type { Risco } from "@/lib/investigacao/risco";

export type EstadoAresta = "hot" | "dim" | "";

export interface DadosAresta extends Record<string, unknown> {
	rel?: string;
	/** Risco do nó de destino: define cor/estilo da linha. */
	risco?: Risco;
	estado?: EstadoAresta;
}

export function classeAresta(risco: Risco, estado: EstadoAresta): string {
	return [
		"pg-e",
		risco !== "ok" ? `pg-e--${risco}` : "",
		estado === "hot" ? "pg-e--hot" : "",
		estado === "dim" ? "pg-e--dim" : "",
	]
		.filter(Boolean)
		.join(" ");
}

/** Mostra o rótulo só quando há risco ou a aresta está ligada ao nó selecionado. */
export function mostrarRotulo(risco: Risco, estado: EstadoAresta): boolean {
	return risco !== "ok" || estado === "hot";
}

/**
 * Aresta ortogonal com cantos arredondados. Cor/estilo vêm do RISCO do nó de
 * destino (normal · atenção tracejada · crítica tracejada animada).
 */
export default function PgEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	label,
	data,
}: EdgeProps) {
	const d = (data ?? {}) as DadosAresta;
	const risco = d.risco ?? "ok";
	const estado = d.estado ?? "";
	const [path, labelX, labelY] = getSmoothStepPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
		borderRadius: 14,
	});

	return (
		<>
			<BaseEdge id={id} path={path} className={classeAresta(risco, estado)} />
			{label && mostrarRotulo(risco, estado) ? (
				<EdgeLabelRenderer>
					<div
						className={`pg-elbl nodrag nopan ${risco !== "ok" ? `pg-elbl--${risco}` : ""} ${estado === "dim" ? "pg-elbl--dim" : ""}`}
						style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
					>
						{label}
					</div>
				</EdgeLabelRenderer>
			) : null}
		</>
	);
}
