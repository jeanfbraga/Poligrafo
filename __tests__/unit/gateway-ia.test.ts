import { describe, expect, it, vi } from "vitest";
import { Prazo } from "../../src/lib/prazo";
import { gerar, lerJsonIA, limparTextoIA, resumoDaFalhaIA } from "../../src/services/ai/gateway";
import { classificarFalha, lerDuracaoMs } from "../../src/services/ai/gateway/falhas";
import { modelosEmRodizio } from "../../src/services/ai/gateway/registro";
import { SaudeIA } from "../../src/services/ai/gateway/saude";

const ENV = { GROQ_API_KEY: "g", GEMINI_API_KEY: "m", OPENROUTER_API_KEY: "o" } as unknown as NodeJS.ProcessEnv;

function respostaOpenAI(texto: string) {
	return new Response(JSON.stringify({ choices: [{ message: { content: texto } }] }), { status: 200 });
}
function respostaGemini(texto: string) {
	return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), { status: 200 });
}

describe("falhas", () => {
	it("lê durações dos provedores", () => {
		expect(lerDuracaoMs("2m59.56s")).toBeCloseTo(179_560);
		expect(lerDuracaoMs("35s")).toBe(35_000);
		expect(lerDuracaoMs("500ms")).toBe(500);
		expect(lerDuracaoMs("3")).toBe(3_000);
		expect(lerDuracaoMs("x")).toBeNull();
	});

	it("429 do OpenRouter pausa o provedor inteiro (limite da conta)", () => {
		const f = classificarFalha({ status: 429, headers: new Headers({ "retry-after": "20" }), limiteDaConta: true });
		expect(f).toEqual({ tipo: "RATE_LIMIT", escopo: "provedor", cooldownMs: 20_000 });
	});

	it("429 comum pausa só o modelo; RetryInfo do Gemini vira pausa", () => {
		const f = classificarFalha({ status: 429, corpo: '{"error":{"details":[{"retryDelay":"35s"}]}}' });
		expect(f).toMatchObject({ tipo: "RATE_LIMIT", escopo: "modelo", cooldownMs: 35_000 });
	});

	it("modelo descontinuado fica 24 h fora; 413 só pula nesta chamada; 401 pausa o provedor", () => {
		expect(classificarFalha({ status: 400, corpo: "model_decommissioned" })).toMatchObject({ tipo: "NAO_EXISTE", escopo: "modelo" });
		expect(classificarFalha({ status: 413 })).toEqual({ tipo: "PAYLOAD", escopo: "chamada" });
		expect(classificarFalha({ status: 401 })).toMatchObject({ tipo: "AUTH", escopo: "provedor" });
		expect(classificarFalha({ erro: "TIMEOUT" })).toEqual({ tipo: "TIMEOUT", escopo: "modelo" });
	});
});

describe("saúde dos modelos", () => {
	it("pausa em escada e volta depois; sucesso zera", () => {
		let agora = 0;
		const s = new SaudeIA(() => agora);
		s.registrarFalha("groq", "m1", { tipo: "SERVIDOR", escopo: "modelo" });
		expect(s.disponivel("groq", "m1")).toBe(false);
		expect(s.disponivel("groq", "m2")).toBe(true);
		agora = 31_000;
		expect(s.disponivel("groq", "m1")).toBe(true);
		s.registrarFalha("groq", "m1", { tipo: "SERVIDOR", escopo: "modelo" });
		expect(s.restanteMs("groq", "m1")).toBe(120_000);
		s.registrarSucesso("groq", "m1");
		expect(s.disponivel("groq", "m1")).toBe(true);
	});

	it("pausa de provedor bloqueia todos os modelos dele", () => {
		const s = new SaudeIA(() => 0);
		s.registrarFalha("openrouter", "x", { tipo: "RATE_LIMIT", escopo: "provedor" });
		expect(s.disponivel("openrouter", "outro")).toBe(false);
	});
});

describe("gateway gerar()", () => {
	it("rodízio alterna provedores e ignora os sem chave", () => {
		const ordem = modelosEmRodizio("triagem-json", { GROQ_API_KEY: "g", GEMINI_API_KEY: "m" } as unknown as NodeJS.ProcessEnv);
		expect(ordem[0].provedor).toBe("gemini");
		expect(ordem[1].provedor).toBe("groq");
		expect(ordem.some((m) => m.provedor === "openrouter")).toBe(false);
	});

	it("sem nenhuma chave: SEM_PROVEDOR, sem rede", async () => {
		const fetchFn = vi.fn();
		const r = await gerar({ tarefa: "texto", sistema: "s", usuario: "u", formato: "texto", env: {} as NodeJS.ProcessEnv, fetchFn });
		expect(r).toEqual({ ok: false, motivo: "SEM_PROVEDOR", tentativas: [] });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("429 no Gemini pula para a Groq, que responde JSON válido", async () => {
		const fetchFn = vi.fn(async (url: string) => {
			if (url.includes("googleapis")) return new Response("limite", { status: 429, headers: { "retry-after": "10" } });
			return respostaOpenAI('{"avaliacoes": [{"id": "a"}]}');
		});
		const saude = new SaudeIA();
		const r = await gerar({ tarefa: "triagem-json", sistema: "s", usuario: "u", formato: "json", chaveRaiz: "avaliacoes", env: ENV, fetchFn: fetchFn as never, saude });
		expect(r).toMatchObject({ ok: true, provedor: "groq" });
		expect(r.tentativas[0]).toMatchObject({ provedor: "gemini", resultado: "RATE_LIMIT" });
		expect(saude.disponivel("gemini", r.tentativas[0].modelo)).toBe(false);
	});

	it("falha registra no log cada tentativa e quantos modelos estavam pausados", () => {
		const saude = { disponivel: (p: string) => p !== "groq" };
		const fila = modelosEmRodizio("triagem-json", { GROQ_API_KEY: "g", GEMINI_API_KEY: "m" } as unknown as NodeJS.ProcessEnv);
		const linha = resumoDaFalhaIA(
			{ ok: false, motivo: "ESGOTADO", tentativas: [{ provedor: "gemini", modelo: "x", resultado: "RATE_LIMIT", ms: 40 }] },
			fila,
			saude,
		);
		const pausados = fila.filter((m) => m.provedor === "groq").length;
		expect(linha).toBe(`[IA] Nenhum modelo respondeu (ESGOTADO). Tentativas: gemini/x=RATE_LIMIT (40 ms). Pausados por falhas recentes: ${pausados} de ${fila.length}.`);
	});

	it("resposta fora do contrato tenta o próximo modelo", async () => {
		let n = 0;
		const fetchFn = vi.fn(async () => {
			n++;
			return respostaOpenAI(n === 1 ? '{"avaliacoes": []}' : '{"avaliacoes": [{"id":"a"}]}');
		});
		const validar = (j: any) => (j.avaliacoes.length ? { success: true as const } : { success: false as const, error: "vazio" });
		const r = await gerar({
			tarefa: "triagem-json", sistema: "s", usuario: "u", formato: "json", chaveRaiz: "avaliacoes", validar,
			env: { GROQ_API_KEY: "g" } as unknown as NodeJS.ProcessEnv, fetchFn: fetchFn as never, saude: new SaudeIA(),
		});
		expect(r.ok).toBe(true);
		expect(r.tentativas.map((t) => t.resultado)).toEqual(["INVALIDO", "OK"]);
	});

	it("chave do Gemini vai no cabeçalho, nunca na URL", async () => {
		const fetchFn = vi.fn(async () => respostaGemini("ok"));
		await gerar({ tarefa: "texto", sistema: "s", usuario: "u", formato: "texto", env: { GEMINI_API_KEY: "SEGREDO" } as unknown as NodeJS.ProcessEnv, fetchFn: fetchFn as never, saude: new SaudeIA() });
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).not.toContain("SEGREDO");
		expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("SEGREDO");
	});

	it("prazo esgotado não começa nova tentativa", async () => {
		const fetchFn = vi.fn();
		const r = await gerar({ tarefa: "texto", sistema: "s", usuario: "u", formato: "texto", env: ENV, fetchFn, prazo: new Prazo(0), saude: new SaudeIA() });
		expect(r).toMatchObject({ ok: false, motivo: "PRAZO" });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("tudo falhando: ESGOTADO, nunca exceção", async () => {
		const fetchFn = vi.fn(async () => new Response("erro", { status: 503 }));
		const r = await gerar({ tarefa: "texto", sistema: "s", usuario: "u", formato: "texto", env: ENV, fetchFn: fetchFn as never, saude: new SaudeIA(), maxTentativas: 3 });
		expect(r).toMatchObject({ ok: false, motivo: "ESGOTADO" });
		expect(r.tentativas).toHaveLength(3);
	});
});

describe("leitura da resposta", () => {
	it("remove <think> e cercas de código e acha o JSON", () => {
		expect(limparTextoIA("<think>hm</think>```json\n{}\n```")).toBe("{}");
		expect(lerJsonIA('texto antes {"a": 1} depois')).toEqual({ a: 1 });
		expect(lerJsonIA("sem json")).toBeNull();
	});
});
