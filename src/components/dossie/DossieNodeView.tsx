"use client";

import { Handle, type NodeProps, Position, useStore } from "@xyflow/react";
import { type CSSProperties, memo, useMemo } from "react";
import { construirCard } from "@/components/nodes/card-model";
import { densidadePorZoom, NodeCard } from "@/components/nodes/NodeCard";
import { tipoDoNo } from "@/components/nodes/node-types";
import { PessoaAvatar } from "@/components/nodes/PessoaAvatar";
import { useDossieUi } from "./dossie-ui";

type DadosNo = Record<string, any>;

const zoomSelector =(s: { transform: [number, number, number] }) => s.transform[2];

/** Nó do React Flow: um único componente para todos os tipos, com semantic zoom. */
function DossieNodeViewBase({ id, type, data: dadosBrutos, selected }: NodeProps) {
	const data = dadosBrutos as DadosNo;
	const zoom = useStore(zoomSelector);
	const { direcao, destacado, conexoes } = useDossieUi();
	const modelo = useMemo(() => construirCard(type, data), [type, data]);
	const lr = direcao === "LR";
	// O card da pessoa em carregamento sempre aparece completo
	const densidade = data?.isSearching && type === "PESSOA" ? "full" : densidadePorZoom(zoom);

	const portas = (
		<>
			<Handle type="target" position={lr ? Position.Left : Position.Top} isConnectable={false} />
			<Handle type="source" position={lr ? Position.Right : Position.Bottom} isConnectable={false} />
		</>
	);

	return (
		<div style={{ "--pg-z": zoom } as CSSProperties}>
			<NodeCard
				modelo={modelo}
				densidade={densidade}
				selecionado={selected}
				destacado={destacado === id}
				conexoes={conexoes.get(id) ?? 0}
				portas={portas}
				avatar={
					type === "PESSOA" ? (
						<PessoaAvatar urlFoto={data?.urlFoto} urlFotoFallback={data?.urlFotoFallback} nome={data?.label} />
					) : undefined
				}
				carregando={data?.isSearching ? { rotulo: tipoDoNo(type).carregando, status: data?.currentStatus } : null}
			/>
		</div>
	);
}

export const DossieNodeView = memo(DossieNodeViewBase);
