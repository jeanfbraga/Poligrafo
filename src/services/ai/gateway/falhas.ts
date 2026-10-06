/**
 * Classifica a falha de uma chamada de IA: o que aconteceu, quem pausar
 * (só o modelo ou o provedor inteiro) e por quanto tempo.
 *
 * Antes, um 429 só pulava para o próximo modelo do MESMO provedor (no
 * OpenRouter :free o limite é da conta: tentar o próximo :free só gastava
 * tempo), o `retry-after` era ignorado e um modelo descontinuado era tentado
 * de novo em toda chamada.
 */

export type TipoFalha = "AUTH" | "RATE_LIMIT" | "NAO_EXISTE" | "PAYLOAD" | "SERVIDOR" | "TIMEOUT" | "REDE" | "OUTRO";

export interface Falha {
	tipo: TipoFalha;
	/** Quem fica pausado. "chamada" = só pula nesta chamada (ex.: lote grande demais). */
	escopo: "modelo" | "provedor" | "chamada";
	/** Pausa sugerida pela fonte (Retry-After, x-ratelimit-reset, RetryInfo). */
	cooldownMs?: number;
}

const UMA_HORA = 3_600_000;
const UM_DIA = 24 * UMA_HORA;

/** "2m59.56s", "1.5s", "35s", "500ms" → ms. */
export function lerDuracaoMs(texto: string | null | undefined): number | null {
	if (!texto) return null;
	const s = String(texto).trim();
	if (/^\d+(\.\d+)?$/.test(s)) return Number(s) * 1000;
	const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
	let total = 0;
	let achou = false;
	for (const [, n, u] of s.matchAll(re)) {
		achou = true;
		total += Number(n) * ({ ms: 1, s: 1000, m: 60_000, h: UMA_HORA } as Record<string, number>)[u];
	}
	return achou ? total : null;
}

function cooldownDe(headers: Headers | null, corpo: string): number | undefined {
	const candidatos = [
		headers?.get("retry-after"),
		headers?.get("x-ratelimit-reset-requests"),
		headers?.get("x-ratelimit-reset-tokens"),
		corpo.match(/"retryDelay"\s*:\s*"([^"]+)"/)?.[1],
	];
	const ms = candidatos.map(lerDuracaoMs).filter((v): v is number => v !== null);
	return ms.length ? Math.max(...ms) : undefined;
}

const MODELO_INEXISTENTE = /model_decommissioned|model_not_found|does not exist|not found|no endpoints found|decommissioned/i;
const CONTEXTO_GRANDE = /context.length|too large|maximum context|request too large|tokens? (per|limit)/i;
const LIMITE_DIARIO = /per.day|daily|free-models-per-day|quota/i;

function falhaPorStatus(status: number, corpo: string, limiteDaConta: boolean, cooldown?: number): Falha {
	if ([401, 402, 403].includes(status)) return { tipo: "AUTH", escopo: "provedor", cooldownMs: UMA_HORA };
	if (status === 429) {
		const daConta = limiteDaConta || LIMITE_DIARIO.test(corpo);
		return { tipo: "RATE_LIMIT", escopo: daConta ? "provedor" : "modelo", cooldownMs: cooldown };
	}
	if (status === 404 || MODELO_INEXISTENTE.test(corpo)) return { tipo: "NAO_EXISTE", escopo: "modelo", cooldownMs: UM_DIA };
	if (status === 413 || CONTEXTO_GRANDE.test(corpo)) return { tipo: "PAYLOAD", escopo: "chamada" };
	if (status >= 500) return { tipo: "SERVIDOR", escopo: "modelo", cooldownMs: cooldown };
	return { tipo: "OUTRO", escopo: "chamada" };
}

export function classificarFalha(entrada: {
	status?: number | null;
	headers?: Headers | null;
	corpo?: string;
	erro?: "TIMEOUT" | "REDE";
	limiteDaConta?: boolean;
}): Falha {
	if (entrada.erro === "TIMEOUT") return { tipo: "TIMEOUT", escopo: "modelo" };
	if (entrada.erro === "REDE") return { tipo: "REDE", escopo: "provedor" };
	const corpo = entrada.corpo ?? "";
	const cooldown = cooldownDe(entrada.headers ?? null, corpo);
	return falhaPorStatus(entrada.status ?? 0, corpo, Boolean(entrada.limiteDaConta), cooldown);
}
