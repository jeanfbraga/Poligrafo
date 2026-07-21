"use client";

import { Handle, Position } from "@xyflow/react";
import { BarChart3, PieChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const RaioXGastosNode = ({ data }: { data: any }) => {
	return (
		<>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-indigo-500! rounded-none! w-3 h-3 border-none!"
			/>
			<Card
				className="w-64 bg-black border-indigo-500 rounded-none font-mono shadow-[0_0_24px_rgba(99,102,241,0.5)] relative cursor-pointer hover:shadow-[0_0_36px_rgba(99,102,241,0.8)] transition-shadow duration-300"
				onClick={(e) => {
					e.stopPropagation();
					data.onOpenDashboard?.(data.nomeVereador);
				}}
			>
				<div className="absolute inset-0 bg-linear-to-br from-indigo-950/40 to-black pointer-events-none rounded-none" />
				<CardHeader className="pb-2 space-y-0 relative">
					<Badge
						variant="outline"
						className="w-fit text-xs uppercase rounded-none border bg-indigo-950/60 text-indigo-400 border-indigo-600 mb-2"
					>
						COTA DE GABINETE
					</Badge>
					<div className="flex items-center gap-2">
						<BarChart3 className="h-5 w-5 text-indigo-400 shrink-0 animate-pulse" />
						<CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-300">
							Raio-X de Gastos
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-3 pb-3 relative">
					<p className="text-xs text-indigo-400/80 leading-relaxed">
						Acesse o dossiê analítico com a volumetria de despesas e o fluxo de
						gastos deste gabinete.
					</p>
					<div className="mt-3 flex items-center justify-center gap-2 text-indigo-500 border border-indigo-800 bg-indigo-950/30 p-2 hover:bg-indigo-900/30 transition-colors">
						<PieChart className="h-3.5 w-3.5" />
						<span className="text-xs uppercase tracking-widest font-bold">
							Ver detalhes
						</span>
					</div>
				</CardContent>
			</Card>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-indigo-500! rounded-none! w-3 h-3 border-none!"
			/>
		</>
	);
};
