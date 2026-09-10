"use client";

function getScoreTheme(score: number) {
	if (score >= 85) {
		return {
			wrapper: "bg-red-950/20 border-red-500/50 text-red-500",
			header: "text-red-500",
			progress: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]",
			track: "bg-red-950/50",
		};
	}
	if (score >= 60) {
		return {
			wrapper: "bg-yellow-950/20 border-yellow-500/50 text-yellow-500",
			header: "text-yellow-500",
			progress: "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]",
			track: "bg-yellow-950/50",
		};
	}
	return {
		wrapper: "bg-slate-900/40 border-slate-700/50 text-slate-400",
		header: "text-slate-400",
		progress: "bg-slate-500",
		track: "bg-slate-900/50",
	};
}

export const AIProgressBar = ({
	score = 0,
	motivo,
	isMobile = false,
}: {
	score?: number;
	motivo?: string;
	isMobile?: boolean;
}) => {
	const theme = getScoreTheme(score);

	return (
		<div
			className={`mt-2 p-2 border border-dashed text-xs leading-tight flex flex-col gap-2 ${theme.wrapper}`}
		>
			<div
				className={`flex items-center justify-between font-bold pb-1 border-b border-inherit/30 ${theme.header} uppercase tracking-wider text-[10px]`}
			>
				<span>NÍVEL DE ALERTA (IA)</span>
				<span>{score}%</span>
			</div>
			<div className={`w-full h-1.5 ${theme.track} overflow-hidden`}>
				<div
					className={`h-full ${theme.progress} transition-all duration-1000`}
					style={{ width: `${score}%` }}
				/>
			</div>
			{motivo && (
				<span className="mt-1 text-[11px] opacity-90 leading-relaxed">
					&gt; {motivo}
				</span>
			)}
		</div>
	);
};
