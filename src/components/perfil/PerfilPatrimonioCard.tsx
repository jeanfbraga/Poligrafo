"use client";

import { useMemo, useState } from "react";
import { DollarSign, Layers, TrendingUp, TrendingDown, History, Search } from "lucide-react";
import { TerminalWindow } from "@/components/ui/terminal";

interface BemItem {
	ordem?: number;
	descricao?: string;
	descricaoDeTipoDeBem?: string;
	tipoBem?: string;
	valor?: number;
	dataUltimaAtualizacao?: string;
}

interface TsePerfilData {
	patrimonioTotal?: number;
	anoEleicao?: number;
	bensDeclarados?: BemItem[];
	patrimonioAnterior?: number;
	anoPatrimonioAnterior?: number;
	variacaoPatrimonio?: number;
	variacaoPatrimonioPercentual?: number;
	historicoPatrimonio?: any[];
}

function formatarMoeda(val?: number): string {
	if (val === undefined || val === null || isNaN(val)) return "R$ 0,00";
	return `R$ ${Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function getVariacaoClass(variacao?: number): string {
	if (variacao === undefined || variacao === 0) {
		return "bg-yellow-950/40 text-yellow-400 border-yellow-800";
	}
	if (variacao > 0) {
		return "bg-red-950/50 text-red-300 border-red-700";
	}
	return "bg-green-950/50 text-green-300 border-green-700";
}

function EvolucaoPatrimonialBadge({
	variacao,
	anoAnterior,
	valorAnterior,
}: {
	variacao?: number;
	anoAnterior?: number;
	valorAnterior?: number;
}) {
	if (variacao === undefined || anoAnterior === undefined) return null;
	const isPositivo = variacao > 0;
	const sinal = isPositivo ? "+" : "";
	const Icon = isPositivo ? TrendingUp : TrendingDown;

	return (
		<div className="flex flex-wrap items-center gap-2 text-xs font-mono">
			<span className={`inline-flex items-center gap-1 px-2 py-0.5 border text-xs font-bold ${getVariacaoClass(variacao)}`}>
				<Icon className="w-3.5 h-3.5" />
				{sinal}{variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
			</span>
			<span className="text-yellow-600/80 text-[11px] font-bold">
				vs {anoAnterior} ({formatarMoeda(valorAnterior)})
			</span>
		</div>
	);
}

function ListaBensFiltrada({
	bens,
	filtro,
}: {
	bens: BemItem[];
	filtro: string;
}) {
	const bensFiltrados = useMemo(() => {
		if (!filtro.trim()) return bens;
		const termo = filtro.toLowerCase().trim();
		return bens.filter((b) => {
			const desc = (b.descricao || "").toLowerCase();
			const tipo = (b.descricaoDeTipoDeBem || b.tipoBem || "").toLowerCase();
			return desc.includes(termo) || tipo.includes(termo);
		});
	}, [bens, filtro]);

	if (bensFiltrados.length === 0) {
		return (
			<p className="text-xs text-yellow-600/70 italic p-3 border border-yellow-950 bg-black/40">
				Nenhum bem corresponde ao filtro de busca.
			</p>
		);
	}

	return (
		<div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
			{bensFiltrados.map((b, i) => {
				const tipo = b.descricaoDeTipoDeBem || b.tipoBem;
				return (
					<div
						key={i}
						className="p-2.5 border border-yellow-950/80 bg-black/60 hover:border-yellow-700/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
					>
						<div className="min-w-0 flex-1">
							<p className="text-xs font-bold text-yellow-300 leading-snug break-words">
								{b.descricao || "Ativo Patrimonial"}
							</p>
							{tipo && (
								<span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-yellow-950/50 border border-yellow-900/50 text-yellow-500 font-bold uppercase tracking-wider">
									{tipo}
								</span>
							)}
						</div>
						<div className="text-left sm:text-right shrink-0">
							<span className="text-xs font-bold font-mono text-yellow-400">
								{formatarMoeda(b.valor)}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export default function PerfilPatrimonioCard({
	tse,
}: {
	tse?: TsePerfilData | null;
}) {
	const [filtro, setFiltro] = useState("");
	const bens = tse?.bensDeclarados || [];
	const temPatrimonio = tse?.patrimonioTotal !== undefined && tse.patrimonioTotal > 0;
	const anoEleicao = tse?.anoEleicao || 2026;

	return (
		<TerminalWindow
			title="PATRIMÔNIO DECLARADO & BENS"
			icon={<DollarSign className="w-5 h-5 text-yellow-400" />}
			badge={`TSE ${anoEleicao}`}
			className="border-yellow-500/40 bg-black/70"
			scanline={false}
		>
			<div className="space-y-4 text-left">
				{/* Header com Valor Principal */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-yellow-950/15 border border-yellow-900/40">
					<div>
						<p className="text-[11px] uppercase font-bold text-yellow-600 tracking-wider flex items-center gap-1.5">
							<History className="w-3.5 h-3.5 text-yellow-400" />
							Total de Bens Declarados ({anoEleicao})
						</p>
						<p className="text-2xl sm:text-3xl font-bold font-mono text-yellow-400 tracking-wider mt-1">
							{temPatrimonio ? formatarMoeda(tse?.patrimonioTotal) : "NÃO LOCALIZADO"}
						</p>
					</div>

					{temPatrimonio && (
						<EvolucaoPatrimonialBadge
							variacao={tse?.variacaoPatrimonioPercentual}
							anoAnterior={tse?.anoPatrimonioAnterior}
							valorAnterior={tse?.patrimonioAnterior}
						/>
					)}
				</div>

				{/* Seção de Bens Detalhados */}
				{bens.length > 0 ? (
					<div className="space-y-3">
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-yellow-900/30 pb-2">
							<h3 className="text-xs uppercase font-bold text-yellow-400 flex items-center gap-1.5 tracking-wider">
								<Layers className="w-3.5 h-3.5" />
								Relação de Ativos ({bens.length})
							</h3>

							{bens.length > 4 && (
								<div className="relative w-full sm:w-60">
									<Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-yellow-600" />
									<input
										type="text"
										placeholder="Filtrar bens..."
										value={filtro}
										onChange={(e) => setFiltro(e.target.value)}
										className="w-full bg-black border border-yellow-900/50 pl-8 pr-2 py-1 text-xs text-yellow-300 placeholder:text-yellow-700 font-mono focus:outline-hidden focus:border-yellow-500"
									/>
								</div>
							)}
						</div>

						<ListaBensFiltrada bens={bens} filtro={filtro} />
					</div>
				) : (
					<div className="p-3 border border-yellow-950 bg-black/40 text-xs text-yellow-600/80 italic">
						Nenhum bem individual detalhado disponível para a declaração de {anoEleicao}.
					</div>
				)}
			</div>
		</TerminalWindow>
	);
}
