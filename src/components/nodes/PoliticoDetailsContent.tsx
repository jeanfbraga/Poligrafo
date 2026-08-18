"use client";

import {
	DollarSign,
	ExternalLink,
	History,
	Layers,
	MapPin,
	ShieldAlert,
	TrendingDown,
	TrendingUp,
	User,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface PoliticoDetailsContentProps {
	data: any;
	nodeId?: string;
	isMobile?: boolean;
}

export function PoliticoDetailsContent({
	data,
	nodeId,
	isMobile = false,
}: PoliticoDetailsContentProps) {
	if (!data) return null;

	const anoAtual = data.anoPatrimonio || 2026;
	const anoAnterior = data.anoPatrimonioAnterior;
	const patrimonioAtual = Number(data.patrimonio || 0);
	const patrimonioAnt = Number(data.patrimonioAnterior || 0);
	const variacaoNominal = Number(data.variacaoPatrimonio || 0);
	const variacaoPercentual = Number(data.variacaoPatrimonioPercentual || 0);
	const historico = data.historicoPatrimonio || [];
	const bens = data.bensDeclarados || [];
	const alertas = data.alertasPessoais || [];

	const cargoUpper = (data.cargo || "").toUpperCase();
	const casaUpper = (data.casa || "").toUpperCase();
	const isDeputadoFederal =
		cargoUpper.includes("DEPUTADO FEDERAL") || casaUpper.includes("FEDERAL");

	let deputyId: string | null = null;
	if (data.ref) {
		deputyId = data.ref.split(":").pop() || null;
	} else if (nodeId && nodeId.includes(":")) {
		deputyId = nodeId.split(":").pop() || null;
	} else if (data.idPoliticoOriginal) {
		deputyId = String(data.idPoliticoOriginal);
	} else if (data.id) {
		deputyId = String(data.id);
	}

	const multiplo =
		patrimonioAnt > 0 && patrimonioAtual > patrimonioAnt
			? (patrimonioAtual / patrimonioAnt).toFixed(1)
			: null;

	return (
		<div className="space-y-4 font-mono text-green-400">
			{/* 1. CABEÇALHO / FICHA BÁSICA */}
			<div className="border border-green-500/30 bg-black/60 p-3.5 space-y-2.5">
				<div className="flex items-center gap-3">
					{data.urlFoto || data.foto || data.urlFotoFallback ? (
						<img
							src={data.urlFoto || data.foto || data.urlFotoFallback}
							alt={data.label || "Foto Oficial"}
							className="h-12 w-12 object-cover border border-green-500 rounded-none shrink-0 bg-green-950/30"
						/>
					) : (
						<div className="h-12 w-12 border border-green-500 flex items-center justify-center bg-green-950/30 shrink-0">
							<User className="w-6 h-6 text-green-500" />
						</div>
					)}
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<h3 className="text-sm md:text-base font-bold uppercase tracking-wider text-green-400 truncate">
								{data.label}
							</h3>
							{data.partido && (
								<Badge
									variant="outline"
									className="rounded-none border-green-500/60 bg-green-950/40 text-green-300 text-xs font-bold uppercase shrink-0 px-2 py-0.5"
								>
									{data.partido}
								</Badge>
							)}
						</div>
						{data.nomeCivil && data.nomeCivil !== data.label && (
							<p className="text-xs text-green-600 uppercase font-bold truncate mt-0.5">
								{data.nomeCivil}
							</p>
						)}
						<p className="text-xs text-green-500 uppercase font-bold flex items-center gap-1 mt-0.5">
							<MapPin className="w-3 h-3 text-green-500" />
							{data.cargo || "POLÍTICO"} — {data.uf || "??"}
						</p>
					</div>
				</div>

				{(data.documentoPrincipal || data.cpf) && (
					<div className="pt-2 border-t border-green-950 flex items-center justify-between text-xs">
						<span className="text-[10px] uppercase font-bold text-green-600">
							DOCUMENTO RAIZ (CPF)
						</span>
						<span className="font-bold text-green-300 bg-green-950/40 px-2 py-0.5 border border-green-900/50">
							{String(data.documentoPrincipal || data.cpf)}
						</span>
					</div>
				)}
			</div>

			{/* 2. PATRIMÔNIO DECLARADO & EVOLUÇÃO */}
			{data.patrimonio !== undefined && (
				<div className="space-y-3">
					{/* VALOR BRUTO ATUAL */}
					<div className="border border-yellow-500/40 bg-yellow-950/10 p-3.5 space-y-2">
						<div className="flex items-center justify-between">
							<p className="text-xs uppercase font-bold text-yellow-500 flex items-center gap-1.5">
								<DollarSign className="w-4 h-4 text-yellow-400" />
								PATRIMÔNIO DECLARADO ({anoAtual})
							</p>
							{data.partido && (
								<span className="text-[10px] px-2 py-0.5 bg-yellow-950/40 border border-yellow-500/40 text-yellow-400 font-bold uppercase">
									{data.partido}
								</span>
							)}
						</div>

						<p className="text-2xl font-bold tracking-widest text-yellow-400 font-mono">
							{patrimonioAtual > 0
								? `R$ ${patrimonioAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
								: "R$ 0,00"}
						</p>

						{/* COMPARATIVO / EVOLUÇÃO (LOGO ABAIXO DO VALOR BRUTO) */}
						{anoAnterior !== undefined && (
							<div className="pt-3 border-t border-yellow-900/40 space-y-2.5">
								<div className="flex items-center justify-between">
									<span className="text-[10px] uppercase font-bold text-yellow-500 flex items-center gap-1">
										<History className="w-3.5 h-3.5 text-yellow-400" />
										EVOLUÇÃO ({anoAnterior} ➔ {anoAtual})
									</span>
									<span
										className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider border flex items-center gap-1 ${
											variacaoPercentual > 50
												? "bg-amber-950/60 text-amber-300 border-amber-500/60"
												: variacaoPercentual >= 0
													? "bg-yellow-950/40 text-yellow-300 border-yellow-500/40"
													: "bg-emerald-950/40 text-emerald-300 border-emerald-500/40"
										}`}
									>
										{variacaoPercentual >= 0 ? (
											<TrendingUp className="w-3 h-3" />
										) : (
											<TrendingDown className="w-3 h-3" />
										)}
										{variacaoPercentual > 0 ? "+" : ""}
										{variacaoPercentual.toLocaleString("pt-BR", {
											maximumFractionDigits: 1,
										})}
										%
									</span>
								</div>

								<div className="grid grid-cols-2 gap-2 text-xs">
									<div className="p-2 border border-yellow-950 bg-black/60">
										<p className="text-[10px] uppercase font-bold text-yellow-600">
											Eleição {anoAnterior}
										</p>
										<p className="font-mono text-yellow-300 font-bold mt-0.5 text-xs">
											R${" "}
											{patrimonioAnt.toLocaleString("pt-BR", {
												minimumFractionDigits: 2,
											})}
										</p>
									</div>
									<div className="p-2 border border-yellow-950 bg-black/60">
										<p className="text-[10px] uppercase font-bold text-yellow-600">
											Diferença Nominal
										</p>
										<p
											className={`font-mono font-bold mt-0.5 text-xs ${variacaoNominal >= 0 ? "text-amber-300" : "text-emerald-300"}`}
										>
											{variacaoNominal >= 0 ? "+" : ""}R${" "}
											{variacaoNominal.toLocaleString("pt-BR", {
												minimumFractionDigits: 2,
											})}
										</p>
									</div>
								</div>

								{multiplo && (
									<p className="text-xs text-yellow-400/90 leading-relaxed italic">
										&gt; O patrimônio declarado cresceu{" "}
										<span className="font-bold text-yellow-300">
											{multiplo}x
										</span>{" "}
										em relação à eleição de {anoAnterior}.
									</p>
								)}
							</div>
						)}
					</div>

					{/* 3. HISTÓRICO DE TODAS AS ELEIÇÕES */}
					{historico.length > 1 && (
						<div className="space-y-1.5">
							<p className="text-xs uppercase font-bold text-green-500 flex items-center gap-1.5">
								<History className="w-3.5 h-3.5 text-green-400" />
								HISTÓRICO POR ELEIÇÃO ({historico.length})
							</p>
							<div className="border border-green-950 divide-y divide-green-950 bg-black/60 text-xs">
								{historico.map((h: any, idx: number) => (
									<div
										key={idx}
										className="p-2.5 flex items-center justify-between gap-2"
									>
										<div className="min-w-0">
											<span className="font-bold text-green-400 text-xs">
												{h.ano}
											</span>
											<span className="text-xs text-green-600 ml-2">
												{h.cargo || "Candidato"}
											</span>
											{h.partido && (
												<span className="text-[10px] text-green-500/80 ml-1.5 font-bold uppercase">
													({h.partido})
												</span>
											)}
										</div>
										<span className="font-mono font-bold text-yellow-400 shrink-0 text-xs">
											R${" "}
											{Number(h.patrimonioTotal || 0).toLocaleString("pt-BR", {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* 4. LISTA EXPANSÍVEL DE BENS DECLARADOS */}
					{bens.length > 0 && (
						<details className="group border border-yellow-900/40 bg-black/60 p-3 text-xs">
							<summary className="cursor-pointer font-bold uppercase tracking-wider text-yellow-500 flex items-center justify-between list-none text-xs">
								<span className="flex items-center gap-1.5">
									<Layers className="w-3.5 h-3.5 text-yellow-400" />
									BENS DECLARADOS NO TSE ({bens.length})
								</span>
								<span className="text-xs text-yellow-600 group-open:rotate-180 transition-transform font-bold">
									▼
								</span>
							</summary>
							<div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
								{bens.map((b: any, bIdx: number) => (
									<div
										key={bIdx}
										className="p-2 border border-yellow-950 bg-yellow-950/10 text-xs flex justify-between gap-2"
									>
										<div className="min-w-0 flex-1">
											<p className="font-bold text-yellow-300 text-xs truncate">
												{b.descricao || b.tipoBem || "Ativo Patrimonial"}
											</p>
											{b.descricaoDeTalhada &&
												b.descricaoDeTalhada !== b.descricao && (
													<p className="text-xs text-yellow-500/80 mt-0.5 leading-tight">
														{b.descricaoDeTalhada}
													</p>
												)}
										</div>
										<span className="font-mono font-bold text-yellow-400 shrink-0 text-xs ml-2">
											R${" "}
											{Number(b.valor || 0).toLocaleString("pt-BR", {
												minimumFractionDigits: 2,
											})}
										</span>
									</div>
								))}
							</div>
						</details>
					)}
				</div>
			)}

			{/* 5. ALERTAS E CADASTRO DE INIDÔNEOS */}
			{alertas.length > 0 && (
				<div className="space-y-2">
					<p className="text-xs uppercase font-bold text-red-500 border-b border-red-900/60 pb-1 flex items-center gap-1.5">
						<ShieldAlert className="w-4 h-4 text-red-500" />
						ALERTAS E CADASTRO DE INIDÔNEOS (CGU / TSE / DATAJUD)
					</p>
					<ul className="space-y-1.5">
						{alertas.map((alerta: string, idx: number) => (
							<li
								key={idx}
								className="flex gap-2 text-xs text-red-400 font-bold bg-red-950/20 border border-red-950 p-2 leading-relaxed"
							>
								<ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
								<span className="leading-snug">{alerta}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{/* 6. BOTÃO DE PERFIL COMPLETO */}
			{isDeputadoFederal && deputyId && (
				<div className="pt-2">
					<Button
						variant="outline"
						className="w-full h-11 border-green-500 bg-green-950/30 hover:bg-green-500 hover:text-black text-green-400 font-bold uppercase tracking-wider text-xs rounded-none transition-colors"
						asChild
					>
						<Link
							href={`/perfil/deputado/${deputyId}?nome=${encodeURIComponent(data.label || "")}&partido=${encodeURIComponent(data.partido || "")}&uf=${encodeURIComponent(data.uf || "")}&foto=${encodeURIComponent(data.foto || data.fotoFallback || "")}`}
						>
							<ExternalLink className="w-3.5 h-3.5 mr-2" />
							IR PARA PERFIL COMPLETO
						</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
