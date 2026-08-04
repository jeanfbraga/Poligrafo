"use client";

import { NodeShell } from "./NodeShell";

/**
 * Nó de publicação em Diário Oficial (Querido Diário / DOU).
 * Exibe município, data, tipo de ato e o resumo extraído pela IA do excerto.
 */
export const DiarioOficialNode = ({
	data,
	isMobile,
}: {
	data: any;
	isMobile?: boolean;
}) => {
	const dataFmt = data.dataPublicacao
		? new Date(data.dataPublicacao).toLocaleDateString("pt-BR", {
				timeZone: "UTC",
			})
		: null;

	return (
		<NodeShell type="DIARIO_OFICIAL_NODE" data={data} isMobile={isMobile}>
			<div>
				<p className="text-xs text-emerald-500 uppercase font-bold">
					Município / UF
				</p>
				<p className="text-xs mt-1 text-emerald-400 line-clamp-1 leading-tight">
					&gt; {data.municipio || "N/I"}
					{data.uf ? ` / ${data.uf}` : ""}
				</p>
			</div>
			<div className="mt-2">
				<p className="text-xs text-emerald-500 uppercase font-bold">
					Tipo de Ato
				</p>
				<p className="text-xs font-bold mt-1 text-emerald-400 opacity-90 line-clamp-2">
					{data.tipoEvento || "Publicação Legal"}
				</p>
			</div>
			{dataFmt && dataFmt !== "Invalid Date" && (
				<p className="text-xs text-emerald-500/80 mt-2">
					PUBLICAÇÃO: {dataFmt}
				</p>
			)}
			{Number(data.valor) > 0 && (
				<p className="text-xs text-emerald-500/80 mt-1">
					VALOR: R$ {Number(data.valor).toLocaleString("pt-BR")}
				</p>
			)}
			{data.empresa && (
				<p className="text-xs text-emerald-400/90 mt-1 line-clamp-1">
					EMPRESA: {data.empresa}
				</p>
			)}
			{data.resumo && (
				<p className="text-[11px] text-emerald-300/70 mt-2 line-clamp-3 leading-snug border-t border-emerald-900/50 pt-2">
					{data.resumo}
				</p>
			)}
		</NodeShell>
	);
};
