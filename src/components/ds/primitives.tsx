import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Primitivos do design system "Terminal Fósforo".
   Cada componente é uma casca fina sobre as classes pg-* (styles/pg).
   Regra: nenhum primitivo conhece regra de negócio.
   ========================================================================== */

/** Cantoneiras de mira nos 4 cantos. O pai precisa de position:relative. */
export function Corners() {
	return (
		<>
			<i className="pg-cn pg-cn--a" />
			<i className="pg-cn pg-cn--b" />
			<i className="pg-cn pg-cn--c" />
			<i className="pg-cn pg-cn--d" />
		</>
	);
}

/** Rótulo micro em caixa alta. */
export function Label({
	children,
	tone,
	className,
}: {
	children: ReactNode;
	tone?: "crit" | "warn";
	className?: string;
}) {
	return (
		<span
			className={cn(
				"pg-label",
				tone === "crit" && "pg-label--crit",
				tone === "warn" && "pg-label--warn",
				className,
			)}
		>
			{children}
		</span>
	);
}

export type TagTone = "default" | "phos" | "warn" | "crit" | "steel";

const TAG_CLASS: Record<TagTone, string> = {
	default: "",
	phos: "pg-tag--phos",
	warn: "pg-tag--warn",
	crit: "pg-tag--crit",
	steel: "pg-tag--steel",
};

/** Chip de estado. Tons de risco só para risco (warn ≥ 60, crit ≥ 85). */
export function Tag({
	children,
	tone = "default",
	className,
	title,
}: {
	children: ReactNode;
	tone?: TagTone;
	className?: string;
	title?: string;
}) {
	return (
		<span className={cn("pg-tag", TAG_CLASS[tone], className)} title={title}>
			{children}
		</span>
	);
}

export interface SegOption<T extends string> {
	value: T;
	label: ReactNode;
	icon?: ReactNode;
}

/** Controle segmentado: alterna entre 2+ visões do mesmo conteúdo. */
export function Seg<T extends string>({
	value,
	onChange,
	options,
	label,
	className,
}: {
	value: T;
	onChange: (v: T) => void;
	options: SegOption<T>[];
	label: string;
	className?: string;
}) {
	return (
		<div className={cn("pg-seg", className)} role="group" aria-label={label}>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={o.value === value}
					onClick={() => onChange(o.value)}
				>
					{o.icon}
					{o.label}
				</button>
			))}
		</div>
	);
}

/** Chip de filtro (liga/desliga). */
export function FilterChip({
	children,
	pressed,
	onClick,
	tone,
}: {
	children: ReactNode;
	pressed: boolean;
	onClick: () => void;
	tone?: "crit" | "warn";
}) {
	return (
		<button
			type="button"
			className={cn(
				"pg-fchip",
				tone === "crit" && "pg-fchip--crit",
				tone === "warn" && "pg-fchip--warn",
			)}
			aria-pressed={pressed}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

/** Painel: janela com título, subtítulo e corpo (flush = sem padding). */
export function Panel({
	title,
	sub,
	badge,
	flush,
	className,
	children,
	id,
}: {
	title: ReactNode;
	sub?: ReactNode;
	badge?: ReactNode;
	flush?: boolean;
	className?: string;
	children: ReactNode;
	id?: string;
}) {
	return (
		<section className={cn("pg-panel", className)} id={id}>
			<div className="pg-panel__head">
				<div className="pg-panel__title">
					{title}
					{sub ? <span className="pg-panel__sub">{sub}</span> : null}
				</div>
				{badge}
			</div>
			<div className={cn("pg-panel__body", flush && "pg-panel__body--flush")}>
				{children}
			</div>
		</section>
	);
}

export interface KvItem {
	key: string;
	label: ReactNode;
	value: ReactNode;
	big?: boolean;
}

/** Lista chave/valor (dl). */
export function Kv({ items }: { items: KvItem[] }) {
	return (
		<dl className="pg-kv">
			{items.map((it) => (
				<div key={it.key}>
					<dt>{it.label}</dt>
					<dd className={it.big ? "pg-kv__big" : undefined}>{it.value}</dd>
				</div>
			))}
		</dl>
	);
}

export type BarTone = "phos" | "warn" | "crit";

/** Barra pixelada de 0 a 100. */
export function PixelBar({
	value,
	tone = "phos",
	size,
	label,
}: {
	value: number;
	tone?: BarTone;
	size?: "sm" | "lg";
	label?: string;
}) {
	const pct = Math.max(0, Math.min(100, Math.round(value)));
	return (
		<div
			className={cn(
				"pg-pixbar",
				tone === "warn" && "pg-pixbar--warn",
				tone === "crit" && "pg-pixbar--crit",
				size === "sm" && "pg-pixbar--sm",
				size === "lg" && "pg-pixbar--lg",
			)}
			role="progressbar"
			aria-valuenow={pct}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label={label}
		>
			<i style={{ width: `${pct}%` } as CSSProperties} />
		</div>
	);
}

export interface StatItem {
	key: string;
	label: ReactNode;
	value: ReactNode;
	tone?: "crit" | "warn";
}

/** Grade de estatísticas (2, 3 ou 4 colunas). */
export function KStats({
	items,
	cols = 4,
	className,
}: {
	items: StatItem[];
	cols?: 2 | 3 | 4;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"pg-kstats",
				cols === 3 && "pg-kstats--3",
				cols === 2 && "pg-kstats--2",
				className,
			)}
		>
			{items.map((s) => (
				<div key={s.key}>
					<span className="pg-label">{s.label}</span>
					<b
						style={
							s.tone
								? { color: s.tone === "crit" ? "var(--pg-crit)" : "var(--pg-warn)" }
								: undefined
						}
					>
						{s.value}
					</b>
				</div>
			))}
		</div>
	);
}

/** Linha de ranking com barra proporcional. Vira botão quando há onClick. */
export function RankRow({
	pos,
	name,
	sub,
	value,
	percent,
	onClick,
}: {
	pos: number;
	name: ReactNode;
	sub?: ReactNode;
	value: ReactNode;
	/** Comprimento da barra, 0–100. */
	percent: number;
	onClick?: () => void;
}) {
	const content = (
		<>
			<span className="pg-rank__pos">{String(pos).padStart(2, "0")}</span>
			<div className="min-w-0">
				<div className="pg-rank__name">
					<b>{name}</b>
					{sub ? <small>{sub}</small> : null}
				</div>
				<PixelBar value={percent} size="sm" />
			</div>
			<span className="pg-rank__val">{value}</span>
		</>
	);
	if (onClick) {
		return (
			<button type="button" className="pg-rank" onClick={onClick}>
				{content}
			</button>
		);
	}
	return <div className="pg-rank">{content}</div>;
}
