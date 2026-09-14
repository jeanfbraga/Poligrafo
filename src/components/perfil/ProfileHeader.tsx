"use client";

import { useMemo, useState } from "react";
import { MapPin, Briefcase, Users, Hash, Layers, ArrowUpRight, User } from "lucide-react";
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

function ProfileAvatar({ idDeputado, fotoUrl }: { idDeputado: string; fotoUrl?: string }) {
	const [attempt, setAttempt] = useState(0);
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
	const cleanId = idDeputado.replace(/^pessoa-/, "");

	// Fontes em ordem de prioridade:
	// 1. fotoUrl recebida via props/query
	// 2. Supabase Storage público
	// 3. Câmara Oficial
	const sources = useMemo(() => {
		const list: string[] = [];
		if (fotoUrl && fotoUrl.trim()) list.push(fotoUrl.trim());
		if (supabaseUrl && cleanId && /^\d+$/.test(cleanId)) {
			list.push(`${supabaseUrl}/storage/v1/object/public/fotos-politicos/${cleanId}.jpg`);
		}
		if (cleanId && /^\d+$/.test(cleanId)) {
			list.push(`https://www.camara.leg.br/internet/deputado/bandep/${cleanId}.jpg`);
		}
		return list;
	}, [fotoUrl, supabaseUrl, cleanId]);

	if (attempt >= sources.length) {
		return (
			<div className="w-full h-full flex flex-col items-center justify-center bg-green-950/20 text-green-500">
				<User className="w-12 h-12 opacity-50" />
				<span className="text-[10px] uppercase font-bold text-green-700 mt-1">SEM FOTO</span>
			</div>
		);
	}

	return (
		<img
			key={sources[attempt]}
			src={sources[attempt]}
			alt="Foto Oficial"
			className="w-full h-full object-cover"
			onError={() => setAttempt((prev) => prev + 1)}
		/>
	);
}

function compareComissoes(a: ComissaoFormatada, b: ComissaoFormatada): number {
	if (a.destaque && !b.destaque) return -1;
	if (!a.destaque && b.destaque) return 1;
	return a.nome.localeCompare(b.nome);
}

function getComissoesFormatadas(perfil: any): ComissaoFormatada[] {
	if (!perfil?.comissoes) return [];
	return perfil.comissoes.map(formatarComissao).sort(compareComissoes);
}

function getFrentesFormatadas(perfil: any): FrenteFormatada[] {
	if (!perfil) return [];
	const frentes = perfil.frentes || perfil.frentes_parlamentares || [];
	return frentes.map(formatarNomeFrente);
}

function getProfissoesLista(perfil: any): string[] {
	if (!perfil?.profissoes || !Array.isArray(perfil.profissoes)) return [];
	return perfil.profissoes.filter(
		(p: any) => typeof p === "string" && p.trim().length > 0
	);
}

function getNomeExibicao(perfil: any): string {
	return perfil?.nome_eleitoral || perfil?.nome_civil || "NOME NÃO INFORMADO";
}

function getCargoBadgeClass(cargo?: string): string {
	if (cargo === "Presidente") {
		return "bg-green-500/30 text-green-200 border-green-400";
	}
	if (cargo === "Vice-Presidente" || cargo === "Relator") {
		return "bg-emerald-950/80 text-emerald-300 border-emerald-500";
	}
	return "bg-black text-green-400 border-green-800";
}

interface DialogSharedProps {
	comissoes: any[];
	frentes: any[];
	profissoes: string[];
	nomePolitico: string;
	partido?: string;
	uf?: string;
}

function getMandatoBadgeStyle(situacao?: string): string {
	const sit = (situacao || "").toLowerCase();
	if (sit.includes("supl")) return "bg-amber-950/40 border-amber-600/60 text-amber-400";
	if (sit.includes("licen")) return "bg-blue-950/40 border-blue-600/60 text-blue-400";
	return "bg-green-950/40 border-green-600/60 text-green-400";
}

function ProfileMandatoBadge({ situacao, mandatoTexto }: { situacao?: string; mandatoTexto?: string }) {
	if (!mandatoTexto && !situacao) return null;
	const badgeClass = getMandatoBadgeStyle(situacao);

	return (
		<div className="flex items-center justify-center md:justify-start gap-2 mt-2.5 flex-wrap">
			<span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono border ${badgeClass}`}>
				{situacao || "MANDATO"}
			</span>
			{mandatoTexto && (
				<span className="text-xs text-yellow-400/90 font-mono font-medium">
					{mandatoTexto}
				</span>
			)}
		</div>
	);
}

function ProfileIdentityInfo({
	nomeExibicao,
	nomeCivil,
	partido,
	uf,
	idDeputado,
	situacao,
	mandatoTexto,
}: {
	nomeExibicao: string;
	nomeCivil?: string;
	partido?: string;
	uf?: string;
	idDeputado: string;
	situacao?: string;
	mandatoTexto?: string;
}) {
	const exibeNomeCivil = Boolean(nomeCivil && nomeCivil !== nomeExibicao);
	const partidoFormatado = partido || "S/PARTIDO";
	const ufFormatada = uf || "BR";

	return (
		<div className="min-w-0">
			<h1 className="text-xl sm:text-2xl font-bold uppercase text-green-400 tracking-wider truncate">
				{nomeExibicao}
			</h1>
			{exibeNomeCivil && (
				<p className="text-xs font-bold text-green-600 uppercase tracking-wide truncate mt-0.5">
					{nomeCivil}
				</p>
			)}
			<div className="flex items-center justify-center md:justify-start gap-2.5 mt-2 flex-wrap">
				<span className="px-2.5 py-0.5 bg-green-500/15 border border-green-500/40 text-green-300 text-xs font-bold uppercase tracking-wider">
					{partidoFormatado}
				</span>
				<span className="flex items-center gap-1 text-green-400 text-xs sm:text-sm font-bold uppercase">
					<MapPin className="w-3.5 h-3.5 text-green-500" /> {ufFormatada}
				</span>
				<span className="text-[11px] font-bold text-green-600 uppercase font-mono tracking-wider">
					ID CÂMARA: {idDeputado}
				</span>
			</div>
			<ProfileMandatoBadge situacao={situacao} mandatoTexto={mandatoTexto} />
		</div>
	);
}

function ProfileProfissoesSection({ profissoes }: { profissoes: string[] }) {
	if (profissoes.length === 0) return null;

	return (
		<div className="p-3 bg-black/60 border border-green-500/30 space-y-2">
			<h3 className="text-green-400 uppercase text-xs font-bold flex items-center gap-1.5 tracking-wider">
				<Briefcase className="w-3.5 h-3.5 text-green-500" /> Formação / Profissão
			</h3>
			<div className="flex flex-wrap gap-1.5">
				{profissoes.map((p, i) => (
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
	);
}

function ProfileComissoesSection({
	comissoesFormatadas,
	dialogProps,
}: {
	comissoesFormatadas: ComissaoFormatada[];
	dialogProps: DialogSharedProps;
}) {
	const total = comissoesFormatadas.length;
	if (total === 0) return null;

	const topComissoes = comissoesFormatadas.slice(0, 3);
	const temMais = total > 3;

	return (
		<div className="p-3 bg-black/60 border border-green-500/30 space-y-2">
			<div className="flex items-center justify-between">
				<h3 className="text-green-400 uppercase text-xs font-bold flex items-center gap-1.5 tracking-wider">
					<Users className="w-3.5 h-3.5 text-green-500" /> Comissões Ativas ({total})
				</h3>

				{temMais && (
					<FrentesComissoesDialog
						{...dialogProps}
						initialTab="comissoes"
						trigger={
							<button className="text-[11px] font-bold text-green-400 hover:text-green-300 underline uppercase tracking-wider">
								+ {total - 3} Outras
							</button>
						}
					/>
				)}
			</div>

			<div className="space-y-1.5">
				{topComissoes.map((c, i) => (
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
								className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 border shrink-0 ${getCargoBadgeClass(
									c.cargo
								)}`}
							>
								{c.cargo}
							</span>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

function ProfileFrentesSection({
	frentesFormatadas,
	dialogProps,
}: {
	frentesFormatadas: FrenteFormatada[];
	dialogProps: DialogSharedProps;
}) {
	const total = frentesFormatadas.length;
	if (total === 0) return null;

	const topFrentes = frentesFormatadas.slice(0, 6);
	const temMais = total > 6;

	return (
		<div className="p-3 bg-black/60 border border-green-500/30 space-y-2 text-left">
			<div className="flex items-center justify-between flex-wrap gap-1">
				<h3 className="text-green-400 uppercase text-xs font-bold flex items-center gap-1.5 tracking-wider">
					<Hash className="w-3.5 h-3.5 text-green-500" /> Frentes Parlamentares ({total})
				</h3>

				<FrentesComissoesDialog
					{...dialogProps}
					initialTab="temas"
					trigger={
						<button className="text-[11px] font-bold text-green-400 hover:text-green-300 underline uppercase tracking-wider flex items-center gap-1">
							<Layers className="w-3 h-3" />
							Ver Eixos Temáticos ({total})
						</button>
					}
				/>
			</div>

			<div className="flex flex-wrap gap-1.5">
				{topFrentes.map((f, i) => (
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

				{temMais && (
					<FrentesComissoesDialog
						{...dialogProps}
						initialTab="frentes"
						trigger={
							<button className="px-2.5 py-1 bg-green-950/50 border border-green-500/50 text-green-300 hover:text-green-200 text-xs font-bold uppercase tracking-wider transition-colors">
								+ {total - 6} Outras
							</button>
						}
					/>
				)}
			</div>
		</div>
	);
}

export default function ProfileHeader({
	perfil,
	idDeputado,
	fotoUrl,
}: {
	perfil: any;
	idDeputado: string;
	fotoUrl?: string;
}) {
	const profissoesLista = useMemo(() => getProfissoesLista(perfil), [perfil]);
	const comissoesFormatadas = useMemo(() => getComissoesFormatadas(perfil), [perfil]);
	const frentesFormatadas = useMemo(() => getFrentesFormatadas(perfil), [perfil]);

	if (!perfil) {
		return (
			<TerminalWindow>
				<p className="text-yellow-500 font-mono text-sm uppercase font-bold">&gt; ALERTA: Ficha base não encontrada na base local.</p>
			</TerminalWindow>
		);
	}

	const nomeExibicao = getNomeExibicao(perfil);
	const comissoesOriginais = perfil.comissoes || [];
	const frentesOriginais = perfil.frentes || perfil.frentes_parlamentares || [];

	const dialogProps: DialogSharedProps = {
		comissoes: comissoesOriginais,
		frentes: frentesOriginais,
		profissoes: profissoesLista,
		nomePolitico: nomeExibicao,
		partido: perfil.partido,
		uf: perfil.uf,
	};

	const investigacaoUrl = `/?alvo=${encodeURIComponent(nomeExibicao)}&ref=${encodeURIComponent(
		`FEDERAL:CAMARA:${idDeputado}`
	)}`;

	return (
		<TerminalWindow className="p-3 sm:p-6 md:p-8 border-green-500/50">
			<div className="flex flex-col md:flex-row gap-5 md:gap-6 items-center md:items-start text-center md:text-left">
				{/* Foto Oficial com Cantoneiras Hacker OSINT */}
				<div className="shrink-0">
					<div className="w-28 h-36 sm:w-32 sm:h-40 border-2 border-green-500/60 p-1 relative bg-black/80 flex items-center justify-center">
						<ProfileAvatar idDeputado={idDeputado} fotoUrl={fotoUrl} />
						<div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-green-500" />
						<div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-green-500" />
						<div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-green-500" />
						<div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-green-500" />
					</div>
				</div>

				<div className="flex-1 space-y-4 min-w-0 w-full">
					{/* Cabeçalho do Parlamentar */}
					<div className="border-b border-green-500/30 pb-3 flex flex-col lg:flex-row lg:items-start justify-between gap-3.5">
						<ProfileIdentityInfo
							nomeExibicao={nomeExibicao}
							nomeCivil={perfil.nome_civil}
							partido={perfil.partido}
							uf={perfil.uf}
							idDeputado={idDeputado}
							situacao={perfil.situacao}
							mandatoTexto={perfil.mandato_texto}
						/>

						{/* Ações Táticas Responsivas */}
						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
							<FrentesComissoesDialog {...dialogProps} />

							<a
								href={investigacaoUrl}
								className="inline-flex items-center justify-center gap-2 px-3.5 py-2 sm:py-1.5 bg-green-500/15 hover:bg-green-500/25 border border-green-500/60 text-green-300 hover:text-green-200 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap min-h-9.5 sm:min-h-0"
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
						<ProfileProfissoesSection profissoes={profissoesLista} />
						<ProfileComissoesSection
							comissoesFormatadas={comissoesFormatadas}
							dialogProps={dialogProps}
						/>
					</div>

					{/* Frentes Parlamentares */}
					<ProfileFrentesSection
						frentesFormatadas={frentesFormatadas}
						dialogProps={dialogProps}
					/>
				</div>
			</div>
		</TerminalWindow>
	);
}
