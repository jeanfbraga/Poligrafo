"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, useState } from "react";
import type { AccentTokens } from "./node-theme";

/**
 * Barra de loading temática unificada para nodes (desktop) e cards (mobile).
 * Animada com GSAP.
 */
export const NodeLoadingBar = ({
	label = "Processando...",
	colors,
	currentStatus,
	className = "",
}: {
	label?: string;
	colors: AccentTokens;
	currentStatus?: string;
	className?: string;
}) => {
	const [progress, setProgress] = useState(0);
	const barRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useGSAP(
		() => {
			// Animação da barra sólida
			gsap.fromTo(
				barRef.current,
				{ xPercent: -100 },
				{
					xPercent: 300,
					duration: 1.5,
					ease: "power1.inOut",
					repeat: -1,
				},
			);

			// Animação dos blocos de texto [■■■...]
			const obj = { p: 0 };
			gsap.to(obj, {
				p: 10,
				duration: 2.5,
				ease: "none",
				repeat: -1,
				onUpdate: () => {
					setProgress(Math.floor(obj.p));
				},
			});
		},
		{ scope: containerRef },
	);

	return (
		<div
			ref={containerRef}
			className={`mt-4 pt-3 border-t ${colors.borderSoft} font-mono ${className}`}
		>
			<div
				className={`flex justify-between text-xs ${colors.label} mb-1.5 uppercase font-bold tracking-wider items-center gap-1`}
			>
				<span className="truncate animate-pulse">{label}</span>
				<span className="shrink-0 font-bold">
					[{"■".repeat(progress)}
					{"-".repeat(10 - progress)}]
				</span>
			</div>
			<div className={`w-full h-1.5 ${colors.track} overflow-hidden relative`}>
				<div
					ref={barRef}
					className={`h-full ${colors.bar} w-1/3`}
				/>
			</div>
			{currentStatus && (
				<p
					className={`text-[10px] ${colors.text} mt-2 leading-tight border-l-2 ${colors.borderSoft} pl-2`}
				>
					&gt; {currentStatus}
				</p>
			)}
		</div>
	);
};
