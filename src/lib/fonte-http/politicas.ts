/**
 * Políticas de acesso às fontes governamentais.
 *
 * - Cabeçalhos de navegador: portais gov.br com WAF bloqueiam assinaturas
 *   de ferramentas (curl, python-requests…). Ideia portada do
 *   `scripts/canary_sources.py` do mcp-brasil.
 * - Políticas por host: ajustes que cada portal exige (ex.: o e-Contas do
 *   TCE-TO devolve depuração PHP se não receber `Accept: application/json`,
 *   conforme `data/tce_to/client.py` do mcp-brasil).
 * - Nova tentativa: só em 429, 5xx e erro de rede, com espera crescente
 *   (base × 2^tentativa + variação), respeitando `Retry-After`. Ideia do
 *   `_shared/http_client.py` do mcp-brasil.
 */

export const USER_AGENT_NAVEGADOR =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

export const CABECALHOS_NAVEGADOR: Record<string, string> = {
	"User-Agent": USER_AGENT_NAVEGADOR,
	Accept: "application/json, text/plain, */*",
	"Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

/** Cabeçalhos extras exigidos por host (só preenchem o que faltar). */
export const POLITICAS_POR_HOST: Record<string, Record<string, string>> = {
	"api.tceto.tc.br": { Accept: "application/json" },
};

const STATUS_TRANSITORIOS = new Set([429, 500, 502, 503, 504]);

export function statusTransitorio(status: number): boolean {
	return STATUS_TRANSITORIOS.has(status);
}

/** Falha que conta contra a saúde da fonte (o 429 é limite, não queda). */
export function statusDeFalha(status: number): boolean {
	return status >= 500;
}

export function hostDe(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return "";
	}
}

/**
 * Mescla cabeçalhos sem sobrescrever o que o chamador já definiu.
 * Os nomes são comparados sem diferenciar maiúsculas.
 */
export function completarCabecalhos(
	existentes: HeadersInit | undefined,
	extras: Record<string, string>,
): Headers {
	const headers = new Headers(existentes);
	for (const [nome, valor] of Object.entries(extras)) {
		if (!headers.has(nome)) headers.set(nome, valor);
	}
	return headers;
}

/**
 * Lê `Retry-After` (segundos ou data HTTP) e devolve a espera em ms,
 * ou null quando ausente/inválido.
 */
export function lerRetryAfterMs(
	valor: string | null,
	agora: number = Date.now(),
): number | null {
	if (!valor) return null;
	const segundos = Number(valor);
	if (Number.isFinite(segundos)) return Math.max(0, segundos * 1000);
	const data = Date.parse(valor);
	if (Number.isNaN(data)) return null;
	return Math.max(0, data - agora);
}

export interface ParametrosEspera {
	baseMs: number;
	maxMs: number;
	aleatorio: () => number;
}

export const ESPERA_PADRAO: ParametrosEspera = {
	baseMs: 500,
	maxMs: 8_000,
	aleatorio: Math.random,
};

/** Espera antes da tentativa `n` (0 = primeira nova tentativa). */
export function calcularEsperaMs(
	tentativa: number,
	retryAfterMs: number | null,
	params: ParametrosEspera = ESPERA_PADRAO,
): number {
	if (retryAfterMs !== null) return Math.min(retryAfterMs, 30_000);
	const exponencial = params.baseMs * 2 ** tentativa;
	const variacao = params.aleatorio() * params.baseMs * 0.5;
	return Math.min(exponencial + variacao, params.maxMs);
}
