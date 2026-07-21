"use client";

import { useGSAP } from "@gsap/react";
import { Handle, Position } from "@xyflow/react";
import gsap from "gsap";
import { Briefcase, Share2 } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIProgressBar } from "./AIProgressBar";

export const EmpresaNode = ({ data }: { data: any }) => {
	const nodeRef = useRef<HTMLDivElement>(null);

	useGSAP(
		() => {
			gsap.from(nodeRef.current, {
				scale: 0,
				opacity: 0,
				duration: 0.5,
				ease: "back.out(1.7)",
			});
		},
		{ scope: nodeRef },
	);

	return (
		<div ref={nodeRef}>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-blue-500! rounded-none! w-3 h-3 border-none!"
			/>
			<Card
				className={`w-72 bg-black border-blue-500 rounded-none font-mono text-blue-400 relative transition-transform duration-500 origin-center ${data.metrics?.suspicious ? "ring-2 ring-red-500 border-red-500!" : ""}`}
				style={{
					transform: `scale(${1 + (data.metrics?.pagerank || 0) * 0.3})`,
					zIndex: data.metrics?.suspicious ? 10 : 1,
				}}
			>
				<CardHeader className="flex flex-col gap-2 pb-2 border-b border-blue-900 relative">
					<div className="flex justify-between items-start pr-8">
						<Badge
							variant="outline"
							className="w-fit bg-blue-950/30 text-blue-400 border-blue-500 rounded-none text-xs uppercase"
						>
							{data.tipo || "PESSOA JURÍDICA"}
						</Badge>
						{data.onShare && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									data.onShare(data, "EMPRESA");
								}}
								className="w-10 h-10 flex items-center justify-center absolute top-1 right-1 hover:bg-white/10 transition-colors z-10 rounded-full text-blue-400"
							>
								<Share2 className="h-4 w-4 opacity-70" />
							</button>
						)}
					</div>
					<div className="flex items-start gap-2">
						<Briefcase className="h-4 w-4 shrink-0 mt-1" />
						<CardTitle
							className="text-sm font-bold uppercase tracking-wider line-clamp-2"
							title={data.label}
						>
							{data.label}
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-3 space-y-2">
					{data.cnpj && (
						<div>
							<p className="text-xs uppercase font-bold text-blue-600">CNPJ</p>
							<p className="text-xs">{data.cnpj}</p>
						</div>
					)}
					{data.capitalSocial !== undefined && (
						<div>
							<p className="text-xs uppercase font-bold text-blue-600">
								Capital Social
							</p>
							<p className="text-xs">
								R$ {Number(data.capitalSocial).toLocaleString("pt-BR")}
							</p>
						</div>
					)}
					{data.cnae && (
						<div>
							<p className="text-xs uppercase font-bold text-blue-600">
								CNAE Principal
							</p>
							<p className="text-xs line-clamp-2 opacity-80">{data.cnae}</p>
						</div>
					)}
					{data.situacao && (
						<div>
							<p className="text-xs uppercase font-bold text-blue-600">
								Situação
							</p>
							<p className="text-xs opacity-80">{data.situacao}</p>
						</div>
					)}

					{data.motivo_ia &&
						!(
							data.label?.toUpperCase().includes("ELEICAO") ||
							data.label?.toUpperCase().includes("CAMPANHA") ||
							data.cnae?.toUpperCase().includes("CAMPANHA")
						) && (
							<AIProgressBar
								score={data.score_letalidade}
								motivo={data.motivo_ia}
							/>
						)}

					{data.isSearching && (
						<div className="mt-4 pt-3 border-t border-blue-900/50">
							<p className="text-xs text-blue-500 mb-1 uppercase animate-pulse flex justify-between">
								<span>Pivoteando Malha...</span>
								<span>[■■■■]</span>
							</p>
							<div className="w-full h-1 bg-blue-950 overflow-hidden">
								<div
									className="h-full bg-blue-500 w-1/3 animate-[slide_1.5s_ease-in-out_infinite]"
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
				className="bg-blue-500! rounded-none! w-3 h-3 border-none!"
			/>
		</div>
	);
};
