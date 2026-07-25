import { NextResponse } from "next/server";

/**
 * Rate limiter em memória, por IP (fixed window).
 *
 * Limitação consciente: o estado vive na instância do processo. Em deploys
 * serverless com múltiplas instâncias o limite é aplicado por instância —
 * suficiente como primeira linha de defesa contra abuso de rotas que
 * consomem quotas pagas (LLMs, scrapers). Para limites globais rigorosos,
 * troque por um store externo (ex.: Upstash Redis) mantendo esta interface.
 */

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Limpeza periódica de entradas expiradas para não vazar memória
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupExpired(now: number) {
	if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
	lastCleanup = now;
	for (const [key, entry] of buckets) {
		if (entry.resetAt <= now) buckets.delete(key);
	}
}

export function getClientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0].trim();
	return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimitOptions {
	/** Máximo de requisições por janela (padrão: 10) */
	limit?: number;
	/** Tamanho da janela em ms (padrão: 60_000 = 1 min) */
	windowMs?: number;
	/** Escopo para isolar contadores entre rotas (padrão: "global") */
	scope?: string;
}

/**
 * Retorna uma NextResponse 429 quando o limite foi excedido, ou null quando
 * a requisição pode prosseguir. Uso no início do handler:
 *
 *   const limited = checkRateLimit(request, { scope: "investigar" });
 *   if (limited) return limited;
 */
export function checkRateLimit(
	request: Request,
	{ limit = 10, windowMs = 60_000, scope = "global" }: RateLimitOptions = {},
): NextResponse | null {
	const now = Date.now();
	cleanupExpired(now);

	const key = `${scope}:${getClientIp(request)}`;
	const entry = buckets.get(key);

	if (!entry || entry.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return null;
	}

	entry.count += 1;
	if (entry.count <= limit) return null;

	const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
	return NextResponse.json(
		{ error: "Muitas requisições. Tente novamente em instantes." },
		{
			status: 429,
			headers: { "Retry-After": String(retryAfterSec) },
		},
	);
}

/** Exportado apenas para testes: limpa todos os contadores. */
export function resetRateLimits() {
	buckets.clear();
}
