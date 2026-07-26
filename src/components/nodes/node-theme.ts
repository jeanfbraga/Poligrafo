import {
	BarChart3,
	Briefcase,
	Building2,
	DollarSign,
	FileText,
	Landmark,
	type LucideIcon,
	Scale,
	User,
	Users,
} from "lucide-react";

/* ================================================================
   NODE THEME — fonte única de verdade para desktop (React Flow)
   e mobile (MobileView). Cores, ícones, rótulos e thresholds de
   risco são definidos aqui e consumidos pelos dois lados.

   Identidade por entidade:
   PESSOA=green | EMPRESA=blue | DESPESA=slate | EMENDA=teal
   CONTRATO=yellow | PROCESSO=red | ORGAO=emerald | SOCIO=purple
   RESUMO_GASTOS=indigo
   Risco (qualquer entidade): ATENCAO=yellow | CRITICO/FANTASMA=red
   ================================================================ */

export type RiskLevel = "NORMAL" | "ATENCAO" | "CRITICO" | "FANTASMA";

export type CyberBadgeVariant =
	| "cyber-green"
	| "cyber-red"
	| "cyber-yellow"
	| "cyber-purple"
	| "cyber-slate"
	| "cyber-teal"
	| "cyber-blue";

export interface AccentTokens {
	/** Texto principal (títulos, valores) */
	text: string;
	/** Texto secundário (valores de campo) */
	textSoft: string;
	/** Rótulos de campo */
	label: string;
	/** Borda principal do card */
	border: string;
	/** Bordas de divisores internos */
	borderSoft: string;
	/** Classes do badge de tipo (desktop, estilo outline) */
	badge: string;
	/** Variante cyber-* do Badge (mobile) */
	badgeVariant: CyberBadgeVariant;
	/** Cor dos handles do React Flow */
	handle: string;
	/** Glow (box-shadow) do card em destaque */
	glow: string;
	/** Track da barra de loading */
	track: string;
	/** Preenchimento da barra de loading */
	bar: string;
	/** Chip mono para documentos (CPF/CNPJ) */
	chip: string;
}

export interface EntityTheme {
	icon: LucideIcon;
	/** Rótulo padronizado no formato [TIPO_ENTIDADE] */
	typeLabel: string;
	/** Texto exibido na barra de loading durante buscas */
	loadingLabel: string;
	/** Glow sempre ativo (mesmo com risco NORMAL) */
	alwaysGlow?: boolean;
	/** Determina se a entidade pode ser compartilhada (habilita o botão Share) */
	canShare?: boolean;
	accent: AccentTokens;
}

const green: AccentTokens = {
	text: "text-green-400",
	textSoft: "text-green-300",
	label: "text-green-500",
	border: "border-green-500",
	borderSoft: "border-green-900/50",
	badge: "bg-black text-green-400 border-green-500",
	badgeVariant: "cyber-green",
	handle: "bg-green-500!",
	glow: "shadow-[0_0_15px_rgba(34,197,94,0.4)]",
	track: "bg-green-950",
	bar: "bg-green-500",
	chip: "text-green-300 bg-green-500/20",
};

const blue: AccentTokens = {
	text: "text-blue-400",
	textSoft: "text-blue-300",
	label: "text-blue-500",
	border: "border-blue-500",
	borderSoft: "border-blue-900/50",
	badge: "bg-blue-950/30 text-blue-400 border-blue-500",
	badgeVariant: "cyber-blue",
	handle: "bg-blue-500!",
	glow: "shadow-[0_0_15px_rgba(59,130,246,0.4)]",
	track: "bg-blue-950",
	bar: "bg-blue-500",
	chip: "text-blue-300 bg-blue-500/20",
};

const slate: AccentTokens = {
	text: "text-slate-400",
	textSoft: "text-slate-300",
	label: "text-slate-500",
	border: "border-slate-700",
	borderSoft: "border-slate-800",
	badge: "bg-slate-800/30 text-slate-400 border-slate-700",
	badgeVariant: "cyber-slate",
	handle: "bg-slate-500!",
	glow: "",
	track: "bg-slate-900",
	bar: "bg-slate-500",
	chip: "text-slate-300 bg-slate-500/20",
};

const teal: AccentTokens = {
	text: "text-teal-400",
	textSoft: "text-teal-300",
	label: "text-teal-500",
	border: "border-teal-500",
	borderSoft: "border-teal-900/50",
	badge: "bg-teal-950/30 text-teal-400 border-teal-500",
	badgeVariant: "cyber-teal",
	handle: "bg-teal-500!",
	glow: "shadow-[0_0_15px_rgba(20,184,166,0.4)]",
	track: "bg-teal-950",
	bar: "bg-teal-500",
	chip: "text-teal-300 bg-teal-500/20",
};

const yellow: AccentTokens = {
	text: "text-yellow-400",
	textSoft: "text-yellow-300",
	label: "text-yellow-500",
	border: "border-yellow-500",
	borderSoft: "border-yellow-900/50",
	badge: "bg-yellow-950/30 text-yellow-500 border-yellow-500",
	badgeVariant: "cyber-yellow",
	handle: "bg-yellow-500!",
	glow: "shadow-[0_0_15px_rgba(234,179,8,0.4)]",
	track: "bg-yellow-950",
	bar: "bg-yellow-500",
	chip: "text-yellow-300 bg-yellow-500/20",
};

const red: AccentTokens = {
	text: "text-red-500",
	textSoft: "text-red-400",
	label: "text-red-500",
	border: "border-red-600",
	borderSoft: "border-red-900/50",
	badge: "bg-red-950/40 text-red-500 border-red-500",
	badgeVariant: "cyber-red",
	handle: "bg-red-500!",
	glow: "shadow-[0_0_20px_rgba(239,68,68,0.4)]",
	track: "bg-red-950",
	bar: "bg-red-500",
	chip: "text-red-300 bg-red-500/20",
};

const emerald: AccentTokens = {
	text: "text-emerald-400",
	textSoft: "text-emerald-300",
	label: "text-emerald-500",
	border: "border-emerald-500",
	borderSoft: "border-emerald-900/50",
	badge: "bg-emerald-950/30 text-emerald-400 border-emerald-500",
	badgeVariant: "cyber-green",
	handle: "bg-emerald-500!",
	glow: "shadow-[0_0_15px_rgba(16,185,129,0.4)]",
	track: "bg-emerald-950",
	bar: "bg-emerald-500",
	chip: "text-emerald-300 bg-emerald-500/20",
};

const purple: AccentTokens = {
	text: "text-purple-400",
	textSoft: "text-purple-300",
	label: "text-purple-500",
	border: "border-purple-500",
	borderSoft: "border-purple-900/50",
	badge: "bg-purple-950/30 text-purple-400 border-purple-500",
	badgeVariant: "cyber-purple",
	handle: "bg-purple-500!",
	glow: "shadow-[0_0_15px_rgba(168,85,247,0.4)]",
	track: "bg-purple-950",
	bar: "bg-purple-500",
	chip: "text-purple-300 bg-purple-500/20",
};

const indigo: AccentTokens = {
	text: "text-indigo-300",
	textSoft: "text-indigo-400",
	label: "text-indigo-400",
	border: "border-indigo-500",
	borderSoft: "border-indigo-900/50",
	badge: "bg-indigo-950/60 text-indigo-400 border-indigo-600",
	badgeVariant: "cyber-blue",
	handle: "bg-indigo-500!",
	glow: "shadow-[0_0_24px_rgba(99,102,241,0.5)]",
	track: "bg-indigo-950",
	bar: "bg-indigo-500",
	chip: "text-indigo-300 bg-indigo-500/20",
};

/** Overrides de risco — sobrescrevem o accent da entidade */
const riskAtencao: AccentTokens = {
	text: "text-yellow-500",
	textSoft: "text-yellow-400",
	label: "text-yellow-600",
	border: "border-yellow-600",
	borderSoft: "border-yellow-900/50",
	badge: "bg-yellow-950/30 text-yellow-600 border-yellow-600",
	badgeVariant: "cyber-yellow",
	handle: "bg-yellow-500!",
	glow: "shadow-[0_0_15px_rgba(234,179,8,0.35)]",
	track: "bg-yellow-950",
	bar: "bg-yellow-500",
	chip: "text-yellow-300 bg-yellow-500/20",
};

const riskCritico: AccentTokens = {
	text: "text-red-500",
	textSoft: "text-red-400",
	label: "text-red-500",
	border: "border-red-500",
	borderSoft: "border-red-900/50",
	badge: "bg-red-950/40 text-red-500 border-red-500",
	badgeVariant: "cyber-red",
	handle: "bg-red-500!",
	glow: "shadow-[0_0_15px_rgba(239,68,68,0.5)]",
	track: "bg-red-950",
	bar: "bg-red-500",
	chip: "text-red-300 bg-red-500/20",
};

export const ENTITY_THEME: Record<string, EntityTheme> = {
	PESSOA: {
		icon: User,
		typeLabel: "[PESSOA]",
		loadingLabel: "Processando Dossiê...",
		accent: green,
		canShare: true
	},
	EMPRESA: {
		icon: Briefcase,
		typeLabel: "[PESSOA_JURÍDICA]",
		loadingLabel: "Pivoteando Malha...",
		accent: blue,
		canShare: true
	},
	DESPESA: {
		icon: DollarSign,
		typeLabel: "[DESPESA]",
		loadingLabel: "Pivoteando...",
		accent: slate,
		canShare: true
	},
	EMENDA: {
		icon: Landmark,
		typeLabel: "[EMENDA]",
		loadingLabel: "Analisando Execução...",
		accent: teal,
		canShare: true
	},
	EMENDA_RESUMO: {
		icon: Landmark,
		typeLabel: "[RESUMO_EMENDAS]",
		loadingLabel: "Processando...",
		accent: teal,
	},
	CONTRATO: {
		icon: FileText,
		typeLabel: "[CONTRATO_FEDERAL]",
		loadingLabel: "Processando...",
		accent: yellow,
		canShare: true
	},
	PROCESSO_JUDICIAL: {
		icon: Scale,
		typeLabel: "[PROCESSO_JUDICIAL]",
		loadingLabel: "Processando...",
		alwaysGlow: true,
		accent: red,
		canShare: true
	},
	ORGAO: {
		icon: Building2,
		typeLabel: "[INSTITUIÇÃO_PÚBLICA]",
		loadingLabel: "Interceptando Notas...",
		accent: emerald,
	},
	SOCIO: {
		icon: Users,
		typeLabel: "[SÓCIO_QSA]",
		loadingLabel: "Busca Reversa...",
		accent: purple,
	},
	RESUMO_GASTOS: {
		icon: BarChart3,
		typeLabel: "[COTA_DE_GABINETE]",
		loadingLabel: "Processando...",
		alwaysGlow: true,
		accent: indigo,
	},
};

const DEFAULT_THEME: EntityTheme = {
	icon: FileText,
	typeLabel: "[REGISTRO]",
	loadingLabel: "Processando...",
	accent: green,
};

/**
 * Resolvedor unificado de risco — mesmas regras no desktop e no mobile.
 */
export function resolveRisk(type: string, data: any): RiskLevel {
	if (!data) return "NORMAL";
	if (data.isFantasma ?? data._isFantasma) return "FANTASMA";
	if (type === "PROCESSO_JUDICIAL") return "CRITICO";
	const score = Number(data.score_letalidade ?? data.score ?? 0);
	const riscoNivel = data.riscoNivel ?? data._riscoTipo?.nivel;
	if (score >= 85 || riscoNivel === "CRÍTICO" || data.metrics?.suspicious)
		return "CRITICO";
	if (score >= 60) return "ATENCAO";
	return "NORMAL";
}

export interface NodeVisual {
	theme: EntityTheme;
	risk: RiskLevel;
	/** Tokens efetivos: accent da entidade ou override de risco */
	colors: AccentTokens;
}

export function getVisual(type: string, data: any): NodeVisual {
	const theme = ENTITY_THEME[type] ?? DEFAULT_THEME;
	const risk = resolveRisk(type, data);
	const colors =
		risk === "CRITICO" || risk === "FANTASMA"
			? riskCritico
			: risk === "ATENCAO"
				? riskAtencao
				: theme.accent;
	return { theme, risk, colors };
}
