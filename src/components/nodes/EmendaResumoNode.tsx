"use client";

import { Handle, Position } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const EmendaResumoNode = ({ data }: { data: any }) => {
	const pct = data.percentualExecucao ?? 0;
	const temAlertas = data.alertas && data.alertas.length > 0;
	const isExpanded = !!data.isExpanded;
	return (
		<>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-teal-600! rounded-none! w-3 h-3 border-none!"
			/>
			<Card
				className={`w-80 bg-black rounded-none font-mono ${temAlertas ? "border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.3)]" : "border-teal-600"}`}
			>
				<CardHeader
					className={`flex flex-col gap-1 pb-2 border-b ${temAlertas ? "border-orange-500" : "border-teal-600"}`}
				>
					<Badge
						variant="outline"
						className="w-fit text-xs uppercase rounded-none bg-teal-950/30 text-teal-300 border-teal-600"
					>
						[RESUMO_EMENDAS_PARLAMENTARES]
					</Badge>
					<div className="flex items-center justify-between gap-2">
						<CardTitle className="text-sm font-bold uppercase tracking-wider text-teal-300">
							{data.totalEmendas || 0} Emendas · R${" "}
							{Number(data.totalEmpenhado || 0).toLocaleString("pt-BR", {
								notation: "compact",
								maximumFractionDigits: 1,
							})}
						</CardTitle>
						{temAlertas && (
							<AlertTriangle className="h-4 w-4 text-orange-400 shrink-0 animate-pulse" />
						)}
					</div>
				</CardHeader>
				<CardContent className="pt-3 space-y-2">
					<div>
						<div className="flex justify-between">
							<span className="text-xs text-teal-500 uppercase">
								Execução Global
							</span>
							<span
								className={`text-xs font-bold ${pct < 30 ? "text-yellow-500" : "text-teal-400"}`}
							>
								{pct}%
							</span>
						</div>
						<div className="w-full h-1.5 bg-teal-950 mt-0.5">
							<div
								className={`h-full ${pct < 30 ? "bg-yellow-500" : "bg-teal-500"}`}
								style={{ width: `${Math.min(pct, 100)}%` }}
							/>
						</div>
					</div>
					{temAlertas && (
						<div className="pt-1 space-y-0.5">
							{data.alertas.slice(0, 2).map((a: string, i: number) => (
								<p key={i} className="text-xs text-orange-400 leading-tight">
									▶ {a}
								</p>
							))}
						</div>
					)}
					<div className="pt-2 text-center border-t border-dashed border-teal-900/50 text-[10px] text-teal-400 font-bold uppercase">
						{isExpanded
							? "[ EMENDAS EXIBIDAS NO CANVAS ]"
							: "[ DETALHES NA SIDEBAR ]"}
					</div>
				</CardContent>
			</Card>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-teal-600! rounded-none! w-3 h-3 border-none!"
			/>
		</>
	);
};
