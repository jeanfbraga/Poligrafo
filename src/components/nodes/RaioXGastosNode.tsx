"use client";

import { PieChart } from "lucide-react";
import { NodeShell } from "./NodeShell";

export const RaioXGastosNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		data.onOpenDashboard?.(data.nomeVereador);
	};

	return (
		<NodeShell type="RESUMO_GASTOS" data={data} isMobile={isMobile} onClick={handleClick}>
			<div className="relative">
				<p className="text-xs text-indigo-400/80 leading-relaxed">
					Acesse o dossiê analítico com a volumetria de despesas e o fluxo de gastos deste gabinete.
				</p>
				<div className="mt-3 flex items-center justify-center gap-2 text-indigo-500 border border-indigo-800 bg-indigo-950/30 p-2 hover:bg-indigo-900/30 transition-colors">
					<PieChart className="h-3.5 w-3.5" />
					<span className="text-xs uppercase tracking-widest font-bold">
						Ver detalhes
					</span>
				</div>
			</div>
		</NodeShell>
	);
};
