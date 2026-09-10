"use client";

import { NodeShell } from "./NodeShell";

function extrairTaxaExecucao(data: any): number {
	return data?.percentualExecucao ?? data?._percentualExecucao ?? data?.taxaExecucao ?? 0;
}

function obterRotuloEmenda(data: any): string {
	const tipoLabel = data?.tipo ?? data?._riscoTipo?.label ?? "EMENDA_PARLAMENTAR";
	return `[${String(tipoLabel).toUpperCase().replace(/\s/g, "_")}]`;
}

function obterCoresEmenda(isFantasma: boolean, taxa: number) {
	if (isFantasma) {
		return {
			textColor: "text-red-400",
			barColor: "bg-red-500",
			taxaColor: "text-red-500"
		};
	}
	if (taxa < 30) {
		return {
			textColor: "text-teal-400",
			barColor: "bg-yellow-500",
			taxaColor: "text-yellow-500"
		};
	}
	return {
		textColor: "text-teal-400",
		barColor: "bg-teal-500",
		taxaColor: "text-teal-400"
	};
}

function formatarValorEmpenhado(data: any): string {
	const val = Number(data?._empenhado || data?.valor || 0);
	return val.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export const EmendaNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const taxa = extrairTaxaExecucao(data);
	const isFantasma = Boolean(data?.isFantasma ?? data?._isFantasma);
	const badgeText = obterRotuloEmenda(data);
	const { textColor, barColor, taxaColor } = obterCoresEmenda(isFantasma, taxa);
	const valorFormatado = formatarValorEmpenhado(data);

	return (
		<NodeShell type="EMENDA" data={data} isMobile={isMobile} badge={badgeText}>
			<div>
				<p className="text-xs text-teal-500 uppercase font-bold">
					Valor Empenhado
				</p>
				<p className={`text-sm font-bold mt-0.5 ${textColor}`}>
					R$ {valorFormatado}
				</p>
			</div>
			<div className="mt-2">
				<div className="flex justify-between items-center">
					<p className="text-xs text-teal-500 uppercase font-bold">
						Execução
					</p>
					<p className={`text-xs font-bold ${taxaColor}`}>
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
