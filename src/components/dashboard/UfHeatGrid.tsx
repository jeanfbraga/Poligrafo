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
//
// v2.1: Top 3 sai do grid e vira PÓDIO pixel (1º com troféu pixelado);
// escala de calor com mais contraste (transformação sqrt nos thresholds);
// hover exibe o nome completo do estado (sigla permanece no quadradinho).
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

// Abreviação em milhões para o pódio (valor completo fica no hover)
const fmtMi = (v: number) =>
	`${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;

const UF_NOMES: Record<string, string> = {
	AC: "Acre",
	AL: "Alagoas",
	AP: "Amapá",
	AM: "Amazonas",
	BA: "Bahia",
	CE: "Ceará",
	DF: "Distrito Federal",
	ES: "Espírito Santo",
	GO: "Goiás",
	MA: "Maranhão",
	MT: "Mato Grosso",
	MS: "Mato Grosso do Sul",
	MG: "Minas Gerais",
	PA: "Pará",
	PB: "Paraíba",
	PR: "Paraná",
	PE: "Pernambuco",
	PI: "Piauí",
	RJ: "Rio de Janeiro",
	RN: "Rio Grande do Norte",
	RS: "Rio Grande do Sul",
	RO: "Rondônia",
	RR: "Roraima",
	SC: "Santa Catarina",
	SP: "São Paulo",
	SE: "Sergipe",
	TO: "Tocantins",
};

// Escala de intensidade (5 steps) — contraste alto: do quase apagado ao neon
const LEVELS = [
	"bg-green-950/20 text-green-900 border-green-950/60",
	"bg-green-900/50 text-green-600 border-green-900",
	"bg-green-700/80 text-green-100 border-green-600",
	"bg-green-500 text-black border-green-400",
	"bg-green-300 text-black border-green-200 shadow-[0_0_14px_rgba(74,222,128,0.5)]",
];

// Troféu pixelado 16x16 — cada entrada é [x, y, largura] de uma linha de pixels
const TROPHY_PIXELS: [number, number, number][] = [
	[4, 2, 8], // borda da taça
	[2, 3, 2], // alça esquerda
	[4, 3, 8],
	[12, 3, 2], // alça direita
	[2, 4, 2],
	[4, 4, 8],
	[12, 4, 2],
	[3, 5, 1],
	[4, 5, 8],
	[12, 5, 1],
	[4, 6, 8],
	[5, 7, 6],
	[5, 8, 6],
	[6, 9, 4],
	[7, 10, 2], // haste
	[7, 11, 2],
	[6, 12, 4], // base
	[5, 13, 6],
	[4, 14, 8],
];

function PixelTrophy({ className = "" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 16 16"
			shapeRendering="crispEdges"
			fill="currentColor"
			aria-hidden="true"
			className={className}
		>
			{TROPHY_PIXELS.map(([x, y, w], i) => (
				<rect key={i} x={x} y={y} width={w} height={1} />
			))}
		</svg>
	);
}

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

	const podium = ufStats.slice(0, 3);
	const rest = ufStats.slice(3);

	const maxTotal = ufStats[0]?.total || 1;
	const selected = ufStats.find((u) => u.uf === selectedUf) ?? ufStats[0];

	// sqrt suaviza a assimetria (SP dispara) e abre contraste no meio da tabela
	const levelOf = (total: number) => {
		const r = Math.sqrt(total / maxTotal);
		if (r > 0.85) return 4;
		if (r > 0.6) return 3;
		if (r > 0.4) return 2;
		if (r > 0.2) return 1;
		return 0;
	};

	const ufLabel = (uf: string) => UF_NOMES[uf] ?? uf;

	// Configuração do pódio: ordem visual clássica 2º | 1º | 3º
	const podiumSlots = [
		{ stat: podium[1], rank: 2, pedestalH: "h-12", tone: LEVELS[3] },
		{ stat: podium[0], rank: 1, pedestalH: "h-20", tone: LEVELS[4] },
		{ stat: podium[2], rank: 3, pedestalH: "h-8", tone: LEVELS[2] },
	].filter((s) => s.stat);

	return (
		<div className="flex flex-col gap-4">
			{/* Pódio pixel — Top 3 separado do grid */}
			<div className="flex items-end justify-center gap-2 sm:gap-3">
				{podiumSlots.map(({ stat, rank, pedestalH, tone }) => {
					const isSelected = selected?.uf === stat.uf;
					return (
						<HybridTooltip
							key={stat.uf}
							content={`#${rank} ${ufLabel(stat.uf)} — ${fmtBRL(stat.total)}`}
						>
							<button
								onClick={() => setSelectedUf(stat.uf)}
								className="flex flex-col items-center gap-1 group"
							>
								{rank === 1 ? (
									<PixelTrophy className="h-6 w-6 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)] group-hover:scale-110 transition-transform" />
								) : (
									<span className="h-6 flex items-center text-[10px] font-bold text-green-600 tracking-widest">
										{rank}º
									</span>
								)}
								<span
									className={`text-sm font-bold tracking-widest ${rank === 1 ? "text-green-300" : "text-green-500"}`}
								>
									{stat.uf}
								</span>
								<span className="text-sm font-bold text-green-500 font-mono">
									{fmtMi(stat.total)}
								</span>
								{/* Pedestal */}
								<div
									className={`w-16 sm:w-20 border-2 shadow-[4px_4px_0_rgba(0,0,0,0.85)] ${pedestalH} ${tone} ${isSelected ? "outline-1 outline-green-300 outline-offset-1" : ""} group-hover:brightness-110 transition-all flex items-start justify-center pt-1`}
								>
									<span className="text-[10px] font-bold">{rank}º</span>
								</div>
							</button>
						</HybridTooltip>
					);
				})}
			</div>

			{/* Pixel map — posição = rank (4º em diante, do canto superior esquerdo) */}
			<div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
				{rest.map((u, i) => {
					const rank = i + 4;
					const isSelected = selected?.uf === u.uf;
					return (
						<HybridTooltip
							key={u.uf}
							content={`#${rank} ${ufLabel(u.uf)} — ${fmtBRL(u.total)}`}
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
							&gt; {selected.uf} — {ufLabel(selected.uf)} :: TOP GASTADORES
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
