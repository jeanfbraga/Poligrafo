"use client";

import { useGSAP } from "@gsap/react";
import { Handle, Position } from "@xyflow/react";
import gsap from "gsap";
import { DollarSign, ShieldAlert, User } from "lucide-react";
import React, { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const PessoaNode = ({ data }: { data: any }) => {
	const isSearching = data.isSearching;
	const [progress, setProgress] = React.useState(0);
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

	React.useEffect(() => {
		if (!isSearching) return;
		const interval = setInterval(() => {
			setProgress((p) => (p + 1) % 11);
		}, 250);
		return () => clearInterval(interval);
	}, [isSearching]);

	return (
		<div ref={nodeRef}>
			<Handle
				type="target"
				position={Position.Top}
				className="bg-green-500! rounded-none! w-3 h-3 border-none!"
			/>
			<Card
				className={`w-72 bg-black border-green-500 rounded-none font-mono text-green-400 transition-all duration-700 ${isSearching ? "shadow-[0_0_15px_rgba(34,197,94,0.5)]" : ""}`}
			>
				<CardHeader className="flex flex-col items-start gap-2 pb-2 border-b border-green-500">
					<Badge
						variant="outline"
						className="bg-black text-green-400 border-green-500 rounded-none uppercase text-xs w-full justify-center text-center"
					>
						{data.cargo} - {data.uf}
					</Badge>
					<div className="flex items-center gap-2 w-full">
						{data.urlFoto ? (
							<img
								src={data.urlFoto}
								alt={data.label}
								className="h-8 w-8 object-cover rounded-sm border border-green-500 shrink-0"
							/>
						) : (
							<User
								className={`h-4 w-4 shrink-0 ${isSearching ? "text-green-500 animate-pulse" : "text-green-400"}`}
							/>
						)}
						<CardTitle
							className="text-sm font-bold uppercase tracking-wider truncate"
							title={data.label}
						>
							{data.label}
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-4 space-y-3">
					<div>
						<p className="text-xs uppercase font-bold text-green-500">
							Nome Civil
						</p>
						<p className="text-xs truncate">{data.nomeCivil}</p>
					</div>
					<div>
						<p className="text-xs uppercase font-bold text-green-500">
							{data.isCnpj ? "CNPJ DE CAMPANHA (TSE)" : "DOCUMENTO RAIZ (CPF)"}
						</p>
						<p className="text-xs mt-1">
							{data.documentoPrincipal || data.cpf ? (
								<span className="text-green-300 bg-green-500/20 px-1 py-0.5 rounded-sm">
									{data.isCnpj
										? String(data.documentoPrincipal || data.cpf).replace(
												/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
												"$1.$2.$3/$4-$5",
											)
										: String(data.documentoPrincipal || data.cpf).replace(
												/^(\d{3})(\d{3})(\d{3})(\d{2})/,
												"$1.$2.$3-$4",
											)}
								</span>
							) : (
								<span className="text-green-500/50 italic">
									{"> SIGILOSO / NÃO ENCONTRADO"}
								</span>
							)}
						</p>
					</div>
					{data.patrimonio !== undefined && (
						<div className="mt-2">
							<p className="text-xs uppercase font-bold text-green-500 flex items-center gap-1">
								<DollarSign className="w-3.5 h-3.5" /> PATRIMÔNIO DECLARADO
							</p>
							<p className="text-xs font-bold tracking-widest mt-1 text-yellow-500">
								{data.patrimonio > 0
									? `R$ ${data.patrimonio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
									: "NÃO ENCONTRADO"}
							</p>
						</div>
					)}

					{data.afastamento && (
						<div className="mt-4 p-3 border border-dashed border-yellow-600/50 bg-yellow-950/20 text-yellow-500 space-y-2">
							<div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider mb-1">
								<ShieldAlert className="w-3.5 h-3.5" />
								<span>ALERTA DE AFASTAMENTO</span>
							</div>
							<p className="text-xs leading-tight">
								&gt; {data.afastamento.motivo}
							</p>
							{data.afastamento.suplente && (
								<p className="text-xs leading-tight mt-1 border-t border-yellow-600/30 pt-1">
									<span className="font-bold opacity-70">
										SUPLENTE EM EXERCÍCIO:
									</span>{" "}
									{data.afastamento.suplente}
								</p>
							)}
						</div>
					)}

					{isSearching && (
						<div className="mt-4 pt-3 border-t border-green-900/50">
							<p className="text-[10px] text-green-500 mb-1 uppercase animate-pulse flex justify-between items-center gap-1">
								<span className="truncate">Processando Dossiê...</span>
								<span className="shrink-0">
									[{"■".repeat(progress)}
									{"-".repeat(10 - progress)}]
								</span>
							</p>
							<div className="w-full h-1 bg-green-950 overflow-hidden">
								<div
									className="h-full bg-green-500 w-1/3 animate-[slide_1.5s_ease-in-out_infinite]"
									style={{ animationName: "slideRight" }}
								></div>
							</div>
							{data.currentStatus && (
								<p className="text-[8.5px] text-green-400 mt-2 font-mono leading-tight border-l-2 border-green-500/30 pl-2">
									{">"} {data.currentStatus}
								</p>
							)}
							<style>{`
                                @keyframes slideRight {
                                    0% { transform: translateX(-100%); }
                                    100% { transform: translateX(300%); }
                                }
                             `}</style>
						</div>
					)}
				</CardContent>
			</Card>
			<Handle
				type="source"
				position={Position.Bottom}
				className="bg-green-500! rounded-none! w-3 h-3 border-none!"
			/>
		</div>
	);
};
