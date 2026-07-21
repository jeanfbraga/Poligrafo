"use client";

import { useMemo } from "react";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";

interface Props {
	data: { tipo_despesa: string; total_gasto: number }[];
}

export function CategoriasChart({ data }: Props) {
	// Process and sort data
	const chartData = useMemo(() => {
		if (!data || data.length === 0) return [];
		return data
			.slice(0, 5) // top 5
			.map((item) => ({
				name: item.tipo_despesa
					? item.tipo_despesa.charAt(0).toUpperCase() +
						item.tipo_despesa.slice(1).toLowerCase()
					: "Outros",
				total: Number(item.total_gasto) || 0,
			}))
			.sort((a, b) => b.total - a.total); // largest first
	}, [data]);

	const maxTotal = useMemo(() => {
		if (chartData.length === 0) return 1;
		return Math.max(...chartData.map((d) => d.total), 1);
	}, [chartData]);

	if (!data || data.length === 0) return null;

	return (
		<div className="w-full flex flex-col gap-3 py-1">
			{chartData.map((item, index) => {
				const pct = Math.max((item.total / maxTotal) * 100, 2);
				const isTop = index === 0;

				return (
					<div key={index} className="flex flex-col gap-1">
						{/* 1. Título acima */}
						<span className="text-xs md:text-sm font-bold text-amber-400 leading-snug truncate">
							{item.name}
						</span>

						{/* 2. Valor total abaixo do título */}
						<span className="text-xs md:text-sm font-mono font-bold text-green-400">
							<AnimatedNumber
								value={item.total}
								prefix="R$ "
								isCurrency={true}
							/>
						</span>

						{/* 3. Barra de progresso padronizada (cantos retos + ponta luminosa) */}
						<div className="h-1.5 w-full bg-black/60 border border-green-900/40 relative overflow-hidden">
							<div
								className={`bar-rank-fill absolute inset-y-0 left-0 bg-green-500/20 ${isTop ? "shadow-[0_0_10px_rgba(34,197,94,0.35)]" : ""}`}
								style={{ width: `${pct}%` }}
							/>
							<div
								className="bar-rank-fill absolute inset-y-0 w-0.75 bg-green-400"
								style={{ left: `calc(${pct}% - 3px)` }}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
