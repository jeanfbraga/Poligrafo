"use client";

import { AIProgressBar } from "./AIProgressBar";
import { NodeShell } from "./NodeShell";

export const DespesaNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const score = data.score_letalidade || 50;
	const isLetal = score >= 85;
	const isSuspeito = score >= 60;

	return (
		<NodeShell type="DESPESA" data={data} isMobile={isMobile}>
			<div>
				<p className={`text-lg font-bold truncate ${isLetal ? "text-red-500" : isSuspeito ? "text-yellow-500" : "text-slate-400"}`}>
					R${" "}
					{Number(data.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
				</p>
				<p className={`text-xs mt-2 uppercase truncate ${isLetal ? "text-red-400/80" : isSuspeito ? "text-yellow-400/80" : "text-slate-400/80"}`} title={data.tipo || data.descricao}>
					{data.tipo || data.descricao}
				</p>
				{data.nomeFornecedor && (
					<p className="text-xs mt-1 uppercase font-bold text-slate-300 line-clamp-2" title={data.nomeFornecedor}>
						{data.nomeFornecedor}
					</p>
				)}
				<p className={`text-[10px] mt-1 uppercase tracking-wider ${isLetal ? "text-red-400/60" : isSuspeito ? "text-yellow-400/60" : "text-slate-400/60"}`}>
					{data.dataDocumento
						? String(data.dataDocumento).includes("/")
							? data.dataDocumento
							: new Date(data.dataDocumento).toLocaleDateString("pt-BR", { timeZone: "UTC" }).replace("Invalid Date", data.dataDocumento)
						: "DATA INDISPONÍVEL"}
				</p>
			</div>

			{data.motivo_ia && (
				<AIProgressBar isMobile={isMobile} score={data.score_letalidade} motivo={data.motivo_ia} />
			)}
		</NodeShell>
	);
};
