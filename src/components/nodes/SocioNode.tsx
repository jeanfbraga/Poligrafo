"use client";

import { Handle, Position } from "@xyflow/react";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const SocioNode = ({ data }: { data: any }) => {
	return (
		<>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-purple-500! rounded-none! w-3 h-3 border-none!"
			/>
			<Card
				className={`w-56 bg-black border-purple-500 rounded-none font-mono text-purple-400 transition-transform duration-500 origin-center ${data.metrics?.suspicious ? "ring-2 ring-red-500 border-red-500!" : ""}`}
				style={{
					transform: `scale(${1 + (data.metrics?.pagerank || 0) * 0.3})`,
					zIndex: data.metrics?.suspicious ? 10 : 1,
				}}
			>
				<CardHeader className="flex flex-col gap-1 pb-2 border-b border-purple-900">
					<div className="flex items-center gap-2">
						<Users className="h-3 w-3 shrink-0" />
						<CardTitle
							className="text-xs font-bold uppercase tracking-wider truncate"
							title={data.label}
						>
							{data.label}
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-2">
					<p className="text-xs uppercase font-bold text-purple-600">
						Cargo / Qualificação
					</p>
					<p className="text-xs opacity-80">{data.cargo}</p>
					{data.isSearching && (
						<div className="mt-4 pt-3 border-t border-purple-900/50">
							<p className="text-xs text-purple-500 mb-1 uppercase animate-pulse flex justify-between">
								<span>Busca Reversa...</span>
								<span>[■■■■]</span>
							</p>
							<div className="w-full h-1 bg-purple-950 overflow-hidden">
								<div
									className="h-full bg-purple-500 w-1/3 animate-[slide_1.5s_ease-in-out_infinite]"
									style={{ animationName: "slideRight" }}
								></div>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-purple-500! rounded-none! w-3 h-3 border-none!"
			/>
		</>
	);
};
