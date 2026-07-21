"use client";

export const AIProgressBar = ({
	score,
	motivo,
}: {
	score?: number;
	motivo?: string;
}) => {
	const s = score || 0;
	const isLetal = s >= 85;
	const isSuspeito = s >= 60 && s < 85;

	const wrapperClass = isLetal
		? "bg-red-950/20 border-red-500/50 text-red-500"
		: isSuspeito
			? "bg-yellow-950/20 border-yellow-500/50 text-yellow-500"
			: "bg-slate-900/40 border-slate-700/50 text-slate-400";

	const headerClass = isLetal
		? "text-red-500"
		: isSuspeito
			? "text-yellow-500"
			: "text-slate-400";
	const bgProgress = isLetal
		? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
		: isSuspeito
			? "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]"
			: "bg-slate-500";
	const bgTrack = isLetal
		? "bg-red-950/50"
		: isSuspeito
			? "bg-yellow-950/50"
			: "bg-slate-900/50";

	return (
		<div
			className={`mt-2 p-2 border border-dashed text-xs leading-tight flex flex-col gap-2 ${wrapperClass}`}
		>
			<div
				className={`flex items-center justify-between font-bold pb-1 border-b border-inherit/30 ${headerClass} uppercase tracking-wider text-[10px]`}
			>
				<span>NÍVEL DE ALERTA (IA)</span>
				<span>{s}%</span>
			</div>
			<div className={`w-full h-1.5 ${bgTrack} overflow-hidden`}>
				<div
					className={`h-full ${bgProgress} transition-all duration-1000`}
					style={{ width: `${s}%` }}
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
