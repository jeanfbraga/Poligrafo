"use client";

import { AIProgressBar } from "./AIProgressBar";
import { NodeShell } from "./NodeShell";

export const EmpresaNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const badge = data.tipo || "PESSOA JURÍDICA";

	return (
		<NodeShell type="EMPRESA" data={data} isMobile={isMobile} badge={badge}>
			{data.cnpj && (
				<div>
					<p className="text-xs uppercase font-bold text-blue-600">CNPJ</p>
					<p className="text-xs text-blue-400">{data.cnpj}</p>
				</div>
			)}
			{data.capitalSocial !== undefined && (
				<div className="mt-2">
					<p className="text-xs uppercase font-bold text-blue-600">
						Capital Social
					</p>
					<p className="text-xs text-blue-400">
						R$ {Number(data.capitalSocial).toLocaleString("pt-BR")}
					</p>
				</div>
			)}
			{data.cnae && (
				<div className="mt-2">
					<p className="text-xs uppercase font-bold text-blue-600">
						CNAE Principal
					</p>
					<p className="text-xs line-clamp-2 opacity-80 text-blue-400">{data.cnae}</p>
				</div>
			)}
			{data.situacao && (
				<div className="mt-2">
					<p className="text-xs uppercase font-bold text-blue-600">
						Situação
					</p>
					<p className="text-xs opacity-80 text-blue-400">{data.situacao}</p>
				</div>
			)}

			{data.motivo_ia &&
				!(
					data.label?.toUpperCase().includes("ELEICAO") ||
					data.label?.toUpperCase().includes("CAMPANHA") ||
					data.cnae?.toUpperCase().includes("CAMPANHA")
				) && (
					<AIProgressBar isMobile={isMobile}
						score={data.score_letalidade}
						motivo={data.motivo_ia}
					/>
				)}
		</NodeShell>
	);
};
