"use client";

import { NodeShell } from "./NodeShell";

export const EmendaNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const taxa = data.percentualExecucao ?? data._percentualExecucao ?? data.taxaExecucao ?? 0;
	const isFantasma = data.isFantasma ?? data._isFantasma;
	const tipoLabel = data.tipo ?? data._riscoTipo?.label ?? "EMENDA_PARLAMENTAR";
	
	const badgeText = `[${tipoLabel.toUpperCase().replace(/\s/g, "_")}]`;

	const textColor = isFantasma ? "text-red-400" : "text-teal-400";
	const barColor = isFantasma ? "bg-red-500" : taxa < 30 ? "bg-yellow-500" : "bg-teal-500";

	return (
		<NodeShell type="EMENDA" data={data} isMobile={isMobile} badge={badgeText}>
			<div>
				<p className="text-xs text-teal-500 uppercase font-bold">
					Valor Empenhado
				</p>
				<p className={`text-sm font-bold mt-0.5 ${textColor}`}>
					R${" "}
					{Number(data._empenhado || data.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
				</p>
			</div>
			<div className="mt-2">
				<div className="flex justify-between items-center">
					<p className="text-xs text-teal-500 uppercase font-bold">
						Execução
					</p>
					<p className={`text-xs font-bold ${isFantasma ? "text-red-500" : taxa < 30 ? "text-yellow-500" : "text-teal-400"}`}>
						{taxa}%
					</p>
				</div>
				<div className="w-full h-1.5 bg-teal-950 mt-0.5 overflow-hidden">
					<div className={`h-full transition-all ${barColor}`} style={{ width: `${Math.min(taxa, 100)}%` }} />
				</div>
				{isFantasma && (
					<p className="text-xs text-red-500 mt-1 uppercase font-bold animate-pulse">
						⚠ FANTASMA: {taxa}% EXECUTADO
					</p>
				)}
			</div>
		</NodeShell>
	);
};
