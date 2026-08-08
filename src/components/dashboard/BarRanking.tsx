"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type React from "react";
import { useMemo, useRef } from "react";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";
import { type DraftProfile, PoliticianHoverCard } from "./PoliticianHoverCard";

// ==========================================================================
// RASCUNHO (layout v2) — Ranking em barras horizontais proporcionais.
// O valor vira comprimento de barra (encoding pré-atentivo) em vez de
// apenas texto, quebrando o padrão "lista de nomes" do layout v1.
// Nomes com `profile` mantêm o hover card do político.
// ==========================================================================

export interface BarRankingItem {
	label: React.ReactNode;
	value: number;
	valueTotal?: number; // quando presente, exibe "value/valueTotal" (ex: "12/121 sessões")
	profile?: DraftProfile | null;
}

type BarRankingAccent = "green" | "amber" | "teal";

const ACCENTS: Record<
	BarRankingAccent,
	{
		bar: string;
		tip: string;
		value: string;
		label: string;
		rank: string;
		topRank: string;
	}
> = {
	green: {
		bar: "bg-green-500/20",
		tip: "bg-green-400",
		value: "text-green-400 font-mono",
		label: "text-amber-400 font-bold",
		rank: "text-green-800 font-mono",
		topRank: "text-green-400 font-mono",
	},
	amber: {
		bar: "bg-amber-500/20",
		tip: "bg-amber-400",
		value: "text-amber-400 font-mono",
		label: "text-amber-400 font-bold",
		rank: "text-amber-800 font-mono",
		topRank: "text-amber-400 font-mono",
	},
	teal: {
		bar: "bg-teal-500/20",
		tip: "bg-teal-400",
		value: "text-teal-400 font-mono",
		label: "text-amber-400 font-bold",
		rank: "text-teal-800 font-mono",
		topRank: "text-teal-400 font-mono",
	},
};

interface BarRankingProps {
	items?: BarRankingItem[];
	accent?: BarRankingAccent;
	limit?: number;
	valuePrefix?: string;
	valueSuffix?: string;
	isCurrency?: boolean;
	showFraction?: boolean; // se true, usa item.valueTotal para renderizar fração
}

export function BarRanking({
	items,
	accent = "green",
	limit = 10,
	valuePrefix,
	valueSuffix,
	isCurrency,
	showFraction,
}: BarRankingProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const styles = ACCENTS[accent];

	const rows = useMemo(() => {
		if (!items || items.length === 0)
			return { list: [] as BarRankingItem[], max: 0 };
		const list = items.slice(0, limit);
		const max = Math.max(...list.map((i) => Number(i.value) || 0), 0);
		return { list, max };
	}, [items, limit]);

	useGSAP(() => {
		if (!containerRef.current || rows.list.length === 0) return;
		gsap.fromTo(
			containerRef.current.querySelectorAll(".bar-rank-fill"),
			{ scaleX: 0 },
			{
				scaleX: 1,
				duration: 0.9,
				ease: "power3.out",
				stagger: 0.06,
				transformOrigin: "left center",
			},
		);
	}, [rows]);

	if (rows.list.length === 0) return null;

	return (
		<div ref={containerRef} className="flex flex-col gap-3">
			{rows.list.map((item, i) => {
				const itemMax = showFraction && item.valueTotal ? item.valueTotal : rows.max;
				const pct =
					itemMax > 0 ? Math.max((Number(item.value) / itemMax) * 100, 1.5) : 1.5;
				const isTop = i === 0;

				const nameEl = (
					<span className="truncate text-amber-400 font-bold">
						{item.label}
					</span>
				);

				return (
					<div key={i} className="flex flex-col gap-1">
						<div className="flex justify-between items-baseline text-sm gap-2">
							<div className="flex items-center gap-2 overflow-hidden mr-2">
								<span
									className={`w-6 shrink-0 text-xs font-bold tracking-wider ${isTop ? styles.topRank : styles.rank}`}
								>
									{String(i + 1).padStart(2, "0")}
								</span>
								{item.profile ? (
									<PoliticianHoverCard
										profile={item.profile}
										className="flex items-center gap-2 overflow-hidden cursor-crosshair hover:opacity-80 transition-opacity"
									>
										{nameEl}
									</PoliticianHoverCard>
								) : (
									nameEl
								)}
							</div>
							{/* Valor: fração "X/Y" ou valor simples */}
							{showFraction && item.valueTotal ? (
								<span
									className={`font-bold shrink-0 text-right text-xs md:text-sm ${styles.value} flex items-baseline gap-0.5`}
								>
									<AnimatedNumber value={item.value} isCurrency={isCurrency} />
									<span className="text-green-800 font-mono text-[10px]">/{item.valueTotal}</span>
									{valueSuffix && (
										<span className="text-green-700 font-mono text-[10px] ml-0.5">{valueSuffix}</span>
									)}
								</span>
							) : (
								<span
									className={`font-bold shrink-0 text-right text-xs md:text-sm ${styles.value}`}
								>
									<AnimatedNumber
										value={item.value}
										prefix={valuePrefix}
										suffix={valueSuffix}
										isCurrency={isCurrency}
									/>
								</span>
							)}
						</div>

						{/* Barra proporcional — cantos retos + ponta luminosa (tema pixel/terminal) */}
						<div className="h-1.5 w-full bg-black/60 border border-green-900/40 relative overflow-hidden">
							<div
								className={`bar-rank-fill absolute inset-y-0 left-0 ${styles.bar} ${isTop ? "shadow-[0_0_10px_rgba(34,197,94,0.35)]" : ""}`}
								style={{ width: `${pct}%` }}
							/>
							<div
								className={`bar-rank-fill absolute inset-y-0 w-0.75 ${styles.tip}`}
								style={{ left: `calc(${pct}% - 3px)` }}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
