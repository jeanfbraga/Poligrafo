"use client";

import { AIProgressBar } from "./AIProgressBar";
import { NodeShell } from "./NodeShell";

export const ProcessoJudicialNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const badgeText = data.tribunal === "Cadastro de Inidôneos/Sancionados (CGU)" ? "[SANÇÃO_TCU_CGU]" : "[PROCESSO_JUDICIAL]";

	return (
		<NodeShell type="PROCESSO_JUDICIAL" data={data} isMobile={isMobile} badge={badgeText}>
			<div>
				<p className="text-xs text-red-500 uppercase font-bold">
					Instância / Órgão
				</p>
				<p className="text-xs mt-1 text-red-400 line-clamp-2 leading-tight">
					&gt; {data.tribunal}
				</p>
			</div>
			<div className="mt-2">
				<p className="text-xs text-red-500 uppercase font-bold">
					Assunto Originário
				</p>
				<p className="text-xs font-bold mt-1 text-red-400 opacity-90 line-clamp-2">
					{data.assunto}
				</p>
			</div>
			{data.dataAjuizamento && (
				<div className="mt-2">
					<p className="text-xs text-red-500/80">
						AJUIZAMENTO:{" "}
						{new Date(data.dataAjuizamento).toLocaleDateString("pt-BR", { timeZone: "UTC" }).replace("Invalid Date", data.dataAjuizamento)}
					</p>
				</div>
			)}

			{data.motivo_ia && (
				<AIProgressBar isMobile={isMobile} score={data.score_letalidade || 95} motivo={data.motivo_ia} />
			)}
		</NodeShell>
	);
};
