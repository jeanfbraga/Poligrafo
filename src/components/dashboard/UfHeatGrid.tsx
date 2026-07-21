"use client";

import { useMemo, useState } from "react";
import { HybridTooltip } from "@/components/ui/hybrid-tooltip";
import { formatName } from "@/lib/utils";
import { BarRanking } from "./BarRanking";

// ==========================================================================
// RASCUNHO (layout v2) — Pixel map de calor das UFs.
// Substitui as ~27 listas repetidas do "Campeonato estadual" (v1):
// a agregação (soma do gasto da UF) vira COR e a posição no grid vira RANK;
// o detalhe por estado fica sob demanda no painel abaixo (com hover card).
// Nomes de políticos normalizados com formatName (Title Case).
// ==========================================================================

interface UfHeatGridProps {
	data?: Record<string, any[]>;
}

const fmtBRL = (v: number) =>
	v.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	});

// Escala de intensidade (5 steps) — do "offline" ao "crítico"
const LEVELS = [
	"bg-green-950/40 text-green-800 border-green-950",
	"bg-green-900/60 text-green-600 border-green-900",
	"bg-green-700/70 text-green-300 border-green-700",
	"bg-green-500 text-black border-green-400",
	"bg-green-400 text-black border-green-300 shadow-[0_0_12px_rgba(34,197,94,0.45)]",
];

export function UfHeatGrid({ data }: UfHeatGridProps) {
	const ufStats = useMemo(() => {
		if (!data) return [];
		return Object.entries(data)
			.map(([uf, deps]) => ({
				uf,
				total: deps.reduce(
					(acc: number, d: any) => acc + (Number(d.total_gasto) || 0),
					0,
				),
				deputados: deps,
			}))
			.sort((a, b) => b.total - a.total);
	}, [data]);

	const [selectedUf, setSelectedUf] = useState<string | null>(null);

	if (ufStats.length === 0) return null;

	const maxTotal = ufStats[0]?.total || 1;
	const selected = ufStats.find((u) => u.uf === selectedUf) ?? ufStats[0];

	const levelOf = (total: number) => {
		const r = total / maxTotal;
		if (r > 0.8) return 4;
		if (r > 0.6) return 3;
		if (r > 0.4) return 2;
		if (r > 0.2) return 1;
		return 0;
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Pixel map — posição = rank (maior gasto no canto superior esquerdo) */}
			<div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
				{ufStats.map((u, i) => {
					const isSelected = selected?.uf === u.uf;
					return (
						<HybridTooltip
							key={u.uf}
							content={`#${i + 1} ${u.uf} — ${fmtBRL(u.total)}`}
						>
							<button
								onClick={() => setSelectedUf(u.uf)}
								className={`relative h-9 w-full border font-bold text-[11px] tracking-widest transition-all duration-150 hover:scale-105 hover:z-10 ${LEVELS[levelOf(u.total)]} ${isSelected ? "outline-1 outline-green-300 outline-offset-1" : ""}`}
							>
								{isSelected && (
									<span className="absolute -top-1 -left-1 text-[8px]">▸</span>
								)}
								{u.uf}
							</button>
						</HybridTooltip>
					);
				})}
			</div>

			{/* Legenda */}
			<div className="flex items-center gap-1.5 text-[10px] text-green-800 uppercase tracking-widest">
				<span>Menor</span>
				{LEVELS.map((l, i) => (
					<span
						key={i}
						className={`inline-block h-2.5 w-2.5 border ${l.split(" ").slice(0, 2).join(" ")}`}
					/>
				))}
				<span>Maior gasto</span>
			</div>

			{/* Detalhe sob demanda da UF selecionada */}
			{selected && (
				<div className="border-t border-green-900/40 pt-3">
					<div className="flex items-baseline justify-between mb-3 gap-2">
						<p className="text-xs text-green-600 uppercase tracking-widest">
							&gt; {selected.uf} :: TOP GASTADORES
						</p>
						<p className="text-[11px] text-green-700 uppercase tracking-wider shrink-0">
							Σ {fmtBRL(selected.total)}
						</p>
					</div>
					<BarRanking
						accent="green"
						limit={5}
						isCurrency={true}
						valuePrefix="R$ "
						items={selected.deputados.map((item: any) => ({
							label: formatName(item.nome),
							value: item.total_gasto,
							profile:
								item.partido && item.partido !== "N/A"
									? {
											nome: formatName(item.nome),
											partido: item.partido,
											uf: item.uf,
											foto: item.foto,
											id: item.id_deputado,
											cargo: item.cargo,
										}
									: null,
						}))}
					/>
				</div>
			)}
		</div>
	);
}
