"use client";

import { NodeShell } from "./NodeShell";

export const EmendaResumoNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const pct = data.percentualExecucao ?? 0;
	const temAlertas = data.alertas && data.alertas.length > 0;
	const isExpanded = !!data.isExpanded;
	
	const titleText = `${data.totalEmendas || 0} Emendas · R$ ${Number(data.totalEmpenhado || 0).toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })}`;
	const badgeText = "[RESUMO_EMENDAS_PARLAMENTARES]";
	
	// Passar hasAlert falso porque a gente já exibe a lista, ou deixamos o NodeShell ler. No NodeShell: hasAlert = risk !== NORMAL.

	return (
		<NodeShell type="EMENDA_RESUMO" data={data} isMobile={isMobile} title={titleText} badge={badgeText}>
			<div>
				<div className="flex justify-between">
					<span className="text-xs text-teal-500 uppercase">
						Execução Global
					</span>
					<span className={`text-xs font-bold ${pct < 30 ? "text-yellow-500" : "text-teal-400"}`}>
						{pct}%
					</span>
				</div>
				<div className="w-full h-1.5 bg-teal-950 mt-0.5">
					<div className={`h-full ${pct < 30 ? "bg-yellow-500" : "bg-teal-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
				</div>
			</div>
			{temAlertas && (
				<div className="pt-1 space-y-0.5 mt-2">
					{data.alertas.slice(0, 2).map((a: string, i: number) => (
						<p key={i} className="text-xs text-orange-400 leading-tight">
							▶ {a}
						</p>
					))}
				</div>
			)}
			<div className="pt-2 mt-2 text-center border-t border-dashed border-teal-900/50 text-[10px] text-teal-400 font-bold uppercase">
				{isExpanded ? "[ EMENDAS EXIBIDAS NO CANVAS ]" : "[ DETALHES NA SIDEBAR ]"}
			</div>
		</NodeShell>
	);
};
