"use client";

import { PixelBar, Spinner } from "@/components/ds";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { type JobView, jobView } from "@/lib/investigacao/job-view";
import { type InvestigacaoApi, useInvestigacao, useRelogio } from "./InvestigacaoProvider";

interface RibbonProps {
	v: JobView;
	cls: string;
	inv: InvestigacaoApi;
}

function RibbonAndamento({ v, cls, inv }: RibbonProps) {
	return (
		<div className={cls} data-state="running" role="status">
			<Spinner />
			<b>Investigando</b>
			<PixelBar value={v.pct} label="Progresso" />
			<span className="pg-ribbon__n">{v.pct}%</span>
			<span className="pg-ribbon__t">
				{v.concluidas}/{v.aplicaveis} fontes · {v.relogio}
				{v.problemas.length > 0 ? <span style={{ color: "var(--pg-warn)" }}> · ▲ {v.problemas.length} sem resposta</span> : null}
			</span>
			<span className="pg-ribbon__log">&gt; {v.log}</span>
			<button type="button" className="pg-btn" onClick={inv.cancelar}>
				Cancelar
			</button>
		</div>
	);
}

function RibbonInterrompida({ v, cls, inv }: RibbonProps) {
	const erro = v.estado === "error";
	const detalhe = erro ? v.erro || "erro desconhecido" : `interrompida em ${v.pct}%`;
	return (
		<div className={cls} data-state={v.estado} role="status">
			<b style={{ color: erro ? "var(--pg-crit)" : "var(--pg-warn)" }}>{erro ? "◆ Falhou" : "▲ Parcial"}</b>
			<span className="pg-ribbon__t">
				{detalhe} · {v.nos} nós
			</span>
			<span className="pg-ribbon__log" />
			<button type="button" className="pg-btn pg-btn--primary" onClick={inv.recomecar}>
				{erro ? "Tentar de novo" : "Recomeçar"}
			</button>
		</div>
	);
}

function RibbonConcluida({ v, cls, inv }: RibbonProps) {
	return (
		<div className={cls} data-state="done" role="status">
			<b style={{ color: "var(--pg-phos)" }}>✓ Concluído</b>
			<span className="pg-ribbon__t">
				em {v.relogio} · <span style={{ color: "var(--pg-crit)" }}>◆ {v.criticos}</span> ·{" "}
				<span style={{ color: "var(--pg-warn)" }}>▲ {v.atencao}</span> · {v.nos} nós
				{v.problemas.length > 0 ? <span style={{ color: "var(--pg-warn)" }}> · {v.problemas.length} fonte(s) sem resposta</span> : null}
			</span>
			<span className="pg-ribbon__log" />
			<button type="button" className="pg-btn" onClick={inv.recomecar}>
				Reinvestigar
			</button>
		</div>
	);
}

const RIBBON_POR_ESTADO = {
	running: RibbonAndamento,
	partial: RibbonInterrompida,
	error: RibbonInterrompida,
	done: RibbonConcluida,
} as const;

/** Faixa no topo do Dossiê: progresso, fontes, relógio e a última mensagem. */
export function JobRibbon({ fluxo }: { fluxo?: boolean }) {
	const inv = useInvestigacao();
	const seg = useRelogio();
	const v = jobView(inv.state, null, seg);
	if (v.estado === "idle") return null;
	const Comp = RIBBON_POR_ESTADO[v.estado];
	return <Comp v={v} cls={`pg-ribbon${fluxo ? " pg-ribbon--flow" : ""}`} inv={inv} />;
}

interface IndicadorProps {
	/** Nome curto exibido ("Investigando Alice"). */
	nome: string;
	onAbrir: () => void;
}

/** Deve aparecer? Rodando, ou pronto e ainda não visto (o chamador decide o "visto"). */
export function jobVisivel(estado: string, jaVisto: boolean): boolean {
	return estado === "running" || (estado === "done" && !jaVisto);
}

/** Chip do header (desktop): leva ao Dossiê. */
export function JobChip({ nome, onAbrir, jaVisto }: IndicadorProps & { jaVisto: boolean }) {
	const inv = useInvestigacao();
	const seg = useRelogio();
	const v = jobView(inv.state, null, seg);
	if (!jobVisivel(v.estado, jaVisto)) return null;
	const pronto = v.estado === "done";
	return (
		<button
			type="button"
			className={`pg-jobchip${pronto ? " pg-jobchip--ready" : ""}`}
			onClick={onAbrir}
			aria-label={pronto ? `Dossiê de ${nome} pronto` : `Investigando ${nome}: ${v.pct}%`}
		>
			{pronto ? (
				<>
					<span style={{ color: "var(--pg-phos)" }}>✓</span>
					<span className="pg-jobchip__t">Dossiê pronto</span>
					<b style={{ color: "var(--pg-crit)" }}>◆ {v.criticos}</b>
				</>
			) : (
				<>
					<Spinner />
					<span className="pg-jobchip__t">Investigando {nome}</span>
					<b>{v.pct}%</b>
				</>
			)}
		</button>
	);
}

/** Banner do mobile, logo abaixo da app bar. */
export function JobBanner({ nome, onAbrir, jaVisto }: IndicadorProps & { jaVisto: boolean }) {
	const inv = useInvestigacao();
	const seg = useRelogio();
	const v = jobView(inv.state, null, seg);
	if (!jobVisivel(v.estado, jaVisto)) return null;
	const pronto = v.estado === "done";
	return (
		<button type="button" className={`pg-jobbar${pronto ? " pg-jobbar--ready" : ""}`} onClick={onAbrir}>
			{pronto ? <span style={{ color: "var(--pg-phos)" }}>✓</span> : <Spinner />}
			<span className="pg-jobbar__t">{pronto ? `Dossiê de ${nome} pronto` : `Investigando ${nome}`}</span>
			<b>{pronto ? `◆ ${v.criticos}` : `${v.pct}%`}</b>
			<span className="pg-jobbar__go">
				{pronto ? "abrir" : "ver"}
				<PixelIcon name="chev" size={14} />
			</span>
		</button>
	);
}
