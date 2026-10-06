import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	buscarFonte,
	buscarJson,
	ErroFonte,
	reiniciarEstadoFonteHttp,
} from "../../src/lib/fonte-http";
import {
	calcularEsperaMs,
	lerRetryAfterMs,
	USER_AGENT_NAVEGADOR,
} from "../../src/lib/fonte-http/politicas";
import { Prazo } from "../../src/lib/prazo";

const semEspera = async () => {};

function resposta(status: number, corpo: unknown = {}, headers: Record<string, string> = {}) {
	return new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
		status,
		headers,
	});
}

function erroAbort() {
	const e = new Error("This operation was aborted");
	e.name = "AbortError";
	return e;
}

describe("fonte-http", () => {
	beforeEach(() => reiniciarEstadoFonteHttp());

	it("tenta de novo em 503 e devolve o sucesso", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(resposta(503))
			.mockResolvedValueOnce(resposta(200, { ok: 1 }));
		const res = await buscarFonte("https://x.gov.br/a", { fetchFn, dormir: semEspera });
		expect(res.status).toBe(200);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it("não tenta de novo em 404", async () => {
		const fetchFn = vi.fn().mockResolvedValue(resposta(404));
		const res = await buscarFonte("https://x.gov.br/a", { fetchFn, dormir: semEspera });
		expect(res.status).toBe(404);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("respeita Retry-After do 429", async () => {
		const dormir = vi.fn(semEspera);
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(resposta(429, {}, { "retry-after": "2" }))
			.mockResolvedValueOnce(resposta(200));
		await buscarFonte("https://x.gov.br/a", { fetchFn, dormir });
		expect(dormir).toHaveBeenCalledWith(2000);
	});

	it("devolve a última resposta 5xx quando acabam as tentativas", async () => {
		const fetchFn = vi.fn().mockResolvedValue(resposta(502));
		const res = await buscarFonte("https://x.gov.br/a", {
			fetchFn,
			dormir: semEspera,
			tentativas: 3,
		});
		expect(res.status).toBe(502);
		expect(fetchFn).toHaveBeenCalledTimes(3);
	});

	it("relança o AbortError original (compatível com quem trata e.name)", async () => {
		const fetchFn = vi.fn().mockRejectedValue(erroAbort());
		await expect(
			buscarFonte("https://x.gov.br/a", { fetchFn, dormir: semEspera, tentativas: 2 }),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it("não começa uma tentativa sem prazo restante", async () => {
		const fetchFn = vi.fn();
		const prazo = new Prazo(0);
		await expect(buscarFonte("https://x.gov.br/a", { fetchFn, prazo })).rejects.toBeInstanceOf(
			ErroFonte,
		);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("não espera além do prazo: devolve a resposta em vez de dormir", async () => {
		let agora = 0;
		const prazo = new Prazo(1000, () => agora);
		const dormir = vi.fn(semEspera);
		const fetchFn = vi.fn().mockImplementation(async () => {
			agora += 900;
			return resposta(503, {}, { "retry-after": "5" });
		});
		const res = await buscarFonte("https://x.gov.br/a", { fetchFn, dormir, prazo });
		expect(res.status).toBe(503);
		expect(dormir).not.toHaveBeenCalled();
	});

	it("abre o disjuntor depois de 3 falhas seguidas da mesma fonte", async () => {
		const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		for (let i = 0; i < 3; i++) {
			await expect(
				buscarFonte("https://x.gov.br/a", { fetchFn, fonte: "tce-xx", tentativas: 1 }),
			).rejects.toBeInstanceOf(TypeError);
		}
		await expect(
			buscarFonte("https://x.gov.br/a", { fetchFn, fonte: "tce-xx", tentativas: 1 }),
		).rejects.toMatchObject({ tipo: "FONTE_INDISPONIVEL" });
		expect(fetchFn).toHaveBeenCalledTimes(3);
	});

	it("guarda resposta 200 em cache e também o 404 (cache negativo)", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(resposta(200, { a: 1 }))
			.mockResolvedValueOnce(resposta(404));
		const opcoes = { fetchFn, memoria: { ttlMs: 60_000 } };
		const r1 = await buscarFonte("https://x.gov.br/ok", opcoes);
		const r2 = await buscarFonte("https://x.gov.br/ok", opcoes);
		expect(await r1.json()).toEqual({ a: 1 });
		expect(await r2.json()).toEqual({ a: 1 });
		await buscarFonte("https://x.gov.br/vazio", opcoes);
		const r4 = await buscarFonte("https://x.gov.br/vazio", opcoes);
		expect(r4.status).toBe(404);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it("envia cabeçalhos de navegador sem sobrescrever os do chamador", async () => {
		const fetchFn = vi.fn().mockResolvedValue(resposta(200));
		await buscarFonte("https://x.gov.br/a", {
			fetchFn,
			navegador: true,
			headers: { Accept: "text/csv" },
		});
		const headers = new Headers(fetchFn.mock.calls[0][1].headers);
		expect(headers.get("user-agent")).toBe(USER_AGENT_NAVEGADOR);
		expect(headers.get("accept")).toBe("text/csv");
	});

	it("aplica a política do host do TCE-TO (Accept JSON)", async () => {
		const fetchFn = vi.fn().mockResolvedValue(resposta(200));
		await buscarFonte("https://api.tceto.tc.br/econtas/api/pessoas", { fetchFn });
		const headers = new Headers(fetchFn.mock.calls[0][1].headers);
		expect(headers.get("accept")).toBe("application/json");
	});

	it("buscarJson devolve resultado sem lançar exceção", async () => {
		const ok = await buscarJson("https://x.gov.br/a", {
			fetchFn: vi.fn().mockResolvedValue(resposta(200, [1, 2])),
		});
		expect(ok).toEqual({ ok: true, dados: [1, 2], status: 200 });

		const parse = await buscarJson("https://x.gov.br/b", {
			fetchFn: vi.fn().mockResolvedValue(resposta(200, "<html>")),
		});
		expect(parse).toMatchObject({ ok: false, erro: "PARSE" });

		const timeout = await buscarJson("https://x.gov.br/c", {
			fetchFn: vi.fn().mockRejectedValue(erroAbort()),
			tentativas: 1,
		});
		expect(timeout).toMatchObject({ ok: false, erro: "TIMEOUT" });

		const http = await buscarJson("https://x.gov.br/d", {
			fetchFn: vi.fn().mockResolvedValue(resposta(403)),
		});
		expect(http).toMatchObject({ ok: false, erro: "HTTP_4XX", status: 403 });
	});
});

describe("políticas de espera", () => {
	it("lê Retry-After em segundos e em data HTTP", () => {
		expect(lerRetryAfterMs("3")).toBe(3000);
		expect(lerRetryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
		expect(lerRetryAfterMs(null)).toBeNull();
		expect(lerRetryAfterMs("amanhã")).toBeNull();
	});

	it("cresce exponencialmente com teto", () => {
		const params = { baseMs: 500, maxMs: 8_000, aleatorio: () => 0 };
		expect(calcularEsperaMs(0, null, params)).toBe(500);
		expect(calcularEsperaMs(2, null, params)).toBe(2_000);
		expect(calcularEsperaMs(10, null, params)).toBe(8_000);
		expect(calcularEsperaMs(0, 90_000, params)).toBe(30_000);
	});
});
