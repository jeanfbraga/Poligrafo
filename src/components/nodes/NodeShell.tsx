"use client";

import { useGSAP } from "@gsap/react";
import { Handle, Position } from "@xyflow/react";
import gsap from "gsap";
import { Share2, ShieldAlert } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NodeLoadingBar } from "./NodeLoadingBar";
import { getVisual } from "./node-theme";

/**
 * NodeShell — chrome base compartilhado por todos os nodes do canvas.
 *
 * Padroniza: largura (w-72), badge [TIPO], chip de score, ícone de alerta,
 * botão de share, cores de handle, animação de entrada, scale por pagerank,
 * ring de suspeito e barra de loading.
 *
 * Toques experimentais: linha de acento no topo com glow e corner brackets
 * (enquadramento de "mira" nos 4 cantos).
 */
export const NodeShell = ({
	type,
	data,
	badge,
	title,
	titleIcon,
	width = "w-72",
	children,
	footer,
	onClick,
	loadingLabel,
	currentStatus,
	isMobile = false,
}: {
	type: string;
	data: any;
	/** Sobrescreve o typeLabel do tema (ex.: tipo dinâmico de emenda) */
	badge?: ReactNode;
	/** Sobrescreve data.label como título */
	title?: ReactNode;
	/** Substitui o ícone do tema na linha do título (ex.: foto do político) */
	titleIcon?: ReactNode;
	width?: string;
	children?: ReactNode;
	/** Slot de ações no rodapé do conteúdo (CTAs, botões) */
	footer?: ReactNode;
	onClick?: (e: React.MouseEvent) => void;
	loadingLabel?: string;
	currentStatus?: string;
	isMobile?: boolean;
}) => {
	const nodeRef = useRef<HTMLDivElement>(null);
	const { theme, risk, colors } = getVisual(type, data);
	const Icon = theme.icon;
	const suspicious = data.metrics?.suspicious;
	const scale = 1 + (data.metrics?.pagerank || 0) * 0.3;
	const score = data.score_letalidade ?? data.score;
	const hasAlert =
		risk === "ATENCAO" || risk === "CRITICO" || risk === "FANTASMA";
	const showGlow =
		risk !== "NORMAL" || theme.alwaysGlow || data.isSearching;
	const isInteractive = !!onClick || [
		"PESSOA",
		"DESPESA",
		"CONTRATO",
		"EMENDA",
		"EMENDA_RESUMO",
		"EMPRESA",
		"SOCIO",
		"RESUMO_GASTOS",
	].includes(type);

	useGSAP(
		() => {
			if (!isMobile && nodeRef.current) {
				gsap.from(nodeRef.current, {
					scale: 0.9,
					opacity: 0,
					duration: 0.5,
					ease: "back.out(1.7)",
				});
			}
		},
		{ scope: nodeRef, dependencies: [isMobile] },
	);

	if (isMobile) {
		return (
			<div className={`w-full border ${colors.border} bg-black p-4 flex flex-col justify-between active:scale-[0.97] transition-transform duration-200 uppercase font-mono min-h-[42vh] max-h-[52vh] ${isInteractive ? "cursor-pointer" : ""}`} onClick={data.mobileOnClick || onClick}>
				<div>
					<div className="flex justify-between items-center mb-3 gap-2">
						<Badge variant={colors.badgeVariant as any} className="rounded-none text-[10px] sm:text-xs uppercase font-bold border-inherit bg-transparent truncate max-w-[55%]">
							{badge ?? theme.typeLabel}
						</Badge>
						<div className="flex items-center gap-2 shrink-0">
							{score !== undefined && score !== null && score > 0 && (
								<span className={`text-[10px] font-bold tracking-widest opacity-80 ${colors.text}`}>
									SCORE {Number(score)}
								</span>
							)}
							{data.onShare && theme.canShare && (
								<button onClick={(e) => { e.stopPropagation(); data.onShare(data, type); }} className={`p-1.5 flex items-center justify-center shrink-0 ${colors.text} opacity-70 hover:opacity-100 transition-opacity`} title="Compartilhar">
									<Share2 className="w-4 h-4" />
								</button>
							)}
						</div>
					</div>
					<div className="flex items-start gap-2 mb-2">
						{titleIcon ?? <Icon className={`w-5 h-5 mt-0.5 ${colors.text} shrink-0`} />}
						<h3 className={`text-base font-bold leading-tight line-clamp-3 ${colors.text}`}>{title ?? data.label ?? "Sem título"}</h3>
					</div>
					{children}
				</div>
				<div className="mt-auto pt-3 border-t border-inherit/30 flex flex-col gap-2">
					{data.mobileFooter || footer}
					{isInteractive && (
						<span className={`text-xs font-bold opacity-50 ${colors.text} text-center w-full block mt-1`}>[ TOCAR PARA DETALHES ]</span>
					)}
				</div>
			</div>
		);
	}

	const corner = `absolute w-2 h-2 ${colors.border} opacity-50 pointer-events-none z-10`;

	return (
		<div ref={nodeRef}>
			<Handle
				type="target"
				position={Position.Top}
				className={`${colors.handle} rounded-none! w-3 h-3 border-none!`}
			/>
			<Card
				onClick={onClick}
				className={`${width} bg-black ${colors.border} rounded-none font-mono ${colors.text} relative transition-transform duration-500 origin-center ${showGlow ? colors.glow : ""} ${suspicious ? "ring-2 ring-red-500 border-red-500!" : ""} ${isInteractive ? "cursor-pointer" : ""}`}
				style={{
					transform: `scale(${scale})`,
					zIndex: suspicious ? 10 : 1,
				}}
			>
				{/* Linha de acento no topo */}
				<span
					className={`absolute top-0 left-0 right-0 h-0.5 ${colors.bar} opacity-70 pointer-events-none`}
				/>
				{/* Corner brackets */}
				<span className={`${corner} top-0 left-0 border-t border-l`} />
				<span className={`${corner} top-0 right-0 border-t border-r`} />
				<span className={`${corner} bottom-0 left-0 border-b border-l`} />
				<span className={`${corner} bottom-0 right-0 border-b border-r`} />

				<CardHeader
					className={`flex flex-col gap-2 pb-2 space-y-0 border-b ${suspicious ? "border-red-900/50" : colors.borderSoft}`}
				>
					<div className="flex items-center justify-between gap-2">
						<Badge
							variant="outline"
							className={`w-fit ${colors.badge} rounded-none text-xs uppercase`}
						>
							{badge ?? theme.typeLabel}
						</Badge>
						<div className="flex items-center gap-2 shrink-0">
							{score !== undefined && score !== null && (
								<span
									className={`text-[10px] font-bold tracking-widest opacity-80 ${colors.text}`}
								>
									SCORE {Number(score)}
								</span>
							)}
							{hasAlert && (
								<ShieldAlert
									className={`h-4 w-4 shrink-0 animate-pulse ${risk === "ATENCAO" ? "text-yellow-500" : "text-red-500"}`}
								/>
							)}
							{data.onShare && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										data.onShare(data, type);
									}}
									className={`p-1 flex items-center justify-center ${colors.text} hover:opacity-100 opacity-70 transition-opacity rounded-none shrink-0`}
									title="Compartilhar"
								>
									<Share2 className="h-4 w-4 shrink-0" />
								</button>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						{titleIcon ?? (
							<Icon className={`h-5 w-5 shrink-0 ${colors.text}`} />
						)}
						<CardTitle
							className={`text-sm font-bold uppercase tracking-wider line-clamp-2 ${colors.text}`}
							title={data.label}
						>
							{title ?? data.label}
						</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-3 space-y-2">
					{children}
					{footer}
					{data.isSearching && (
						<NodeLoadingBar
							label={loadingLabel ?? theme.loadingLabel}
							colors={colors}
							currentStatus={currentStatus ?? data.currentStatus}
						/>
					)}
				</CardContent>
			</Card>
			<Handle
				type="source"
				position={Position.Bottom}
				className={`${colors.handle} rounded-none! w-3 h-3 border-none!`}
			/>
		</div>
	);
};
