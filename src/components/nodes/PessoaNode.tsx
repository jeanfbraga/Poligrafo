"use client";

import { useState } from "react";
import { DollarSign, ShieldAlert, User } from "lucide-react";
import Link from "next/link";
import { NodeShell } from "./NodeShell";
import { Button } from "@/components/ui/button";

export const PessoaNode = ({ data, id, isMobile }: { data: any, id?: string, isMobile?: boolean }) => {
	const badge = `${data.cargo} - ${data.uf}`;
	const [useFallback, setUseFallback] = useState(false);
	const [error, setError] = useState(false);

	const imgSrc = useFallback && data.urlFotoFallback ? data.urlFotoFallback : data.urlFoto;

	let titleIcon = undefined;
	if ((!data.urlFoto && !data.urlFotoFallback) || error) {
		titleIcon = <User className="h-6 w-6 text-green-500 shrink-0" />;
	} else {
		titleIcon = (
			<img
				src={imgSrc || data.urlFotoFallback}
				alt={data.label}
				className="h-8 w-8 object-cover rounded-sm border border-green-500 shrink-0 bg-green-950/30"
				onError={() => {
					if (!useFallback && data.urlFotoFallback) {
						setUseFallback(true);
					} else {
						setError(true);
					}
				}}
			/>
		);
	}

	return (
		<NodeShell type="PESSOA" data={data} isMobile={isMobile} badge={badge} titleIcon={titleIcon}>
			<div>
				<p className="text-xs uppercase font-bold text-green-500">
					Nome Civil
				</p>
				<p className="text-xs truncate text-green-400">{data.nomeCivil}</p>
			</div>
			<div className="mt-2">
				<p className="text-xs uppercase font-bold text-green-500">
					{data.isCnpj ? "CNPJ DE CAMPANHA (TSE)" : "DOCUMENTO RAIZ (CPF)"}
				</p>
				<p className="text-xs mt-1">
					{data.documentoPrincipal || data.cpf ? (
						<span className="text-green-300 bg-green-500/20 px-1 py-0.5 rounded-sm">
							{data.isCnpj
								? String(data.documentoPrincipal || data.cpf).replace(
										/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
										"$1.$2.$3/$4-$5",
									)
								: String(data.documentoPrincipal || data.cpf).replace(
										/^(\d{3})(\d{3})(\d{3})(\d{2})/,
										"$1.$2.$3-$4",
									)}
						</span>
					) : (
						<span className="text-green-500/50 italic">
							{"> SIGILOSO / NÃO ENCONTRADO"}
						</span>
					)}
				</p>
			</div>
			{data.patrimonio !== undefined && (
				<div className="mt-2">
					<p className="text-xs uppercase font-bold text-green-500 flex items-center gap-1">
						<DollarSign className="w-3.5 h-3.5" /> PATRIMÔNIO DECLARADO
					</p>
					<p className="text-xs font-bold tracking-widest mt-1 text-yellow-500">
						{data.patrimonio !== null && data.patrimonio !== undefined
							? `R$ ${data.patrimonio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
							: "NÃO ENCONTRADO"}
					</p>
				</div>
			)}

			{data.afastamento && (
				<div className="mt-4 p-3 border border-dashed border-yellow-600/50 bg-yellow-950/20 text-yellow-500 space-y-2">
					<div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider mb-1">
						<ShieldAlert className="w-3.5 h-3.5" />
						<span>ALERTA DE AFASTAMENTO</span>
					</div>
					<p className="text-xs leading-tight">
						&gt; {data.afastamento.motivo}
					</p>
					{data.afastamento.suplente && (
						<p className="text-xs leading-tight mt-1 border-t border-yellow-600/30 pt-1">
							<span className="font-bold opacity-70">
								SUPLENTE EM EXERCÍCIO:
							</span>{" "}
							{data.afastamento.suplente}
						</p>
					)}
				</div>
			)}
			{data.cargo?.toUpperCase() === "DEPUTADO FEDERAL" && id && !data.isSearching && (
				<div className="mt-4 border-t border-green-500/20 pt-3">
					<Button
						variant="outline"
						className="w-full border-green-500 bg-black hover:bg-green-500 hover:text-black text-green-500 rounded-none font-bold uppercase tracking-wider text-xs h-9"
						asChild
					>
						<Link
							href={`/perfil/deputado/${data.idPoliticoOriginal || id.split(":").pop()}?nome=${encodeURIComponent(data.label)}&partido=${encodeURIComponent(data.partido || "")}&uf=${encodeURIComponent(data.uf || "")}&foto=${encodeURIComponent(data.foto || "")}`}
						>
							IR PARA PERFIL COMPLETO
						</Link>
					</Button>
				</div>
			)}
		</NodeShell>
	);
};
