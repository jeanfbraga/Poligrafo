"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
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
//
// v2.2 (fix 2026-07): o total da UF vem pré-computado da API (soma de TODOS
// os deputados da UF na janela da view). Antes o componente somava apenas os
// 5 deputados do detalhe, o que quebrava o ranking e exibia valores iguais
// arredondados para UFs diferentes (ex.: RS, RR e AC em "4,4 mi").
//
// v2.3: celebração do 1º lugar — hover/toque no pódio dispara o troféu
// rodopiando 1x com leve salto + fogos pixelados saindo por trás (CSS puro,
// ~1s, rearmado por estado; respeita prefers-reduced-motion).
// ==========================================================================

interface CeapEstadoData {
	total: number;
	deputados: any[];
}

interface UfHeatGridProps {
	data?: Record<string, CeapEstadoData>;
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

// Celebração do 1º lugar: coreografia fixa de ~1s em CSS puro (GSAP seria
// overkill para um spin+salto sem física). Partículas determinísticas em
// leque para cima (-165° → -15°), para o burst não mudar a cada render.
const FIREWORK_COLORS = ["#fbbf24", "#f59e0b", "#fde68a", "#4ade80", "#22c55e"];

const FIREWORK_PARTICLES = Array.from({ length: 14 }, (_, i) => {
	const angle = ((-165 + (150 * i) / 13) * Math.PI) / 180;
	const dist = 34 + ((i * 17) % 26);
	return {
		x: Math.cos(angle) * dist,
		y: Math.sin(angle) * dist * 1.15, // sobe um pouco mais do que abre
		size: 3 + ((i * 7) % 3), // quadrados de 3–5px (pixelado)
		color: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
		delay: (i % 5) * 30,
		dur: 620 + ((i * 13) % 4) * 60,
	};
});

// Cobre a partícula mais longa (120ms de delay + 800ms de duração)
const CELEBRATION_MS = 950;

const CELEBRATION_CSS = `
@keyframes trophy-spin-jump {
  0%   { transform: translateY(0) rotate(0deg); }
  20%  { transform: translateY(-10px) rotate(80deg); }
  45%  { transform: translateY(-15px) rotate(190deg); }
  70%  { transform: translateY(-8px) rotate(305deg); }
  85%  { transform: translateY(0) rotate(350deg); }
  100% { transform: translateY(0) rotate(360deg); }
}
@keyframes pixel-burst {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  75%  { opacity: 1; }
  100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.4); opacity: 0; }
}
.trophy-celebrate { animation: trophy-spin-jump 0.7s ease-in-out; }
.pixel-particle {
  position: absolute; left: 50%; top: 50%;
  opacity: 0; pointer-events: none;
  animation: pixel-burst var(--dur) var(--delay) ease-out forwards;
}
@media (prefers-reduced-motion: reduce) {
  .trophy-celebrate, .pixel-particle { animation: none; }
}
`;

export function UfHeatGrid({ data }: UfHeatGridProps) {
	const ufStats = useMemo(() => {
		if (!data) return [];
		return Object.entries(data)
			.map(([uf, grupo]) => ({
				uf,
				total: Number(grupo?.total) || 0,
				deputados: grupo?.deputados ?? [],
			}))
			.sort((a, b) => b.total - a.total);
	}, [data]);

	const [selectedUf, setSelectedUf] = useState<string | null>(null);

	const [celebrating, setCelebrating] = useState(false);
	const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Dispara a celebração do 1º lugar; ignora gatilhos enquanto já anima
	const celebrate = () => {
		if (celebrateTimer.current) return;
		setCelebrating(true);
		celebrateTimer.current = setTimeout(() => {
			setCelebrating(false);
			celebrateTimer.current = null;
		}, CELEBRATION_MS);
	};

	useEffect(
		() => () => {
			if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
		},
		[],
	);

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
			<style>{CELEBRATION_CSS}</style>
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
								onClick={() => {
									setSelectedUf(stat.uf);
									if (rank === 1) celebrate();
								}}
								onMouseEnter={rank === 1 ? celebrate : undefined}
								onFocus={rank === 1 ? celebrate : undefined}
								className="flex flex-col items-center gap-1 group"
							>
								{rank === 1 ? (
									<span className="relative flex h-6 w-6 items-center justify-center">
										{celebrating &&
											FIREWORK_PARTICLES.map((p, i) => (
												<span
													key={i}
													className="pixel-particle"
													style={
														{
															width: p.size,
															height: p.size,
															backgroundColor: p.color,
															"--dx": `${p.x.toFixed(1)}px`,
															"--dy": `${p.y.toFixed(1)}px`,
															"--delay": `${p.delay}ms`,
															"--dur": `${p.dur}ms`,
														} as CSSProperties
													}
												/>
											))}
										<PixelTrophy
											className={`relative z-10 h-6 w-6 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)] group-hover:scale-110 transition-transform ${celebrating ? "trophy-celebrate" : ""}`}
										/>
									</span>
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
