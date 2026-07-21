"use client";

import { useGSAP } from "@gsap/react";
import { Handle, Position } from "@xyflow/react";
import gsap from "gsap";
import { DollarSign, Share2, ShieldAlert } from "lucide-react";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AIProgressBar } from "./AIProgressBar";

export const DespesaNode = ({ data }: { data: any }) => {
	const nodeRef = useRef<HTMLDivElement>(null);

	useGSAP(
		() => {
			gsap.from(nodeRef.current, {
				scale: 0.8,
				opacity: 0,
				duration: 0.5,
				ease: "power2.out",
			});
		},
		{ scope: nodeRef },
	);

	const score = data.score_letalidade || 50;
	const isLetal = score >= 85;
	const isSuspeito = score >= 60;

	let cardClasses =
		"w-72 bg-black border-slate-700 rounded-none font-mono text-slate-400";
	let badgeClasses =
		"w-fit bg-slate-800/30 text-slate-400 border-slate-700 rounded-none text-xs uppercase";
	let titleClasses =
		"text-sm font-bold uppercase tracking-wider line-clamp-2 text-slate-400";
	let _handleColor = "bg-red-500!";
	let iconColor = "text-slate-400";
	let shadowStyle = {};

	if (isLetal) {
		cardClasses = "w-72 bg-black border-red-500 rounded-none font-mono";
		shadowStyle = { boxShadow: "0 0 15px rgba(239,68,68,0.5)" };
		badgeClasses =
			"w-fit bg-red-900 text-white border-red-500 rounded-none text-xs uppercase";
		titleClasses =
			"text-sm font-bold uppercase tracking-wider line-clamp-2 text-red-500";
		_handleColor = "bg-red-500!";
		iconColor = "text-red-500";
	} else if (isSuspeito) {
		cardClasses = "w-72 bg-black border-yellow-600 rounded-none font-mono";
		badgeClasses =
			"w-fit bg-yellow-950/30 text-yellow-600 border-yellow-600 rounded-none text-xs uppercase";
		titleClasses =
			"text-sm font-bold uppercase tracking-wider line-clamp-2 text-yellow-600";
		_handleColor = "bg-red-500!";
		iconColor = "text-yellow-600";
	}
	cardClasses += " transition-transform duration-500 origin-center";
	if (data.metrics?.suspicious) {
		cardClasses += " ring-2 ring-red-500 border-red-500!";
		shadowStyle = { ...shadowStyle, zIndex: 10 };
	}
	const scaleStyle = {
		transform: `scale(${1 + (data.metrics?.pagerank || 0) * 0.3})`,
	};

	return (
		<div ref={nodeRef}>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-red-500! rounded-none! w-3 h-3 border-none!"
			/>
			<Card className={cardClasses} style={{ ...shadowStyle, ...scaleStyle }}>
				<CardHeader className="flex flex-col gap-2 pb-2 space-y-0 border-b border-inherit relative">
					<div className="flex justify-between items-start pr-8">
						<Badge variant="outline" className={badgeClasses}>
							SCORE {score}/100
						</Badge>
						{isLetal && (
							<ShieldAlert className="h-4 w-4 text-red-500 animate-pulse mt-0.5" />
						)}
						{data.onShare && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									data.onShare(data, "DESPESA");
								}}
								className="w-10 h-10 flex items-center justify-center absolute top-1 right-1 hover:bg-white/10 transition-colors z-10 rounded-full"
							>
								<Share2 className="h-4 w-4 opacity-70" />
							</button>
						)}
					</div>
					<div className="flex items-start gap-2 pt-1">
						<DollarSign className={`h-4 w-4 shrink-0 mt-1 ${iconColor}`} />
						<CardTitle className={titleClasses} title={data.label}>
							{data.label}
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-3 space-y-2">
					<div>
						<p
							className={`text-lg font-bold truncate ${isLetal ? "text-red-500" : isSuspeito ? "text-yellow-500" : "text-slate-400"}`}
						>
							R${" "}
							{Number(data.valor).toLocaleString("pt-BR", {
								minimumFractionDigits: 2,
							})}
						</p>
						<p
							className={`text-xs mt-2 uppercase truncate ${isLetal ? "text-red-400/80" : isSuspeito ? "text-yellow-400/80" : "text-slate-400/80"}`}
							title={data.tipo || data.descricao}
						>
							{data.tipo || data.descricao}
						</p>
						{data.nomeFornecedor && (
							<p
								className="text-xs mt-1 uppercase font-bold text-slate-300 line-clamp-2"
								title={data.nomeFornecedor}
							>
								{data.nomeFornecedor}
							</p>
						)}
						<p
							className={`text-[10px] mt-1 uppercase tracking-wider ${isLetal ? "text-red-400/60" : isSuspeito ? "text-yellow-400/60" : "text-slate-400/60"}`}
						>
							{data.dataDocumento
								? String(data.dataDocumento).includes("/")
									? data.dataDocumento
									: new Date(data.dataDocumento)
											.toLocaleDateString("pt-BR", { timeZone: "UTC" })
											.replace("Invalid Date", data.dataDocumento)
								: "DATA INDISPONÍVEL"}
						</p>
					</div>

					{data.motivo_ia && (
						<AIProgressBar
							score={data.score_letalidade}
							motivo={data.motivo_ia}
						/>
					)}

					{data.isSearching && (
						<div
							className={`mt-4 pt-3 border-t ${isLetal ? "border-red-900/50" : isSuspeito ? "border-yellow-900/50" : "border-slate-800"}`}
						>
							<p
								className={`text-xs mb-1 uppercase animate-pulse flex justify-between ${isLetal ? "text-red-500" : isSuspeito ? "text-yellow-500" : "text-slate-500"}`}
							>
								<span>Pivoteando...</span>
								<span>[■■■■]</span>
							</p>
							<div
								className={`w-full h-1 overflow-hidden ${isLetal ? "bg-red-950" : isSuspeito ? "bg-yellow-950" : "bg-slate-900"}`}
							>
								<div
									className={`h-full w-1/3 animate-[slide_1.5s_ease-in-out_infinite] ${isLetal ? "bg-red-500" : isSuspeito ? "bg-yellow-500" : "bg-slate-500"}`}
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
				className="bg-red-500! rounded-none! w-3 h-3 border-none!"
			/>
		</div>
	);
};
