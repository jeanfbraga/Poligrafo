"use client";

import { Handle, Position } from "@xyflow/react";
import { Scale, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIProgressBar } from "./AIProgressBar";

export const ProcessoJudicialNode = ({ data }: { data: any }) => {
	return (
		<>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-red-500! rounded-none! w-3 h-3 border-none!"
			/>
			<Card
				className={`w-72 bg-black border-red-600 rounded-none font-mono shadow-[0_0_20px_rgba(239,68,68,0.4)] relative transition-transform duration-500 origin-center ${data.metrics?.suspicious ? "ring-2 ring-red-500 border-red-500!" : ""}`}
				style={{
					transform: `scale(${1 + (data.metrics?.pagerank || 0) * 0.3})`,
					zIndex: data.metrics?.suspicious ? 10 : 1,
				}}
			>
				<CardHeader className="flex flex-col gap-2 pb-2 space-y-0 border-b border-red-900 relative">
					<div className="flex justify-between items-start pr-8">
						<Badge
							variant="outline"
							className="w-fit bg-red-950/40 text-red-500 border-red-500 rounded-none text-xs uppercase font-bold tracking-widest"
						>
							{data.tribunal === "Cadastro de Inidôneos/Sancionados (CGU)"
								? "[SANÇÃO_TCU_CGU]"
								: "[PROCESSO_JUDICIAL]"}
						</Badge>
						{data.onShare && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									data.onShare(data, "PROCESSO_JUDICIAL");
								}}
								className="w-10 h-10 flex items-center justify-center absolute top-1 right-1 hover:bg-white/10 transition-colors z-10 rounded-full text-red-500"
							>
								<Share2 className="h-4 w-4 opacity-70" />
							</button>
						)}
					</div>
					<div className="flex items-start gap-2 pt-1">
						<Scale className="h-4 w-4 text-red-500 shrink-0 mt-1" />
						<CardTitle
							className="text-sm font-bold uppercase tracking-wider line-clamp-2 text-red-500"
							title={data.label}
						>
							{data.label}
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-4 space-y-2">
					<div>
						<p className="text-xs text-red-500 uppercase font-bold">
							Instância / Órgão
						</p>
						<p className="text-xs mt-1 text-red-400 line-clamp-2 leading-tight">
							&gt; {data.tribunal}
						</p>
					</div>
					<div>
						<p className="text-xs text-red-500 uppercase font-bold">
							Assunto Originário
						</p>
						<p className="text-xs font-bold mt-1 text-red-400 opacity-90 line-clamp-2">
							{data.assunto}
						</p>
					</div>
					{data.dataAjuizamento && (
						<div>
							<p className="text-xs text-red-500/80 mt-1">
								AJUIZAMENTO:{" "}
								{new Date(data.dataAjuizamento)
									.toLocaleDateString("pt-BR", { timeZone: "UTC" })
									.replace("Invalid Date", data.dataAjuizamento)}
							</p>
						</div>
					)}

					{data.motivo_ia && (
						<AIProgressBar
							score={data.score_letalidade || 95}
							motivo={data.motivo_ia}
						/>
					)}
				</CardContent>
			</Card>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-red-500! rounded-none! w-3 h-3 border-none!"
			/>
		</>
	);
};
