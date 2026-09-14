"use client";

import { useState } from "react";
import { DollarSign, ShieldAlert, User } from "lucide-react";
import Link from "next/link";
import { NodeShell } from "./NodeShell";
import { Button } from "@/components/ui/button";
import { extractDeputyId, extractDeputyPhotoUrl } from "@/lib/utils";

function PessoaAvatar({ data }: { data: any }) {
	const [useFallback, setUseFallback] = useState(false);
	const [error, setError] = useState(false);
	const fallbackUrl = data?.urlFotoFallback;
	const primaryUrl = data?.urlFoto;
	const src = useFallback && fallbackUrl ? fallbackUrl : (primaryUrl || fallbackUrl);

	if ((!primaryUrl && !fallbackUrl) || error || !src) {
		return <User className="h-6 w-6 text-green-500 shrink-0" />;
	}

	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={src}
			alt={data?.label || "Foto"}
			className="h-8 w-8 object-cover rounded-sm border border-green-500 shrink-0 bg-green-950/30"
			onError={() => {
				if (!useFallback && fallbackUrl) {
					setUseFallback(true);
				} else {
					setError(true);
				}
			}}
		/>
	);
}

function formatarDocumento(doc: string, isCnpj: boolean): string {
	const cleaned = doc.replace(/\D/g, "");
	if (isCnpj) {
		return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
	}
	return cleaned.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function PessoaDocumento({ data }: { data: any }) {
	const doc = String(data?.documentoPrincipal || data?.cpf || "");
	return (
		<div className="mt-2">
			<p className="text-xs uppercase font-bold text-green-500">
				{data?.isCnpj ? "CNPJ DE CAMPANHA (TSE)" : "DOCUMENTO RAIZ (CPF)"}
			</p>
			<p className="text-xs mt-1">
				{doc ? (
					<span className="text-green-300 bg-green-500/20 px-1 py-0.5 rounded-sm">
						{formatarDocumento(doc, Boolean(data?.isCnpj))}
					</span>
				) : (
					<span className="text-green-500/50 italic">
						{"> SIGILOSO / NÃO ENCONTRADO"}
					</span>
				)}
			</p>
		</div>
	);
}

function getVariacaoBadgeClass(variacao: number): string {
	if (variacao > 50) return "bg-amber-950/40 text-amber-400 border-amber-500/40 animate-pulse";
	if (variacao >= 0) return "bg-yellow-950/30 text-yellow-400 border-yellow-500/30";
	return "bg-emerald-950/30 text-emerald-400 border-emerald-500/30";
}

function getVariacaoSinal(variacao: number): string {
	if (variacao > 0) return "▲ +";
	if (variacao < 0) return "▼ ";
	return "=";
}

function formatarValorPatrimonio(patrimonio: any, temBens: boolean): string {
	const num = Number(patrimonio);
	if (patrimonio !== null && num > 0) {
		return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
	}
	if (temBens) return "R$ 0,00";
	return "NÃO LOCALIZADO";
}

function formatarAnoTexto(ano?: number, temPatrimonioPositivo?: boolean): string {
	if (ano) return `(${ano})`;
	if (temPatrimonioPositivo) return "(2026)";
	return "";
}

function PessoaVariacaoBadge({ data }: { data: any }) {
	const temVariacao = data?.variacaoPatrimonioPercentual !== undefined && data?.anoPatrimonioAnterior !== undefined;
	if (!temVariacao) return null;

	return (
		<div className="mt-1 flex items-center gap-1.5 text-[10px]">
			<span className={`px-1.5 py-0.5 font-bold uppercase tracking-wider rounded-xs border ${getVariacaoBadgeClass(data.variacaoPatrimonioPercentual)}`}>
				{getVariacaoSinal(data.variacaoPatrimonioPercentual)}
				{data.variacaoPatrimonioPercentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs {data.anoPatrimonioAnterior}
			</span>
		</div>
	);
}

function PessoaPatrimonio({ data }: { data: any }) {
	if (data?.patrimonio === undefined) return null;
	const bens = Array.isArray(data.bensDeclarados) ? data.bensDeclarados : [];
	const temPatrimonioPositivo = data.patrimonio !== null && Number(data.patrimonio) > 0;
	const valorFormatado = formatarValorPatrimonio(data.patrimonio, bens.length > 0);
	const anoTexto = formatarAnoTexto(data.anoPatrimonio, temPatrimonioPositivo);

	return (
		<div className="mt-2">
			<div className="flex items-center justify-between gap-1 text-xs uppercase font-bold text-green-500">
				<span className="flex items-center gap-1">
					<DollarSign className="w-3.5 h-3.5 text-yellow-400" /> PATRIMÔNIO DECLARADO {anoTexto}
				</span>
				{bens.length > 0 && (
					<span className="text-[10px] px-1.5 py-0.2 bg-yellow-950/60 border border-yellow-700/60 text-yellow-400 font-bold font-mono">
						{bens.length} {bens.length === 1 ? "BEM" : "BENS"}
					</span>
				)}
			</div>
			<p className="text-xs font-bold tracking-widest mt-1 text-yellow-400 font-mono">
				{valorFormatado}
			</p>
			<PessoaVariacaoBadge data={data} />
		</div>
	);
}

function PessoaAfastamento({ afastamento }: { afastamento?: any }) {
	if (!afastamento) return null;
	return (
		<div className="mt-4 p-3 border border-dashed border-yellow-600/50 bg-yellow-950/20 text-yellow-500 space-y-2">
			<div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider mb-1">
				<ShieldAlert className="w-3.5 h-3.5" />
				<span>ALERTA DE AFASTAMENTO</span>
			</div>
			<p className="text-xs leading-tight">&gt; {afastamento.motivo}</p>
			{afastamento.suplente && (
				<p className="text-xs leading-tight mt-1 border-t border-yellow-600/30 pt-1">
					<span className="font-bold opacity-70">SUPLENTE EM EXERCÍCIO:</span>{" "}
					{afastamento.suplente}
				</p>
			)}
		</div>
	);
}

function PessoaPerfilLink({ data, id }: { data: any, id?: string }) {
	if (data?.cargo?.toUpperCase() !== "DEPUTADO FEDERAL" || data?.isSearching) {
		return null;
	}
	const deputyId = extractDeputyId(data, id);
	if (!deputyId) return null;
	const fotoParam = extractDeputyPhotoUrl(data);
	const query = new URLSearchParams({
		nome: data?.label || "",
		partido: data?.partido || "",
		uf: data?.uf || "",
		foto: fotoParam,
	});

	return (
		<div
			className="mt-4 border-t border-green-500/20 pt-3 nodrag nopan"
			onClick={(e) => e.stopPropagation()}
			onPointerDown={(e) => e.stopPropagation()}
		>
			<Button
				variant="outline"
				className="w-full border-green-500 bg-black hover:bg-green-500 hover:text-black text-green-500 rounded-none font-bold uppercase tracking-wider text-xs h-9 cursor-pointer pointer-events-auto"
				asChild
			>
				<Link
					href={`/perfil/deputado/${deputyId}?${query.toString()}`}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
				>
					IR PARA PERFIL COMPLETO
				</Link>
			</Button>
		</div>
	);
}

export const PessoaNode = ({ data, id, isMobile }: { data: any, id?: string, isMobile?: boolean }) => {
	const badge = `${data?.cargo} - ${data?.uf}`;
	return (
		<NodeShell type="PESSOA" data={data} isMobile={isMobile} badge={badge} titleIcon={<PessoaAvatar data={data} />}>
			<div>
				<p className="text-xs uppercase font-bold text-green-500">Nome Civil</p>
				<p className="text-xs truncate text-green-400">{data?.nomeCivil}</p>
			</div>
			<PessoaDocumento data={data} />
			<PessoaPatrimonio data={data} />
			<PessoaAfastamento afastamento={data?.afastamento} />
			<PessoaPerfilLink data={data} id={id} />
		</NodeShell>
	);
};
