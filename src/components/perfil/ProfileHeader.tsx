"use client";

import { useMemo } from "react";
import { MapPin, Briefcase, Users, Hash, Layers, ArrowUpRight } from "lucide-react";
import { TerminalWindow } from "@/components/ui/terminal";
import { Badge } from "@/components/ui/badge";
import FrentesComissoesDialog from "@/components/perfil/FrentesComissoesDialog";
import {
	formatarNomeFrente,
	formatarComissao,
	agruparFrentesPorTema,
	ComissaoFormatada,
	FrenteFormatada,
} from "@/lib/parlamentar-utils";

export default function ProfileHeader({
	perfil,
	idDeputado,
}: {
	perfil: any;
	idDeputado: string;
}) {
	const frentesLista = useMemo(
		() => (perfil ? perfil.frentes || perfil.frentes_parlamentares || [] : []),
		[perfil],
	);
	const comissoesLista = useMemo(
		() => (perfil ? perfil.comissoes || [] : []),
		[perfil],
	);
	const profissoesLista = useMemo(
		() =>
			perfil
				? (perfil.profissoes || []).filter(
						(p: any) => p && typeof p === "string" && p.trim() !== "",
				  )
				: [],
		[perfil],
	);

	const comissoesFormatadas: ComissaoFormatada[] = useMemo(() => {
		return comissoesLista
			.map(formatarComissao)
			.sort((a: ComissaoFormatada, b: ComissaoFormatada) => {
				if (a.destaque && !b.destaque) return -1;
				if (!a.destaque && b.destaque) return 1;
				return a.nome.localeCompare(b.nome);
			});
	}, [comissoesLista]);

	const frentesFormatadas: FrenteFormatada[] = useMemo(() => {
		return frentesLista.map(formatarNomeFrente);
	}, [frentesLista]);

	if (!perfil) {
		return (
			<TerminalWindow>
				<p className="text-yellow-500 font-mono text-sm uppercase font-bold">&gt; ALERTA: Ficha base não encontrada na base local.</p>
			</TerminalWindow>
		);
	}

	const topComissoes = comissoesFormatadas.slice(0, 3);
	const totalComissoes = comissoesFormatadas.length;

	const topFrentes = frentesFormatadas.slice(0, 6);
	const totalFrentes = frentesFormatadas.length;

	const nomeExibicao =
		perfil.nome_eleitoral || perfil.nome_civil || "NOME NÃO INFORMADO";

	return (
		<TerminalWindow className="p-3 sm:p-6 md:p-8 border-green-500/50">
			<div className="flex flex-col md:flex-row gap-5 md:gap-6 items-center md:items-start text-center md:text-left">
				{/* Foto Oficial com Cantoneiras Hacker OSINT */}
				<div className="shrink-0">
					<div className="w-28 h-36 sm:w-32 sm:h-40 border-2 border-green-500/60 p-1 relative bg-black/80">
						<img
							src={`https://www.camara.leg.br/internet/deputado/bandep/${idDeputado}.jpg`}
							alt="Foto Oficial"
							className="w-full h-full object-cover"
						/>
						{/* Corner accents */}
						<div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-green-500"></div>
						<div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-green-500"></div>
						<div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-green-500"></div>
						<div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-green-500"></div>
					</div>
				</div>

				<div className="flex-1 space-y-4 min-w-0 w-full">
					{/* Cabeçalho do Parlamentar */}
					<div className="border-b border-green-500/30 pb-3 flex flex-col lg:flex-row lg:items-start justify-between gap-3.5">
						<div className="min-w-0">
							<h1 className="text-xl sm:text-2xl font-bold uppercase text-green-400 tracking-wider truncate">
								{nomeExibicao}
							</h1>
							{perfil.nome_civil && perfil.nome_civil !== nomeExibicao && (
								<p className="text-xs font-bold text-green-600 uppercase tracking-wide truncate mt-0.5">
									{perfil.nome_civil}
								</p>
							)}
							<div className="flex items-center justify-center md:justify-start gap-2.5 mt-2 flex-wrap">
								<span className="px-2.5 py-0.5 bg-green-500/15 border border-green-500/40 text-green-300 text-xs font-bold uppercase tracking-wider">
									{perfil.partido || "S/PARTIDO"}
								</span>
								<span className="flex items-center gap-1 text-green-400 text-xs sm:text-sm font-bold uppercase">
									<MapPin className="w-3.5 h-3.5 text-green-500" /> {perfil.uf || "BR"}
								</span>
								<span className="text-[11px] font-bold text-green-600 uppercase font-mono tracking-wider">
									ID CÂMARA: {idDeputado}
								</span>
							</div>
						</div>

						{/* Ações Táticas Responsivas */}
						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
							<FrentesComissoesDialog
								comissoes={comissoesLista}
								frentes={frentesLista}
								profissoes={profissoesLista}
								nomePolitico={nomeExibicao}
								partido={perfil.partido}
								uf={perfil.uf}
							/>

							<a
								href={`/?alvo=${encodeURIComponent(nomeExibicao)}&ref=${encodeURIComponent(`FEDERAL:CAMARA:${idDeputado}`)}`}
								className="inline-flex items-center justify-center gap-2 px-3.5 py-2 sm:py-1.5 bg-green-500/15 hover:bg-green-500/25 border border-green-500/60 text-green-300 hover:text-green-200 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap min-h-[38px] sm:min-h-0"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<circle cx="11" cy="11" r="8" />
									<path d="m21 21-4.3-4.3" />
								</svg>
								Investigar no Grafo
							</a>
						</div>
					</div>

					{/* Grade de Formação e Comissões */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-sm text-left">
						{/* 1. Formação / Profissão */}
						{profissoesLista.length > 0 && (
							<div className="p-3 bg-black/60 border border-green-500/30 space-y-2">
								<h3 className="text-green-400 uppercase text-xs font-bold flex items-center gap-1.5 tracking-wider">
									<Briefcase className="w-3.5 h-3.5 text-green-500" /> Formação / Profissão
								</h3>
								<div className="flex flex-wrap gap-1.5">
									{profissoesLista.map((p: string, i: number) => (
										<span
											key={i}
											className="px-2 py-0.5 bg-green-950/40 border border-green-800 text-green-300 text-xs font-bold font-mono uppercase tracking-wide"
											title={p}
										>
											{p}
										</span>
									))}
								</div>
							</div>
						)}

						{/* 2. Comissões com Siglas e Hierarquia de Cargo */}
						{totalComissoes > 0 && (
							<div className="p-3 bg-black/60 border border-green-500/30 space-y-2">
								<div className="flex items-center justify-between">
									<h3 className="text-green-400 uppercase text-xs font-bold flex items-center gap-1.5 tracking-wider">
										<Users className="w-3.5 h-3.5 text-green-500" /> Comissões Ativas ({totalComissoes})
									</h3>

									{totalComissoes > 3 && (
										<FrentesComissoesDialog
											comissoes={comissoesLista}
											frentes={frentesLista}
											profissoes={profissoesLista}
											nomePolitico={nomeExibicao}
											partido={perfil.partido}
											uf={perfil.uf}
											initialTab="comissoes"
											trigger={
												<button className="text-[11px] font-bold text-green-400 hover:text-green-300 underline uppercase tracking-wider">
													+ {totalComissoes - 3} Outras
												</button>
											}
										/>
									)}
								</div>

								<div className="space-y-1.5">
									{topComissoes.map((c: ComissaoFormatada, i: number) => (
										<div
											key={i}
											className="flex items-center justify-between gap-2 p-2 bg-black border border-green-500/25 text-xs"
											title={c.raw}
										>
											<div className="flex items-center gap-1.5 truncate min-w-0">
												{c.sigla && (
													<span className="px-1.5 py-0.5 bg-green-950 border border-green-700 text-green-400 font-bold text-[11px] uppercase tracking-wider shrink-0">
														{c.sigla}
													</span>
												)}
												<span className="text-green-300 truncate font-mono text-xs font-bold">
													{c.nome}
												</span>
											</div>

											{c.cargo && (
												<span
													className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border shrink-0 ${
														c.cargo === "Presidente"
															? "bg-green-500/30 text-green-200 border-green-400"
															: c.cargo === "Vice-Presidente" || c.cargo === "Relator"
															? "bg-emerald-950/80 text-emerald-300 border-emerald-500"
															: "bg-black text-green-400 border-green-800"
													}`}
												>
													{c.cargo}
												</span>
											)}
										</div>
									))}
								</div>
							</div>
						)}
					</div>

					{/* 3. Frentes Parlamentares com Chips Limpos e Eixos Temáticos */}
					{totalFrentes > 0 && (
						<div className="p-3 bg-black/60 border border-green-500/30 space-y-2 text-left">
							<div className="flex items-center justify-between flex-wrap gap-1">
								<h3 className="text-green-400 uppercase text-xs font-bold flex items-center gap-1.5 tracking-wider">
									<Hash className="w-3.5 h-3.5 text-green-500" /> Frentes Parlamentares ({totalFrentes})
								</h3>

								<FrentesComissoesDialog
									comissoes={comissoesLista}
									frentes={frentesLista}
									profissoes={profissoesLista}
									nomePolitico={nomeExibicao}
									partido={perfil.partido}
									uf={perfil.uf}
									initialTab="temas"
									trigger={
										<button className="text-[11px] font-bold text-green-400 hover:text-green-300 underline uppercase tracking-wider flex items-center gap-1">
											<Layers className="w-3 h-3" />
											Ver Eixos Temáticos ({totalFrentes})
										</button>
									}
								/>
							</div>

							<div className="flex flex-wrap gap-1.5">
								{topFrentes.map((f: FrenteFormatada, i: number) => (
									<span
										key={i}
										className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black border border-green-500/40 text-green-300 text-xs font-bold hover:border-green-400 transition-colors"
										title={f.raw}
									>
										{f.sigla && (
											<span className="text-[11px] font-bold uppercase tracking-wider text-green-400 bg-green-950 px-1 border border-green-800">
												{f.sigla}
											</span>
										)}
										<span className="truncate max-w-44 sm:max-w-64">{f.label}</span>
										{f.isMista && (
											<span className="text-[11px] text-green-400 uppercase font-bold tracking-wider px-1 bg-green-950 border border-green-900">
												Mista
											</span>
										)}
									</span>
								))}

								{totalFrentes > 6 && (
									<FrentesComissoesDialog
										comissoes={comissoesLista}
										frentes={frentesLista}
										profissoes={profissoesLista}
										nomePolitico={nomeExibicao}
										partido={perfil.partido}
										uf={perfil.uf}
										initialTab="frentes"
										trigger={
											<button className="px-2.5 py-1 bg-green-950/50 border border-green-500/50 text-green-300 hover:text-green-200 text-xs font-bold uppercase tracking-wider transition-colors">
												+ {totalFrentes - 6} Outras
											</button>
										}
									/>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</TerminalWindow>
	);
}
