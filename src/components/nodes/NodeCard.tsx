import type { ReactNode } from "react";
import { Corners, PixelBar } from "@/components/ds";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { GLIFO_RISCO, ROTULO_RISCO } from "@/lib/investigacao/risco";
import { tituloCaso } from "@/lib/texto";
import { LIMITE_DESTAQUE_LONGO, type ModeloCard } from "./card-model";

export type DensidadeCard = "full" | "slim" | "dot" | "row";


/** Limiares de zoom → densidade (semantic zoom do canvas). */
export function densidadePorZoom(zoom: number): Exclude<DensidadeCard, "row"> {
	if (zoom >= 0.65) return "full";
	if (zoom >= 0.4) return "slim";
	return "dot";
}

/** Score compacto (rail, lista mobile e densidade slim). `inline` = sem moldura. */
export function ChipScore({ modelo, inline }: { modelo: ModeloCard; inline?: boolean }) {
	if (modelo.score === null) return null;
	const titulo = modelo.regra
		? `Crítico por regra: ${modelo.regra}. Nota da IA: ${modelo.score}/100`
		: `Score de risco ${modelo.score}/100`;
	return (
		<span className={inline ? "pg-node__score pg-node__score--inline" : "pg-node__score"} title={titulo}>
			{GLIFO_RISCO[modelo.risco]} {modelo.regra ? "REGRA" : modelo.score}
		</span>
	);
}

/** Lado direito da linha "Avaliação IA": nível + nota, ou nível + "regra" quando o crítico não vem da nota. */
function NivelIA({ modelo }: { modelo: ModeloCard }) {
	const nivel = `${GLIFO_RISCO[modelo.risco]} ${ROTULO_RISCO[modelo.risco]}`;
	if (modelo.regra || modelo.score === null) {
		return <span className="pg-ia__nivel">{nivel} · REGRA</span>;
	}
	return (
		<span className="pg-ia__nivel" title={`Score de risco ${modelo.score}/100`}>
			{nivel} <b>{modelo.score}</b>
			<small>/100</small>
		</span>
	);
}

function ExplicacaoRegra({ modelo }: { modelo: ModeloCard }) {
	if (!modelo.regra) return null;
	const nota = modelo.score === null ? "" : ` Nota da IA: ${modelo.score}/100.`;
	return (
		<p className="pg-ia__regra">
			Crítico por regra: {modelo.regra}.{nota}
		</p>
	);
}

/**
 * Avaliação da IA no corpo do card: nível, nota, barra e justificativa.
 * Fica fora do cabeçalho para não competir com o tipo/título.
 * Crítico vindo de regra (ex.: emenda fantasma) diz isso, em vez de parecer nota alta.
 */
export function AvaliacaoIA({ modelo }: { modelo: ModeloCard }) {
	if (modelo.score === null && !modelo.regra) {
		return modelo.motivo ? <p className="pg-node__ia">&gt; {modelo.motivo}</p> : null;
	}
	const tom = modelo.risco === "ok" ? "phos" : modelo.risco;
	return (
		<section className={`pg-ia pg-ia--${modelo.risco}`} aria-label="Avaliação da IA">
			<div className="pg-ia__row">
				<span className="pg-label">Avaliação IA</span>
				<NivelIA modelo={modelo} />
			</div>
			{modelo.score === null ? null : <PixelBar value={modelo.score} tone={tom} size="sm" label={`Score de risco ${modelo.score} de 100`} />}
			<ExplicacaoRegra modelo={modelo} />
			{modelo.motivo ? <p className="pg-ia__txt">&gt; {modelo.motivo}</p> : null}
		</section>
	);
}

interface NodeCardProps {
	modelo: ModeloCard;
	densidade?: DensidadeCard;
	selecionado?: boolean;
	destacado?: boolean;
	/** Quantidade de conexões exibida no rodapé. */
	conexoes?: number;
	/** Substitui o ícone do cabeçalho (ex.: foto da pessoa). */
	avatar?: ReactNode;
	/** Barra de carregamento (pivô em andamento). */
	carregando?: { rotulo: string; status?: string } | null;
	/** Conteúdo extra no corpo (ações, alertas). */
	children?: ReactNode;
	/** Portas de conexão (Handles do React Flow) — renderizadas pelo wrapper. */
	portas?: ReactNode;
	onClick?: () => void;
}

const classeBase = (m: ModeloCard, d: DensidadeCard, sel?: boolean, hl?: boolean) =>
	[
		"pg-node",
		`pg-fam-${m.familia}`,
		m.risco !== "ok" ? `pg-node--${m.risco}` : "",
		d === "slim" ? "pg-node--slim" : "",
		d === "dot" ? "pg-node--dot" : "",
		sel ? "pg-node--sel" : "",
		hl ? "pg-node--hl" : "",
	]
		.filter(Boolean)
		.join(" ");

function Cabecalho({ modelo, avatar }: { modelo: ModeloCard; avatar?: ReactNode }) {
	return (
		<div className="pg-node__head">
			<span className="pg-node__ico">{avatar ?? <PixelIcon name={modelo.icon} size={14} />}</span>
			<span className="pg-node__tag">{modelo.tag}</span>
		</div>
	);
}

function Destaque({ modelo }: { modelo: ModeloCard }) {
	const longo = modelo.chave.valor.length > LIMITE_DESTAQUE_LONGO;
	return (
		<div className={longo ? "pg-node__hero pg-node__hero--long" : "pg-node__hero"}>
			<span className="pg-label">{modelo.chave.label}</span>
			<b>{modelo.chave.valor}</b>
			{modelo.chave.dica ? <small>{modelo.chave.dica}</small> : null}
		</div>
	);
}

function Campos({ modelo }: { modelo: ModeloCard }) {
	if (modelo.campos.length === 0) return null;
	return (
		<dl className="pg-node__fields">
			{modelo.campos.map((f) => (
				<div key={f.label} className={f.wide ? "pg-wide" : undefined}>
					<dt>{f.label}</dt>
					<dd>{f.chip ? <span className="pg-code">{f.value}</span> : f.value}</dd>
				</div>
			))}
		</dl>
	);
}

function Medidor({ modelo }: { modelo: ModeloCard }) {
	if (!modelo.medidor) return null;
	const tom = modelo.risco === "ok" ? "phos" : modelo.risco;
	return (
		<div className="pg-meter">
			<div className="pg-meter__row">
				<span className="pg-label">{modelo.medidor.label}</span>
				<span style={{ color: "var(--pg-ink-1)" }}>{Math.round(modelo.medidor.valor)}%</span>
			</div>
			<PixelBar value={modelo.medidor.valor} tone={tom} label={modelo.medidor.label} />
		</div>
	);
}

function Carregando({ info }: { info: { rotulo: string; status?: string } }) {
	return (
		<div className="pg-load">
			<div className="pg-load__row">
				<span>{info.rotulo}</span>
			</div>
			<div className="pg-load__bar">
				<i />
			</div>
			{info.status ? <span className="pg-label">&gt; {info.status}</span> : null}
		</div>
	);
}

/**
 * Card de entidade do Dossiê — mesmo componente no canvas, no rail e no mobile.
 * Densidades: full · slim · dot · row (lista mobile).
 */
export function NodeCard({
	modelo,
	densidade = "full",
	selecionado,
	destacado,
	conexoes,
	avatar,
	carregando,
	children,
	portas,
	onClick,
}: NodeCardProps) {
	if (densidade === "row") return <LinhaCard modelo={modelo} onClick={onClick} />;
	const cls = classeBase(modelo, densidade, selecionado, destacado);

	if (densidade === "dot") {
		return (
			<div className={cls} tabIndex={0} aria-label={modelo.titulo} data-node-type={modelo.tipo}>
				<span className="pg-node__ico">
					<PixelIcon name={modelo.icon} size={14} />
				</span>
				<span>{tituloCaso(modelo.titulo)}</span>
				{modelo.risco !== "ok" ? (
					<span style={{ color: "var(--rk)" }}>{GLIFO_RISCO[modelo.risco]}</span>
				) : null}
				{portas}
			</div>
		);
	}

	if (densidade === "slim") {
		return (
			<div className={cls} tabIndex={0} data-node-type={modelo.tipo}>
				<Corners />
				{portas}
				<Cabecalho modelo={modelo} avatar={avatar} />
				<div className="pg-node__body">
					<div className="pg-node__title">{tituloCaso(modelo.titulo)}</div>
					<div className="pg-node__k">
						<span className="pg-label">{modelo.chave.label.split(" (")[0]}</span>
						{modelo.risco !== "ok" ? <ChipScore modelo={modelo} inline /> : null}
						<b>{modelo.chave.curto}</b>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={cls} tabIndex={0} data-node-type={modelo.tipo} onClick={onClick}>
			<Corners />
			{portas}
			<Cabecalho modelo={modelo} avatar={avatar} />
			<div className="pg-node__body">
				<div>
					<div className="pg-node__title">{tituloCaso(modelo.titulo)}</div>
					{modelo.sub ? <div className="pg-node__sub">{modelo.sub}</div> : null}
				</div>
				<Destaque modelo={modelo} />
				<Campos modelo={modelo} />
				<Medidor modelo={modelo} />
				<AvaliacaoIA modelo={modelo} />
				{carregando ? <Carregando info={carregando} /> : null}
				{children}
			</div>
			<div className="pg-node__foot">
				<span>{modelo.fonte}</span>
				{conexoes !== undefined ? <b>{conexoes} conexões</b> : null}
			</div>
		</div>
	);
}

function LinhaCard({ modelo, onClick }: { modelo: ModeloCard; onClick?: () => void }) {
	return (
		<button
			type="button"
			className={`pg-row pg-fam-${modelo.familia} pg-row--${modelo.risco}`}
			onClick={onClick}
		>
			<span className="pg-node__ico">
				<PixelIcon name={modelo.icon} size={20} />
			</span>
			<span className="pg-row__t">
				<i>{modelo.tag}</i>
				<b>{tituloCaso(modelo.titulo)}</b>
				{modelo.sub && modelo.sub.toUpperCase() !== modelo.tag.toUpperCase() ? <span>{modelo.sub}</span> : null}
			</span>
			<span className="pg-row__s">
				<b>{modelo.chave.curto}</b>
				<ChipScore modelo={modelo} />
			</span>
		</button>
	);
}
