"use client";

import { CalendarCheck } from "lucide-react";
import { NodeShell } from "./NodeShell";

export const AtividadeNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	return (
		<NodeShell type="ATIVIDADE_PARLAMENTAR" data={data} isMobile={isMobile}>
			<div className="relative">
				<p className="text-xs text-indigo-400/80 leading-relaxed mb-3">
					{data.motivo_ia || "Resumo de presenças e votações na legislatura atual."}
				</p>
				<div className="flex items-center gap-2 text-indigo-500 border border-indigo-800 bg-indigo-950/30 p-2 text-xs uppercase tracking-widest font-bold hover:bg-indigo-900/30 transition-colors">
					<CalendarCheck className="h-3.5 w-3.5" />
					Detalhes na Sidebar
				</div>
			</div>
		</NodeShell>
	);
};
