"use client";

import { Button } from "@/components/ui/button";
import { AIProgressBar } from "./AIProgressBar";
import { NodeShell } from "./NodeShell";

export const OrgaoNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const deepDiveButton = data.hasDeepDive && !data.isSearching ? (
		<Button
			variant="outline"
			size="sm"
			onClick={(e) => {
				e.stopPropagation();
				data.onDeepDive?.(data.id, data.nomePolitico, data.casa);
			}}
			className="w-full mt-3 bg-emerald-950/30 border-emerald-500/50 text-emerald-500 hover:bg-emerald-900/50 hover:text-emerald-400 text-xs uppercase tracking-wider rounded-none font-mono"
		>
			[ Aprofundar Buscas ]
		</Button>
	) : undefined;

	return (
		<NodeShell type="ORGAO" data={data} isMobile={isMobile} footer={deepDiveButton}>
			<div>
				<p className="text-xs uppercase font-bold text-emerald-600">
					Esfera
				</p>
				<p className="text-xs uppercase text-emerald-400">{data.esfera}</p>
			</div>

			{data.motivo_ia && (
				<AIProgressBar isMobile={isMobile} score={data.score_letalidade} motivo={data.motivo_ia} />
			)}
		</NodeShell>
	);
};
