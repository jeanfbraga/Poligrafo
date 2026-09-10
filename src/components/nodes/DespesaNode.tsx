"use client";

import { AIProgressBar } from "./AIProgressBar";
import { NodeShell } from "./NodeShell";

function obterCorValor(isLetal: boolean, isSuspeito: boolean) {
	if (isLetal) return "text-red-500";
	if (isSuspeito) return "text-yellow-500";
	return "text-slate-400";
}

function obterCorTexto(isLetal: boolean, isSuspeito: boolean, opacidade = "80") {
	if (isLetal) return `text-red-400/${opacidade}`;
	if (isSuspeito) return `text-yellow-400/${opacidade}`;
	return `text-slate-400/${opacidade}`;
}

function formatarDataDocumento(dataDocumento?: string) {
	if (!dataDocumento) return "DATA INDISPONÍVEL";
	const str = String(dataDocumento);
	if (str.includes("/")) return str;
	return new Date(str).toLocaleDateString("pt-BR", { timeZone: "UTC" }).replace("Invalid Date", str);
}

export const DespesaNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	const score = data.score_letalidade || 50;
	const isLetal = score >= 85;
	const isSuspeito = score >= 60;
	const corValor = obterCorValor(isLetal, isSuspeito);
	const corTexto = obterCorTexto(isLetal, isSuspeito, "80");
	const corData = obterCorTexto(isLetal, isSuspeito, "60");

	return (
		<NodeShell type="DESPESA" data={data} isMobile={isMobile}>
			<div>
				<p className={`text-lg font-bold truncate ${corValor}`}>
					R${" "}
					{Number(data.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
				</p>
				<p className={`text-xs mt-2 uppercase truncate ${corTexto}`} title={data.tipo || data.descricao}>
					{data.tipo || data.descricao}
				</p>
				{data.nomeFornecedor && (
					<p className="text-xs mt-1 uppercase font-bold text-slate-300 line-clamp-2" title={data.nomeFornecedor}>
						{data.nomeFornecedor}
					</p>
				)}
				<p className={`text-[10px] mt-1 uppercase tracking-wider ${corData}`}>
					{formatarDataDocumento(data.dataDocumento)}
				</p>
			</div>

			{data.motivo_ia && (
				<AIProgressBar isMobile={isMobile} score={data.score_letalidade} motivo={data.motivo_ia} />
			)}
		</NodeShell>
	);
};
