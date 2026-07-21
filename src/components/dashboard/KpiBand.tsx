"use client";

import { useMemo } from "react";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";
import { formatName } from "@/lib/utils";

// ==========================================================================
// RASCUNHO (layout v2) — Faixa hero do big number.
// Big number CEAP com estética pixel/scanline + micro-stats derivadas
// exclusivamente do payload atual de /api/dashboard/home (nenhum dado novo).
// ==========================================================================

interface KpiBandProps {
	loading: boolean;
	ceapTotal?: { total_gasto: string }[] | null;
	ceapTop10?: { nome: string; total_gasto: number; uf?: string }[] | null;
	emendasTop10?: { autor: string; total_pix: number }[] | null;
	ufCount: number;
}

export function KpiBand({
	loading,
	ceapTotal,
	ceapTop10,
	emendasTop10,
	ufCount,
}: KpiBandProps) {
	const anoMaisRecente = useMemo(() => {
		return ceapTotal && ceapTotal.length > 0
			? Math.max(...ceapTotal.map((item: any) => Number(item.ano)))
			: new Date().getFullYear();
	}, [ceapTotal]);

	const totalCeap = useMemo(() => {
		return (
			ceapTotal
				?.filter((item: any) => Number(item.ano) === anoMaisRecente)
				.reduce(
					(acc: number, item: { total_gasto: string }) =>
						acc + Number(item.total_gasto),
					0,
				) || 0
		);
	}, [ceapTotal, anoMaisRecente]);

	const mediaTop10 = useMemo(() => {
		if (!ceapTop10 || ceapTop10.length === 0) return 0;
		return (
			ceapTop10.reduce((acc, i) => acc + Number(i.total_gasto || 0), 0) /
			ceapTop10.length
		);
	}, [ceapTop10]);

	const totalPixTop10 = useMemo(() => {
		if (!emendasTop10 || emendasTop10.length === 0) return 0;
		return emendasTop10.reduce((acc, i) => acc + Number(i.total_pix || 0), 0);
	}, [emendasTop10]);

	const topGastador = ceapTop10 && ceapTop10.length > 0 ? ceapTop10[0] : null;

	return (
		<div className="relative border border-green-500/50 bg-black overflow-hidden shadow-[0_0_25px_rgba(0,34,0,0.6)]">
			{/* Scanlines */}
			<div
				className="pointer-events-none absolute inset-0 z-10 opacity-60"
				style={{
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(34,197,94,0.05) 3px, rgba(34,197,94,0.05) 4px)",
				}}
			/>
			{/* Cantos pixel */}
			<span className="absolute top-1 left-2 text-green-700 text-xs select-none">
				[
			</span>
			<span className="absolute top-1 right-2 text-green-700 text-xs select-none">
				]
			</span>

			<div className="relative z-0 flex flex-col lg:flex-row lg:items-end gap-6 p-5 md:p-6">
				{/* Big number */}
				<div className="flex-1 min-w-0">
					<p className="text-[11px] md:text-xs text-green-600 uppercase tracking-widest mb-2">
						&gt; GASTO_EM_COTA_PARLAMENTAR :: {anoMaisRecente}
					</p>
					<div className="text-4xl md:text-5xl xl:text-6xl font-bold text-green-400 tracking-tight [text-shadow:0_0_18px_rgba(34,197,94,0.45)]">
						{loading ? (
							<span className="animate-pulse text-2xl md:text-3xl">
								CARREGANDO...
							</span>
						) : (
							<AnimatedNumber
								value={totalCeap}
								prefix="R$ "
								isCurrency={true}
							/>
						)}
					</div>
				</div>

				{/* Micro-stats derivadas */}
				{!loading && (
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6 lg:text-right shrink-0">
						<div className="border-l-2 lg:border-l-0 lg:border-r-2 border-green-900/60 pl-3 lg:pl-0 lg:pr-3">
							<p className="text-[10px] text-green-700 uppercase tracking-widest mb-1">
								Top gastador
							</p>
							<p className="text-sm font-bold text-amber-400 truncate max-w-55">
								{topGastador ? formatName(topGastador.nome) : "—"}
							</p>
							<p className="text-xs text-green-500">
								{topGastador ? (
									<AnimatedNumber
										value={topGastador.total_gasto}
										prefix="R$ "
										isCurrency={true}
									/>
								) : (
									"—"
								)}
							</p>
						</div>
						<div className="border-l-2 lg:border-l-0 lg:border-r-2 border-green-900/60 pl-3 lg:pl-0 lg:pr-3">
							<p className="text-[10px] text-green-700 uppercase tracking-widest mb-1">
								Média do Top 10
							</p>
							<p className="text-sm font-bold text-green-400">
								<AnimatedNumber
									value={mediaTop10}
									prefix="R$ "
									isCurrency={true}
								/>
							</p>
							<p className="text-[10px] text-green-800 uppercase tracking-wider">
								por deputado
							</p>
						</div>
						<div className="border-l-2 lg:border-l-0 border-green-900/60 pl-3 lg:pl-0">
							<p className="text-[10px] text-green-700 uppercase tracking-widest mb-1">
								Emendas PIX (Top 10)
							</p>
							<p className="text-sm font-bold text-teal-400">
								<AnimatedNumber
									value={totalPixTop10}
									prefix="R$ "
									isCurrency={true}
								/>
							</p>
							<p className="text-[10px] text-green-800 uppercase tracking-wider">
								{ufCount} UFs monitoradas
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
