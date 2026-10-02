/* ==========================================================================
   Risco de um nó — regra única para canvas, rail, inspetor e mobile.
   ok    : score < 60
   warn  : 60 ≤ score < 85            (▲ atenção)
   crit  : score ≥ 85, emenda fantasma, processo/sanção, nível "CRÍTICO"
           da API ou nó apontado como suspeito pela matemática de grafos (◆)
   ========================================================================== */

export type Risco = "ok" | "warn" | "crit";

export const LIMITE_ATENCAO = 60;
export const LIMITE_CRITICO = 85;

type Dados = Record<string, unknown> | undefined | null;

export function scoreDoNo(data: Dados): number {
	return Number((data?.score_letalidade as number | undefined) ?? (data?.score as number | undefined) ?? 0) || 0;
}

/** Regras que tornam um nó crítico independentemente da nota da IA (fonte única das regras e dos motivos). */
const REGRAS_CRITICAS: readonly [(type: string, data: Dados) => boolean, string][] = [
	[(_t, d) => Boolean(d?.isFantasma || d?._isFantasma), "emenda fantasma"],
	[(t) => t === "PROCESSO_JUDICIAL", "processo judicial ou sanção"],
	[
		(_t, d) => ((d?.riscoNivel as string | undefined) ?? (d?._riscoTipo as { nivel?: string } | undefined)?.nivel) === "CRÍTICO",
		"classificação crítica da fonte",
	],
	[(_t, d) => Boolean((d?.metrics as { suspicious?: boolean } | undefined)?.suspicious), "padrão suspeito na rede (grafo)"],
];

function criticoPorFlag(type: string, data: Dados): boolean {
	return REGRAS_CRITICAS.some(([ehCritico]) => ehCritico(type, data));
}

/**
 * Por que o nó é crítico quando a nota da IA NÃO chega a 85 (ex.: emenda fantasma com nota 20).
 * `null` = o risco é só o da nota (ou o nó não é crítico).
 */
export function regraCritica(type: string, data: Dados): string | null {
	if (!data || scoreDoNo(data) >= LIMITE_CRITICO) return null;
	return REGRAS_CRITICAS.find(([ehCritico]) => ehCritico(type, data))?.[1] ?? null;
}

export function riscoDoNo(type: string, data: Dados): Risco {
	if (!data) return "ok";
	if (criticoPorFlag(type, data)) return "crit";
	const score = scoreDoNo(data);
	if (score >= LIMITE_CRITICO) return "crit";
	return score >= LIMITE_ATENCAO ? "warn" : "ok";
}

export const GLIFO_RISCO: Record<Risco, string> = { ok: "·", warn: "▲", crit: "◆" };
export const ROTULO_RISCO: Record<Risco, string> = { ok: "NORMAL", warn: "ATENÇÃO", crit: "CRÍTICO" };

/** Risco de uma aresta = risco do nó de destino. */
export function riscoDaAresta(riscoAlvo: Risco): Risco {
	return riscoAlvo;
}
