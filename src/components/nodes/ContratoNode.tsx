"use client";

import { AIProgressBar } from "./AIProgressBar";
import { NodeShell } from "./NodeShell";

export const ContratoNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const isEmenda = data.label?.startsWith("EMENDA");

	return (
		<NodeShell type="CONTRATO" data={data} isMobile={isMobile} badge={isEmenda ? "[EMENDA_PARLAMENTAR]" : "[CONTRATO_FEDERAL]"}>
			<div>
				<p className="text-xs text-yellow-500 uppercase font-bold">
					Objeto / Destinação
				</p>
				<p className="text-xs mt-1 text-yellow-400 line-clamp-3" title={data.objeto}>
					&gt; {data.objeto || "N/A"}
				</p>
			</div>
			<div className="mt-2">
				<p className="text-xs text-yellow-500 uppercase font-bold">Valor</p>
				<p className="text-sm font-bold mt-1 text-yellow-400">
					R${" "}
					{Number(data.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
				</p>
			</div>

			{data.motivo_ia && data.codigo !== "TSE-BENS" && (
				<AIProgressBar isMobile={isMobile} score={data.score_letalidade} motivo={data.motivo_ia} />
			)}
		</NodeShell>
	);
};
