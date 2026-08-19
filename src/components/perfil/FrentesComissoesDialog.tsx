"use client";

import React, { useState, useMemo } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Search,
	Users,
	Hash,
	Layers,
	Sprout,
	TrendingUp,
	Shield,
	HeartPulse,
	GraduationCap,
	Scale,
	Landmark,
	Globe,
	Sparkles,
} from "lucide-react";
import {
	formatarNomeFrente,
	formatarComissao,
	agruparFrentesPorTema,
	FrenteFormatada,
	ComissaoFormatada,
} from "@/lib/parlamentar-utils";

interface FrentesComissoesDialogProps {
	comissoes?: (string | any)[];
	frentes?: (string | any)[];
	profissoes?: (string | any)[];
	nomePolitico?: string;
	partido?: string;
	uf?: string;
	trigger?: React.ReactNode;
	initialTab?: "frentes" | "comissoes" | "temas";
}

const TEMA_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
	"Agro & Meio Ambiente": Sprout,
	"Economia & Mercado": TrendingUp,
	"Segurança & Defesa": Shield,
	"Saúde & Assistência": HeartPulse,
	"Educação & Ciência": GraduationCap,
	"Direitos & Cidadania": Scale,
	"Gestão Pública & Carreiras": Landmark,
	"Outras Pautas": Globe,
};

const TEMA_CODES: Record<string, string> = {
	"Agro & Meio Ambiente": "AGRO",
	"Economia & Mercado": "ECON",
	"Segurança & Defesa": "SEG",
	"Saúde & Assistência": "SAÚDE",
	"Educação & Ciência": "EDU",
	"Direitos & Cidadania": "DIR",
	"Gestão Pública & Carreiras": "PUB",
	"Outras Pautas": "GERAL",
};

export default function FrentesComissoesDialog({
	comissoes = [],
	frentes = [],
	profissoes = [],
	nomePolitico = "Parlamentar",
	partido,
	uf,
	trigger,
	initialTab = "temas",
}: FrentesComissoesDialogProps) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<"temas" | "frentes" | "comissoes">(initialTab);
	const [search, setSearch] = useState("");

	// Normaliza listas
	const comissoesFormatadas: ComissaoFormatada[] = useMemo(() => {
		return (comissoes || [])
			.filter(Boolean)
			.map(formatarComissao)
			.sort((a, b) => {
				if (a.destaque && !b.destaque) return -1;
				if (!a.destaque && b.destaque) return 1;
				return a.nome.localeCompare(b.nome);
			});
	}, [comissoes]);

	const frentesFormatadas: FrenteFormatada[] = useMemo(() => {
		return (frentes || [])
			.filter(Boolean)
			.map(formatarNomeFrente)
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [frentes]);

	// Agrupamento temático
	const gruposTematicos = useMemo(() => {
		return agruparFrentesPorTema(frentes || []);
	}, [frentes]);

	// Filtros dinâmicos de busca
	const frentesFiltradas = useMemo(() => {
		if (!search.trim()) return frentesFormatadas;
		const s = search.toLowerCase();
		return frentesFormatadas.filter(
			(f) =>
				f.label.toLowerCase().includes(s) ||
				f.raw.toLowerCase().includes(s) ||
				f.tema.toLowerCase().includes(s) ||
				(f.sigla && f.sigla.toLowerCase().includes(s)),
		);
	}, [frentesFormatadas, search]);

	const comissoesFiltradas = useMemo(() => {
		if (!search.trim()) return comissoesFormatadas;
		const s = search.toLowerCase();
		return comissoesFormatadas.filter(
			(c) =>
				c.nome.toLowerCase().includes(s) ||
				c.raw.toLowerCase().includes(s) ||
				(c.sigla && c.sigla.toLowerCase().includes(s)) ||
				(c.cargo && c.cargo.toLowerCase().includes(s)),
		);
	}, [comissoesFormatadas, search]);

	const totalFrentes = frentesFormatadas.length;
	const totalComissoes = comissoesFormatadas.length;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger || (
					<Button
						variant="outline"
						size="sm"
						className="h-9 sm:h-8 w-full sm:w-auto border-green-500/50 bg-green-950/30 text-green-300 hover:bg-green-500/20 text-xs font-mono font-bold uppercase tracking-wider rounded-none transition-colors"
					>
						<Layers className="w-4 h-4 mr-2 text-green-400" />
						Raio-X de Atuação ({totalComissoes + totalFrentes})
					</Button>
				)}
			</DialogTrigger>

			<DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90vh] sm:max-h-[85vh] flex flex-col p-0 border-2 border-green-500/70 bg-black text-green-400 font-mono shadow-[0_0_35px_rgba(34,197,94,0.2)] rounded-none">
				{/* Top Header */}
				<DialogHeader className="p-3.5 sm:p-5 pb-3 border-b border-green-500/30">
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
						<div className="min-w-0">
							<div className="flex items-center gap-2 text-xs font-bold text-green-500 uppercase tracking-widest">
								<Layers className="w-3.5 h-3.5 text-green-400" />
								Raio-X Parlamentar • Colegiados & Frentes
							</div>
							<DialogTitle className="text-base sm:text-xl font-bold uppercase text-green-300 tracking-wider mt-1 truncate">
								{nomePolitico} {partido ? `(${partido}-${uf})` : ""}
							</DialogTitle>
						</div>

						{/* Metric Badges */}
						<div className="flex items-center gap-2 shrink-0">
							<Badge
								variant="outline"
								className="rounded-none border-green-500/50 bg-green-950/40 text-green-300 text-xs font-bold uppercase tracking-wider py-1 px-2.5"
							>
								{totalComissoes} {totalComissoes === 1 ? "Comissão" : "Comissões"}
							</Badge>
							<Badge
								variant="outline"
								className="rounded-none border-green-500/50 bg-green-950/40 text-green-300 text-xs font-bold uppercase tracking-wider py-1 px-2.5"
							>
								{totalFrentes} {totalFrentes === 1 ? "Frente" : "Frentes"}
							</Badge>
						</div>
					</div>

					{/* Navigation Tabs (Mobile-Friendly Scroll) */}
					<div className="flex items-center gap-1.5 mt-3 border-b border-green-900/50 pb-2 overflow-x-auto">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setTab("temas")}
							className={`h-8 sm:h-7 px-3 text-xs uppercase font-bold tracking-wider rounded-none shrink-0 transition-colors ${
								tab === "temas"
									? "bg-green-500/25 text-green-300 border border-green-500"
									: "text-green-500/80 hover:text-green-300 hover:bg-green-950/40"
							}`}
						>
							<Layers className="w-3.5 h-3.5 mr-1.5 text-green-400" />
							Eixos Temáticos ({Object.keys(gruposTematicos).length})
						</Button>

						<Button
							variant="ghost"
							size="sm"
							onClick={() => setTab("comissoes")}
							className={`h-8 sm:h-7 px-3 text-xs uppercase font-bold tracking-wider rounded-none shrink-0 transition-colors ${
								tab === "comissoes"
									? "bg-green-500/25 text-green-300 border border-green-500"
									: "text-green-500/80 hover:text-green-300 hover:bg-green-950/40"
							}`}
						>
							<Users className="w-3.5 h-3.5 mr-1.5 text-green-400" />
							Comissões ({totalComissoes})
						</Button>

						<Button
							variant="ghost"
							size="sm"
							onClick={() => setTab("frentes")}
							className={`h-8 sm:h-7 px-3 text-xs uppercase font-bold tracking-wider rounded-none shrink-0 transition-colors ${
								tab === "frentes"
									? "bg-green-500/25 text-green-300 border border-green-500"
									: "text-green-500/80 hover:text-green-300 hover:bg-green-950/40"
							}`}
						>
							<Hash className="w-3.5 h-3.5 mr-1.5 text-green-400" />
							Todas as Frentes ({totalFrentes})
						</Button>
					</div>

					{/* Instant Search Bar */}
					<div className="relative mt-2.5">
						<Search className="w-4 h-4 text-green-500 absolute left-3 top-1/2 -translate-y-1/2" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Filtrar por palavra-chave, CCJC, agro, saúde, armas..."
							className="pl-9 h-10 sm:h-9 text-xs bg-black border-green-500/40 text-green-300 placeholder:text-green-600/70 focus-visible:border-green-400"
						/>
						{search && (
							<button
								onClick={() => setSearch("")}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-green-400 hover:text-green-300 uppercase tracking-wider"
							>
								[Limpar]
							</button>
						)}
					</div>
				</DialogHeader>

				{/* Scrollable Content Body */}
				<div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-5">
					{/* VIEW: EIXOS TEMÁTICOS */}
					{tab === "temas" && (
						<div className="space-y-4">
							{Object.keys(gruposTematicos).length === 0 ? (
								<p className="text-xs font-bold text-green-500 uppercase tracking-wider italic">
									Nenhuma frente parlamentar registrada para este perfil.
								</p>
							) : (
								Object.entries(gruposTematicos).map(([tema, items]) => {
									const filtrados = search.trim()
										? items.filter(
												(i) =>
													i.label.toLowerCase().includes(search.toLowerCase()) ||
													i.raw.toLowerCase().includes(search.toLowerCase()) ||
													(i.sigla && i.sigla.toLowerCase().includes(search.toLowerCase())),
										  )
										: items;

									if (filtrados.length === 0) return null;

									const ThemeIcon = TEMA_ICONS[tema] || Globe;
									const themeCode = TEMA_CODES[tema] || "GERAL";

									return (
										<div
											key={tema}
											className="border border-green-500/30 bg-green-950/15 p-3 sm:p-4 space-y-3"
										>
											<div className="flex items-center justify-between border-b border-green-900/50 pb-2">
												<div className="flex items-center gap-2 min-w-0">
													<div className="w-6 h-6 border border-green-500/40 bg-black flex items-center justify-center shrink-0">
														<ThemeIcon className="w-3.5 h-3.5 text-green-400" />
													</div>
													<h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-green-300 truncate">
														[{themeCode}] {tema}
													</h4>
												</div>
												<span className="text-[11px] font-bold uppercase tracking-wider text-green-400 shrink-0 ml-2">
													{filtrados.length} {filtrados.length === 1 ? "frente" : "frentes"}
												</span>
											</div>

											<div className="flex flex-wrap gap-2 pt-0.5">
												{filtrados.map((f, idx) => (
													<span
														key={idx}
														title={f.raw}
														className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black border border-green-500/40 text-green-300 text-xs font-bold hover:border-green-400 hover:bg-green-950/40 transition-colors cursor-default"
													>
														{f.sigla && (
															<span className="text-[11px] font-bold uppercase tracking-wider text-green-400 bg-green-950 px-1.5 py-0.5 border border-green-800">
																{f.sigla}
															</span>
														)}
														<span className="truncate max-w-60 sm:max-w-85">{f.label}</span>
														{f.isMista && (
															<span className="text-[11px] text-green-400 uppercase font-bold tracking-wider px-1 bg-green-950 border border-green-900">
																Mista
															</span>
														)}
													</span>
												))}
											</div>
										</div>
									);
								})
							)}
						</div>
					)}

					{/* VIEW: COMISSÕES */}
					{tab === "comissoes" && (
						<div className="space-y-3">
							{comissoesFiltradas.length === 0 ? (
								<p className="text-xs font-bold text-green-500 uppercase tracking-wider italic">
									Nenhuma comissão encontrada com os filtros atuais.
								</p>
							) : (
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									{comissoesFiltradas.map((c, idx) => (
										<div
											key={idx}
											className={`p-3 sm:p-3.5 border transition-all space-y-2.5 ${
												c.destaque
													? "border-green-400 bg-green-950/30 shadow-[0_0_15px_rgba(34,197,94,0.15)]"
													: "border-green-500/30 bg-black/80 hover:border-green-500/60"
											}`}
										>
											<div className="flex items-start justify-between gap-2">
												<div className="flex items-center gap-1.5">
													{c.sigla ? (
														<Badge
															variant="outline"
															className="rounded-none border-green-500 bg-green-950 text-green-300 font-bold text-xs uppercase tracking-wider shrink-0 px-2 py-0.5"
														>
															{c.sigla}
														</Badge>
													) : (
														<Badge
															variant="outline"
															className="rounded-none border-green-900 bg-black text-green-400 text-[11px] font-bold uppercase tracking-wider shrink-0 px-1.5 py-0.5"
														>
															{c.tipo}
														</Badge>
													)}
												</div>

												{c.cargo && (
													<span
														className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border ${
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

											<p className="text-xs sm:text-sm font-bold text-green-300 leading-snug" title={c.raw}>
												{c.nome}
											</p>

											<div className="pt-1.5 border-t border-green-900/40 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-green-500/80">
												<span>Tipo: {c.tipo}</span>
												<span className="truncate max-w-40 sm:max-w-52" title={c.raw}>
													{c.raw}
												</span>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* VIEW: TODAS AS FRENTES */}
					{tab === "frentes" && (
						<div className="space-y-2">
							{frentesFiltradas.length === 0 ? (
								<p className="text-xs font-bold text-green-500 uppercase tracking-wider italic">
									Nenhuma frente encontrada com o termo pesquisado.
								</p>
							) : (
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
									{frentesFiltradas.map((f, idx) => {
										const ThemeIcon = TEMA_ICONS[f.tema] || Globe;
										const themeCode = TEMA_CODES[f.tema] || "GERAL";

										return (
											<div
												key={idx}
												className="p-3 bg-black border border-green-500/30 hover:border-green-400 text-xs flex items-start justify-between gap-2.5 transition-colors"
												title={f.raw}
											>
												<div className="space-y-1.5 min-w-0">
													<div className="flex items-center gap-1.5 flex-wrap">
														{f.sigla && (
															<span className="text-[11px] font-bold uppercase tracking-wider text-green-400 bg-green-950 px-1.5 py-0.5 border border-green-800 shrink-0">
																{f.sigla}
															</span>
														)}
														<span className="font-bold text-green-300 truncate">
															{f.label}
														</span>
													</div>
													<div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-green-500">
														<ThemeIcon className="w-3 h-3 text-green-400 shrink-0" />
														<span>[{themeCode}] {f.tema}</span>
													</div>
												</div>

												{f.isMista && (
													<span className="text-[11px] text-green-400 uppercase font-bold tracking-wider shrink-0 border border-green-800 px-1.5 py-0.5 bg-green-950/60">
														Mista
													</span>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					)}
				</div>

				{/* Footer Bar */}
				<div className="p-3 bg-black border-t border-green-500/40 flex items-center justify-between text-xs text-green-500 font-bold uppercase tracking-wider">
					<span>Origem: Dados Abertos da Câmara</span>
					<span className="text-green-400">
						Polígrafo OSINT
					</span>
				</div>
			</DialogContent>
		</Dialog>
	);
}
