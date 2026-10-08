"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useState } from "react";
import { toast } from "sonner";
import { JobBanner, JobChip } from "@/components/investigacao/JobIndicadores";
import { useInvestigacao, useRelogio } from "@/components/investigacao/InvestigacaoProvider";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { urlDossie } from "@/lib/investigacao/alvo";
import { problemasDeConexao } from "@/lib/investigacao/etapas";
import { jobView } from "@/lib/investigacao/job-view";
import { tituloCaso } from "@/lib/texto";
import { CommandSearch } from "./CommandSearch";
import { MobileSearchOverlay } from "./MobileSearchOverlay";

const ShellCtx = createContext<{ abrirBusca: () => void }>({ abrirBusca: () => {} });

/** Permite que páginas abram a busca em tela cheia do mobile. */
export function useShell() {
	return useContext(ShellCtx);
}

export interface Migalha {
	label: string;
	href?: string;
}

export interface AppShellProps {
	children: ReactNode;
	/** Hierarquia: Home › Perfil › Dossiê. A última é a página atual. */
	migalhas: Migalha[];
	/** Ações do lado direito do breadcrumb (desktop). */
	acoes?: ReactNode;
	/** Conteúdo da status bar (desktop). */
	status?: ReactNode;
	/** Mobile: título contextual da app bar (se ausente, mostra o wordmark + busca). */
	tituloMobile?: { titulo: string; subtitulo?: string };
	/** Mobile: para onde volta o botão voltar. */
	voltarHref?: string;
	/** Mobile: ações extras à direita da app bar. */
	acoesMobile?: ReactNode;
	/** O usuário já está vendo a investigação em curso (esconde chip/banner). */
	jobJaVisto?: boolean;
}

function Wordmark({ onClick }: { onClick?: () => void }) {
	return (
		<Link href="/" className="pg-brand" aria-label="Início" onClick={onClick}>
			<span className="pg-logo">POLÍGRAFO</span>
			<small>IA</small>
		</Link>
	);
}

function MenuHeader() {
	const [aberto, setAberto] = useState(false);

	const copiar = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast.success("Link copiado.");
		} catch {
			toast.error("Não foi possível copiar o link.");
		}
		setAberto(false);
	};

	return (
		<div style={{ position: "relative" }}>
			<button type="button" className="pg-btn pg-btn--icon" aria-label="Menu" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
				<PixelIcon name="menu" size={16} />
			</button>
			{aberto ? (
				<div className="pg-sd" role="menu" style={{ left: "auto", right: 0, width: 280, top: "calc(100% + 10px)" }}>
					<div className="pg-menu">
						<a role="menuitem" href="https://github.com/jeanfbraga/Poligrafo/issues/new/choose" target="_blank" rel="noopener noreferrer">
							<PixelIcon name="bug" size={16} />
							Reportar bug ou ideia
						</a>
						<button type="button" role="menuitem" onClick={copiar}>
							<PixelIcon name="share" size={16} />
							Copiar link desta tela
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}

/** LEDs de fontes: só aparecem com uma investigação ativa. */
function LedsDeFontes() {
	const { state } = useInvestigacao();
	if (!state.alvo) return null;
	// Avisos do servidor + fontes cujo site não respondeu (evento ETAPA).
	const fora = state.dossie.warnings.length + problemasDeConexao(state.dossie.etapas, state.dossie.status === "running").length;
	return (
		<div className="pg-leds" role="status">
			<span className={`pg-led${fora > 0 ? " pg-led--warn" : ""}`} />
			{fora > 0 ? `${fora} fonte(s) com problema` : "fontes respondendo"}
		</div>
	);
}

function ProgressoHeader() {
	const { state } = useInvestigacao();
	const seg = useRelogio();
	const v = jobView(state, null, seg);
	return (
		<div className="pg-hprog" data-on={v.estado === "running"}>
			<i style={{ width: `${v.pct}%` }} />
		</div>
	);
}

function useJobAlvo() {
	const { state } = useInvestigacao();
	const alvo = state.alvo;
	return {
		nome: alvo ? tituloCaso(alvo.nome).split(" ")[0] : "",
		href: alvo ? urlDossie(alvo) : "/",
	};
}

function Migalhas({ itens }: { itens: Migalha[] }) {
	return (
		<ol>
			{itens.map((m, i) => {
				const ultimo = i === itens.length - 1;
				if (ultimo) {
					return (
						<li key={`${m.label}-${i}`} aria-current="page">
							{m.label}
						</li>
					);
				}
				return (
					<li key={`${m.label}-${i}`}>
						{m.href ? <Link href={m.href}>{m.label}</Link> : <button type="button">{m.label}</button>}
					</li>
				);
			})}
		</ol>
	);
}

function AppBarMobile({ titulo, voltarHref, acoes, onBuscar }: { titulo?: AppShellProps["tituloMobile"]; voltarHref?: string; acoes?: ReactNode; onBuscar: () => void }) {
	const router = useRouter();
	return (
		<div className="pg-mbar">
			{titulo ? (
				<>
					<button type="button" className="pg-btn pg-btn--icon" aria-label="Voltar" onClick={() => (voltarHref ? router.push(voltarHref) : router.back())}>
						<PixelIcon name="back" size={16} />
					</button>
					<div className="pg-mbar__ttl">
						<b>{titulo.titulo}</b>
						{titulo.subtitulo ? <span>{titulo.subtitulo}</span> : null}
					</div>
				</>
			) : (
				<Wordmark />
			)}
			{acoes}
			<button type="button" className="pg-btn pg-btn--icon" aria-label="Buscar político" onClick={onBuscar}>
				<PixelIcon name="search" size={16} />
			</button>
		</div>
	);
}

/**
 * Casca do produto. Desktop: header (busca de comando) + breadcrumb + conteúdo
 * + status bar. Mobile: app bar contextual + banner do job; sem bottom tab bar
 * (a navegação segue a hierarquia real: Home › Perfil › Dossiê).
 */
export function AppShell({ children, migalhas, acoes, status, tituloMobile, voltarHref, acoesMobile, jobJaVisto = false }: AppShellProps) {
	const router = useRouter();
	const [buscaMobile, setBuscaMobile] = useState(false);
	const job = useJobAlvo();

	return (
		<ShellCtx.Provider value={{ abrirBusca: () => setBuscaMobile(true) }}>
		<div className="pg-app site-content">
			<header className="pg-hbar">
				<Wordmark />
				<CommandSearch />
				<span className="pg-hbar__sp" />
				<JobChip nome={job.nome} jaVisto={jobJaVisto} onAbrir={() => router.push(job.href)} />
				<LedsDeFontes />
				<MenuHeader />
				<ProgressoHeader />
			</header>
			<nav className="pg-crumbs" aria-label="Você está em">
				<Migalhas itens={migalhas} />
				<span className="pg-crumbs__sp" />
				{acoes}
			</nav>

			<AppBarMobile titulo={tituloMobile} voltarHref={voltarHref} acoes={acoesMobile} onBuscar={() => setBuscaMobile(true)} />
			<div className="md:hidden contents">
				<JobBanner nome={job.nome} jaVisto={jobJaVisto} onAbrir={() => router.push(job.href)} />
			</div>

			<main className="pg-app__main">{children}</main>
			<footer className="pg-status">{status}</footer>
			{buscaMobile ? <MobileSearchOverlay onFechar={() => setBuscaMobile(false)} /> : null}
		</div>
		</ShellCtx.Provider>
	);
}
