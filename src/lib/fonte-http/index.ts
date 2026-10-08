/**
 * fonte-http — acesso único às fontes governamentais.
 *
 * Reúne o que cada client fazia (ou deixava de fazer) por conta própria:
 * timeout, nova tentativa com espera crescente em 429/5xx/queda de rede,
 * respeito ao `Retry-After`, prazo global, cache em memória (inclusive de
 * "não encontrado"), disjuntor por fonte e cabeçalhos de navegador.
 *
 * Referências do mcp-brasil (engenharia reversa, não dependência):
 *   - src/mcp_brasil/_shared/http_client.py  (retry + backoff exponencial)
 *   - src/mcp_brasil/_shared/cache.py        (ttl_cache com cache negativo)
 *   - scripts/canary_sources.py              (User-Agent de navegador)
 *
 * `buscarFonte` devolve um `Response` como o `fetch` e repassa o erro
 * original de timeout/rede (AbortError, TypeError) para não quebrar quem
 * já trata `e.name === "AbortError"`. `buscarJson` devolve um resultado
 * sem exceção, pronto para virar status "vazio"/"erro" no Dossiê.
 */
import type { Prazo } from "@/lib/prazo";
import {
	CacheRespostas,
	guardarResposta,
	recriarResposta,
} from "./cache";
import { Disjuntor } from "./disjuntor";
import { prazoDaInvestigacao, sinalizarFonte } from "./observador";
import {
	CABECALHOS_NAVEGADOR,
	calcularEsperaMs,
	completarCabecalhos,
	ESPERA_PADRAO,
	hostDe,
	lerRetryAfterMs,
	type ParametrosEspera,
	POLITICAS_POR_HOST,
	statusDeFalha,
	statusTransitorio,
} from "./politicas";

export type TipoErroFonte =
	| "TIMEOUT"
	| "HTTP_4XX"
	| "HTTP_5XX"
	| "REDE"
	| "PARSE"
	| "PRAZO"
	| "FONTE_INDISPONIVEL";

export class ErroFonte extends Error {
	constructor(
		public readonly tipo: TipoErroFonte,
		mensagem: string,
		public readonly status?: number,
	) {
		super(mensagem);
		this.name = "ErroFonte";
	}
}

export interface OpcoesCache {
	ttlMs: number;
	/** Validade de um 404 ("não encontrado"). Padrão: min(ttlMs, 5 min). */
	ttlNegativoMs?: number;
}

export interface OpcoesFonte extends RequestInit {
	/** Nome da fonte (liga o disjuntor e aparece nos logs). */
	fonte?: string;
	timeoutMs?: number;
	/** Total de tentativas, contando a primeira. Padrão: 3. */
	tentativas?: number;
	prazo?: Prazo;
	/** Cache em memória (nome distinto do cache do fetch). */
	memoria?: OpcoesCache;
	/** Envia User-Agent e Accept-Language de navegador. */
	navegador?: boolean;
	/** Aplica os ajustes por host (POLITICAS_POR_HOST). Padrão: true. */
	aplicarPoliticas?: boolean;
	fetchFn?: typeof fetch;
	dormir?: (ms: number) => Promise<void>;
	espera?: ParametrosEspera;
	/**
	 * Como a falha definitiva aparece para a investigação (observador.ts). "lenta" quando
	 * há uma fonte reserva a tentar em seguida: a tela mostra "tentando de novo", não "não respondeu".
	 */
	avisoDeFalha?: "falhou" | "lenta";
}

interface Config {
	url: string;
	init: RequestInit;
	fonte?: string;
	timeoutMs: number;
	tentativas: number;
	prazo?: Prazo;
	memoria?: OpcoesCache;
	fetchFn: typeof fetch;
	dormir: (ms: number) => Promise<void>;
	espera: ParametrosEspera;
	avisoDeFalha: "falhou" | "lenta";
	/** Prazo da investigação em curso (observador.ts): vale junto com o da chamada. */
	prazoGlobal?: Prazo;
}

const cacheGlobal = new CacheRespostas();
const disjuntorGlobal = new Disjuntor();

/** Zera cache e disjuntor (usado nos testes). */
export function reiniciarEstadoFonteHttp(): void {
	cacheGlobal.limpar();
	disjuntorGlobal.limpar();
}

const dormirPadrao = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

function montarCabecalhos(url: string, opcoes: OpcoesFonte): Headers {
	let headers = new Headers(opcoes.headers);
	if (opcoes.navegador) headers = completarCabecalhos(headers, CABECALHOS_NAVEGADOR);
	const politica = POLITICAS_POR_HOST[hostDe(url)];
	if (politica && opcoes.aplicarPoliticas !== false) {
		headers = completarCabecalhos(headers, politica);
	}
	return headers;
}

function normalizar(url: string | URL, opcoes: OpcoesFonte): Config {
	const {
		fonte, timeoutMs, tentativas, prazo, memoria, navegador: _n,
		aplicarPoliticas: _p, fetchFn, dormir, espera, avisoDeFalha, ...init
	} = opcoes;
	const href = String(url);
	return {
		url: href,
		init: { ...init, headers: montarCabecalhos(href, opcoes) },
		fonte,
		timeoutMs: timeoutMs ?? 8000,
		tentativas: Math.max(1, tentativas ?? 3),
		prazo,
		memoria,
		fetchFn: fetchFn ?? ((input, i) => globalThis.fetch(input, i)),
		dormir: dormir ?? dormirPadrao,
		espera: espera ?? ESPERA_PADRAO,
		avisoDeFalha: avisoDeFalha ?? "falhou",
		prazoGlobal: prazoDaInvestigacao(),
	};
}

/** O que ainda resta: o menor entre o prazo da chamada e o da investigação (Infinity = sem prazo). */
function restanteMs(cfg: Config): number {
	return Math.min(cfg.prazo?.restanteMs() ?? Infinity, cfg.prazoGlobal?.restanteMs() ?? Infinity);
}

function chaveCache(cfg: Config): string | null {
	const metodo = (cfg.init.method ?? "GET").toUpperCase();
	if (!cfg.memoria || metodo !== "GET") return null;
	const accept = new Headers(cfg.init.headers).get("accept") ?? "";
	return `${cfg.fonte ?? ""}|${accept}|${cfg.url}`;
}

function verificarDisponivel(cfg: Config): void {
	if (restanteMs(cfg) <= 0) {
		throw new ErroFonte("PRAZO", `Prazo esgotado antes de consultar ${cfg.fonte ?? cfg.url}`);
	}
	if (cfg.fonte && disjuntorGlobal.aberto(cfg.fonte)) {
		throw new ErroFonte("FONTE_INDISPONIVEL", `Fonte ${cfg.fonte} pausada após falhas seguidas`);
	}
}

function sinalComTimeout(cfg: Config, ms: number) {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), ms);
	const externo = cfg.init.signal;
	const signal =
		externo && typeof AbortSignal.any === "function"
			? AbortSignal.any([externo, controller.signal])
			: controller.signal;
	return { signal, liberar: () => clearTimeout(id) };
}

async function umaTentativa(cfg: Config): Promise<Response> {
	const ms = Math.min(cfg.timeoutMs, restanteMs(cfg));
	if (ms <= 0) throw new ErroFonte("PRAZO", `Prazo esgotado consultando ${cfg.fonte ?? cfg.url}`);
	const { signal, liberar } = sinalComTimeout(cfg, ms);
	try {
		return await cfg.fetchFn(cfg.url, { cache: "no-store", ...cfg.init, signal });
	} finally {
		liberar();
	}
}

function registrarSaude(cfg: Config, falhou: boolean): void {
	if (!cfg.fonte) return;
	if (falhou) disjuntorGlobal.registrarFalha(cfg.fonte);
	else disjuntorGlobal.registrarSucesso(cfg.fonte);
}

function cabeNoPrazo(cfg: Config, esperaMs: number): boolean {
	const resto = restanteMs(cfg);
	if (resto === Infinity) return true;
	// Depois da espera ainda precisa sobrar tempo para a tentativa.
	return resto > esperaMs + 250;
}

function erroRepetivel(erro: unknown): boolean {
	return !(erro instanceof ErroFonte);
}

async function descartarCorpo(res: Response): Promise<void> {
	try {
		await res.body?.cancel();
	} catch {
		// corpo já consumido ou indisponível
	}
}

/** Decide se a resposta encerra o ciclo de tentativas. */
async function tratarResposta(
	cfg: Config,
	res: Response,
	n: number,
): Promise<Response | null> {
	registrarSaude(cfg, statusDeFalha(res.status));
	const ultima = n >= cfg.tentativas - 1;
	if (!statusTransitorio(res.status) || ultima) return res;
	const espera = calcularEsperaMs(n, lerRetryAfterMs(res.headers.get("retry-after")), cfg.espera);
	if (!cabeNoPrazo(cfg, espera)) return res;
	sinalizarFonte({ tipo: "lenta", url: cfg.url, fonte: cfg.fonte, motivo: res.status >= 500 ? "HTTP_5XX" : "HTTP_4XX", status: res.status });
	await descartarCorpo(res);
	await cfg.dormir(espera);
	return null;
}

/** Decide se o erro encerra o ciclo (relançando) ou se tenta de novo. */
async function tratarErro(cfg: Config, erro: unknown, n: number): Promise<void> {
	if (!erroRepetivel(erro)) throw erro;
	registrarSaude(cfg, true);
	const espera = calcularEsperaMs(n, null, cfg.espera);
	if (n >= cfg.tentativas - 1 || !cabeNoPrazo(cfg, espera)) throw erro;
	sinalizarFonte({ tipo: "lenta", url: cfg.url, fonte: cfg.fonte, motivo: classificarErroFonte(erro) });
	await cfg.dormir(espera);
}

async function executarComTentativas(cfg: Config): Promise<Response> {
	for (let n = 0; ; n++) {
		let res: Response;
		try {
			res = await umaTentativa(cfg);
		} catch (erro) {
			await tratarErro(cfg, erro, n);
			continue;
		}
		const final = await tratarResposta(cfg, res, n);
		if (final) return final;
	}
}

function ttlPara(cfg: Config, status: number): number {
	if (!cfg.memoria) return 0;
	if (status >= 200 && status < 300) return cfg.memoria.ttlMs;
	if (status === 404) return cfg.memoria.ttlNegativoMs ?? Math.min(cfg.memoria.ttlMs, 300_000);
	return 0;
}

async function guardarSeCouber(cfg: Config, chave: string | null, res: Response): Promise<Response> {
	const ttl = ttlPara(cfg, res.status);
	if (!chave || ttl <= 0) return res;
	const guardada = await guardarResposta(res);
	cacheGlobal.guardar(chave, guardada, ttl);
	return recriarResposta(guardada);
}

/** Problema de conexão para quem usa: 5xx, 429 (limite) e 401/403 (acesso recusado). 404 e outros 4xx são resposta. */
export function statusDeProblema(status: number): boolean {
	return status >= 500 || status === 429 || status === 401 || status === 403;
}

/** Falha definitiva para o observador: "falhou", ou "lenta" quando há reserva a tentar. */
function avisarFalha(cfg: Config, erro: TipoErroFonte, status?: number): void {
	if (cfg.avisoDeFalha === "lenta") sinalizarFonte({ tipo: "lenta", url: cfg.url, fonte: cfg.fonte, motivo: erro, status });
	else sinalizarFonte({ tipo: "falhou", url: cfg.url, fonte: cfg.fonte, erro, status });
}

/** Conta ao observador da investigação (observador.ts) como a fonte respondeu. */
function avisarResultado(cfg: Config, res: Response): void {
	if (!statusDeProblema(res.status)) {
		sinalizarFonte({ tipo: "respondeu", url: cfg.url, fonte: cfg.fonte });
		return;
	}
	avisarFalha(cfg, res.status >= 500 ? "HTTP_5XX" : "HTTP_4XX", res.status);
}

async function consultar(cfg: Config): Promise<Response> {
	verificarDisponivel(cfg);
	const chave = chaveCache(cfg);
	const guardada = chave ? cacheGlobal.ler(chave) : null;
	if (guardada) return recriarResposta(guardada);
	const res = await executarComTentativas(cfg);
	avisarResultado(cfg, res);
	return guardarSeCouber(cfg, chave, res);
}

/**
 * Consulta uma fonte governamental. Devolve o `Response` (inclusive 4xx/5xx
 * depois de esgotar as tentativas) e relança o erro original de rede/timeout.
 */
export async function buscarFonte(
	url: string | URL,
	opcoes: OpcoesFonte = {},
): Promise<Response> {
	const cfg = normalizar(url, opcoes);
	try {
		return await consultar(cfg);
	} catch (erro) {
		avisarFalha(cfg, classificarErroFonte(erro));
		throw erro;
	}
}

export type ResultadoJson<T> =
	| { ok: true; dados: T; status: number }
	| { ok: false; erro: TipoErroFonte; status?: number; mensagem: string };

export function classificarErroFonte(erro: unknown): TipoErroFonte {
	if (erro instanceof ErroFonte) return erro.tipo;
	const nome = (erro as { name?: string })?.name;
	if (nome === "AbortError" || nome === "TimeoutError") return "TIMEOUT";
	return "REDE";
}

async function lerJson<T>(res: Response): Promise<ResultadoJson<T>> {
	if (!res.ok) {
		const erro: TipoErroFonte = res.status >= 500 ? "HTTP_5XX" : "HTTP_4XX";
		return { ok: false, erro, status: res.status, mensagem: `HTTP ${res.status}` };
	}
	try {
		return { ok: true, dados: (await res.json()) as T, status: res.status };
	} catch (e) {
		return { ok: false, erro: "PARSE", status: res.status, mensagem: String(e) };
	}
}

/** Consulta uma fonte que responde JSON, sem lançar exceção. */
export async function buscarJson<T = unknown>(
	url: string | URL,
	opcoes: OpcoesFonte = {},
): Promise<ResultadoJson<T>> {
	try {
		const headers = completarCabecalhos(opcoes.headers, { Accept: "application/json" });
		const res = await buscarFonte(url, { ...opcoes, headers });
		return await lerJson<T>(res);
	} catch (erro) {
		return {
			ok: false,
			erro: classificarErroFonte(erro),
			mensagem: (erro as Error)?.message ?? String(erro),
		};
	}
}
