"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelBar, RankRow } from "@/components/ds";
import { brl, brlCurto, numeroSeguro } from "@/lib/format";
import { NOMES_UF } from "@/lib/busca";
import { type CeapEstado, type LinhaUf, percentuaisRelativos, rankingDeUfs, rotaDoRanking } from "@/lib/dashboard-home";
import {
	construirFormaBrasil,
	CORES_CALOR,
	DURACAO_CELEBRACAO_MS,
	FOGOS,
	nivelDeCalor,
	TROFEU,
} from "./brasil-pixel";

const FORMA = construirFormaBrasil();

function Trofeu({ celebrando }: { celebrando: boolean }) {
	return (
		<span className={`pg-trophy${celebrando ? " pg-trophy--celebrating" : ""}`} aria-hidden="true">
			{celebrando
				? FOGOS.map((p, i) => (
						<span
							key={i}
							className="pg-particle"
							style={{ width: p.size, height: p.size, background: p.color, "--dx": `${p.x.toFixed(1)}px`, "--dy": `${p.y.toFixed(1)}px`, "--delay": `${p.delay}ms`, "--dur": `${p.dur}ms` } as CSSProperties}
						/>
					))
				: null}
			<svg className="pg-trophy__svg" viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor">
				{TROFEU.map(([x, y, w], i) => (
					<rect key={i} x={x} y={y} width={w} height={1} />
				))}
			</svg>
		</span>
	);
}

interface PodioProps {
	top: LinhaUf[];
	selecionada: string;
	onSelecionar: (uf: string) => void;
	onCelebrar: () => void;
	celebrando: boolean;
}

/** Pódio (2º · 1º · 3º) com troféu dourado que gira e solta fogos pixelados no 1º lugar. */
export function Podio({ top, selecionada, onSelecionar, onCelebrar, celebrando }: PodioProps) {
	const slots = [
		{ l: top[1], rank: 2 },
		{ l: top[0], rank: 1 },
		{ l: top[2], rank: 3 },
	].filter((s) => s.l);
	return (
		<div className="pg-pod">
			{slots.map(({ l, rank }) => (
				<button
					key={l.uf}
					type="button"
					className={`pg-pod__b pg-pod__b--r${rank}`}
					aria-pressed={l.uf === selecionada}
					aria-label={`${rank}º lugar, ${NOMES_UF[l.uf] ?? l.uf}, ${brlCurto(l.total)}`}
					title={`#${rank} ${NOMES_UF[l.uf] ?? l.uf} · ${brl(l.total)}`}
					onClick={() => {
						onSelecionar(l.uf);
						if (rank === 1) onCelebrar();
					}}
					onMouseEnter={rank === 1 ? onCelebrar : undefined}
					onFocus={rank === 1 ? onCelebrar : undefined}
				>
					{rank === 1 ? <Trofeu celebrando={celebrando} /> : <span className="pg-medal">{rank}º</span>}
					<span className="pg-pod__uf">{l.uf}</span>
					<span className="pg-pod__v">{(l.total / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi</span>
					<span className="pg-ped">
						<i>{rank}º</i>
					</span>
				</button>
			))}
		</div>
	);
}

interface MapaProps {
	linhas: LinhaUf[];
	selecionada: string;
	onSelecionar: (uf: string) => void;
}

/** Mapa do Brasil em pixels (8-bit), colorido pela cota acumulada de cada UF. */
function MapaBrasil({ linhas, selecionada, onSelecionar }: MapaProps) {
	const total = useMemo(() => Object.fromEntries(linhas.map((l) => [l.uf, l.total])), [linhas]);
	const maximo = linhas[0]?.total ?? 0;
	const [hover, setHover] = useState<{ uf: string; x: number; y: number } | null>(null);
	const caixa = useRef<HTMLDivElement>(null);
	const nivel = (uf: string) => (uf === "DF" ? 4 : nivelDeCalor(total[uf] ?? 0, maximo));
	const posicao = (uf: string) => linhas.findIndex((l) => l.uf === uf) + 1;

	return (
		<div
			className="pg-mapbox"
			ref={caixa}
			onMouseLeave={() => setHover(null)}
			onMouseMove={(e) => {
				const uf = (e.target as SVGElement).getAttribute?.("data-uf");
				const r = caixa.current?.getBoundingClientRect();
				if (!uf || !r) return setHover(null);
				setHover({ uf, x: Math.min(r.width - 150, e.clientX - r.left + 12), y: e.clientY - r.top + 14 });
			}}
		>
			<svg className="pg-brmap" viewBox={`0 0 ${FORMA.W} ${FORMA.H}`} shapeRendering="crispEdges" role="img" aria-label="Mapa do Brasil em pixels colorido pela cota acumulada de cada estado">
				<g>
					{Object.entries(FORMA.fill).map(([uf, d]) => (
						<path
							key={uf}
							className="pg-uf-path"
							data-uf={uf}
							fill={CORES_CALOR[nivel(uf)]}
							d={d}
							role="button"
							aria-label={`${uf} · ${NOMES_UF[uf] ?? uf}`}
							tabIndex={0}
							onClick={() => onSelecionar(uf)}
							onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelecionar(uf)}
						/>
					))}
				</g>
				<path d={Object.values(FORMA.edge).join("")} fill="none" stroke="var(--pg-bg)" strokeWidth={1.5} pointerEvents="none" />
				<g pointerEvents="none">
					{Object.entries(FORMA.label).map(([uf, [x, y]]) => (
						<text key={uf} className={`pg-uf-lbl${nivel(uf) >= 3 ? " pg-uf-lbl--dk" : ""}`} x={x} y={y + 3.5}>
							{uf}
						</text>
					))}
				</g>
				{hover ? <path className="pg-uf-hv" d={FORMA.edge[hover.uf] ?? ""} /> : null}
				<path className="pg-uf-sel" d={FORMA.edge[selecionada] ?? ""} />
			</svg>
			{hover ? (
				<div className="pg-uftip" style={{ left: hover.x, top: hover.y }}>
					<b>
						{hover.uf} · {NOMES_UF[hover.uf]}
					</b>
					<span>{total[hover.uf] ? `#${posicao(hover.uf)} · ${brlCurto(total[hover.uf])}` : "sem dados"}</span>
				</div>
			) : null}
		</div>
	);
}

function Legenda() {
	return (
		<div className="pg-legend-h">
			<span>menos</span>
			{CORES_CALOR.map((c) => (
				<i key={c} style={{ background: c }} />
			))}
			<span>mais gasto</span>
		</div>
	);
}

export function DeputadosDaUf({ linha }: { linha: LinhaUf }) {
	const router = useRouter();
	const top = linha.deputados.slice(0, 5);
	const pct = percentuaisRelativos(top.map((d) => numeroSeguro(d.total_gasto) ?? 0));
	return (
		<div className="pg-panel__body--flush">
			{top.map((d, i) => (
				<RankRow key={`${d.nome}-${i}`} pos={i + 1} name={d.nome} sub={d.partido && d.partido !== "N/A" ? `${d.partido}·${d.uf ?? linha.uf}` : undefined} value={brlCurto(d.total_gasto)} percent={pct[i]} onClick={() => router.push(rotaDoRanking({ nome: d.nome, id: d.id_deputado, uf: d.uf ?? linha.uf, partido: d.partido, cargo: d.cargo }))} />
			))}
			{top.length === 0 ? <p className="pg-empty">Sem detalhamento de deputados para esta UF.</p> : null}
		</div>
	);
}

function DetalheUf({ linha, posicao }: { linha: LinhaUf; posicao: number }) {
	return (
		<div className="pg-ufd">
			<div className="pg-ufd__h">
				<span className="pg-label" style={{ color: "var(--pg-ink-2)" }}>
					&gt; {linha.uf} · {NOMES_UF[linha.uf] ?? linha.uf} · #{posicao}
				</span>
				<span className="pg-label">Σ {brl(linha.total).replace(",00", "")}</span>
			</div>
			<DeputadosDaUf linha={linha} />
		</div>
	);
}

/** Lista por estado (mobile): sem mapa, para não depender de toque preciso. */
function ListaUfs({ linhas, selecionada, onSelecionar }: MapaProps) {
	const [todas, setTodas] = useState(false);
	const visiveis = todas ? linhas : linhas.slice(0, 8);
	const pct = percentuaisRelativos(visiveis.map((l) => l.total));
	return (
		<>
			<p className="pg-label" style={{ padding: "4px 12px 8px" }}>
				Gasto acumulado por estado · toque para ver os maiores gastadores
			</p>
			<div className="pg-ufl">
				{visiveis.map((l, i) => {
					const aberta = l.uf === selecionada;
					return (
						<div key={l.uf}>
							<button type="button" className="pg-rank pg-ufrow" aria-expanded={aberta} onClick={() => onSelecionar(aberta ? "" : l.uf)}>
								<span className="pg-rank__pos">{String(i + 1).padStart(2, "0")}</span>
								<div style={{ minWidth: 0 }}>
									<div className="pg-rank__name">
										<b>{l.uf}</b>
										<small>{NOMES_UF[l.uf]}</small>
									</div>
									<PixelBar value={pct[i]} size="sm" label={`${l.uf}`} />
								</div>
								<span className="pg-rank__val">{brlCurto(l.total)}</span>
							</button>
							{aberta ? <DetalheUf linha={l} posicao={i + 1} /> : null}
						</div>
					);
				})}
			</div>
			<div style={{ padding: 12 }}>
				<button type="button" className="pg-btn pg-btn--block" onClick={() => setTodas((v) => !v)}>
					{todas ? "Mostrar só os 8 primeiros" : `Ver os ${linhas.length} estados`}
				</button>
			</div>
		</>
	);
}

/**
 * Painel "gasto por estado": pódio com troféu + (desktop) mapa pixel do Brasil
 * ou (mobile) ranking em lista. O detalhe do estado traz os maiores gastadores.
 */
export function UfPainel({ ceapEstados, mobile }: { ceapEstados?: Record<string, CeapEstado>; mobile: boolean }) {
	const linhas = useMemo(() => rankingDeUfs(ceapEstados), [ceapEstados]);
	const [selecionada, setSelecionada] = useState<string | null>(null);
	const [celebrando, setCelebrando] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => {
		if (timer.current) clearTimeout(timer.current);
	}, []);

	if (linhas.length === 0) return null;

	const celebrar = () => {
		if (timer.current) return;
		setCelebrando(true);
		timer.current = setTimeout(() => {
			setCelebrando(false);
			timer.current = null;
		}, DURACAO_CELEBRACAO_MS);
	};
	const sel = selecionada ?? (mobile ? "" : linhas[0].uf);
	const atual = linhas.find((l) => l.uf === sel);

	return (
		<div>
			<Podio top={linhas.slice(0, 3)} selecionada={sel} onSelecionar={setSelecionada} onCelebrar={celebrar} celebrando={celebrando} />
			{mobile ? (
				<ListaUfs linhas={linhas} selecionada={sel} onSelecionar={setSelecionada} />
			) : (
				<>
					<MapaBrasil linhas={linhas} selecionada={sel} onSelecionar={setSelecionada} />
					<Legenda />
					{atual ? <DetalheUf linha={atual} posicao={linhas.indexOf(atual) + 1} /> : null}
				</>
			)}
		</div>
	);
}
