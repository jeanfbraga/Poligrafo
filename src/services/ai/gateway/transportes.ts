/**
 * Transportes de chamada aos provedores de IA.
 *  - openai-compat: Groq, OpenRouter, Cerebras, Mistral, GitHub Models,
 *    Cloudflare (todos aceitam /chat/completions no formato da OpenAI);
 *  - gemini: Google AI Studio, com a chave no CABEÇALHO `x-goog-api-key`
 *    (antes ia na URL, `?key=`), `systemInstruction` e `responseMimeType`.
 */
import type { ModeloIA, Provedor } from "./registro";

export interface PedidoTransporte {
	sistema: string;
	usuario: string;
	formato: "json" | "texto";
	timeoutMs: number;
	maxTokens?: number;
}

export type ResultadoTransporte =
	| { ok: true; texto: string }
	| { ok: false; status?: number; headers?: Headers; corpo?: string; erro?: "TIMEOUT" | "REDE" };

interface Contexto {
	provedor: Provedor;
	modelo: ModeloIA;
	chave: string;
	baseUrl: string;
	fetchFn: typeof fetch;
}

function erroDeRede(e: unknown): ResultadoTransporte {
	const nome = (e as { name?: string })?.name;
	return { ok: false, erro: nome === "TimeoutError" || nome === "AbortError" ? "TIMEOUT" : "REDE" };
}

async function postar(ctx: Contexto, url: string, headers: Record<string, string>, corpo: unknown, timeoutMs: number) {
	return ctx.fetchFn(url, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(corpo),
		signal: AbortSignal.timeout(timeoutMs),
	});
}

async function falhaHttp(res: Response): Promise<ResultadoTransporte> {
	return { ok: false, status: res.status, headers: res.headers, corpo: await res.text().catch(() => "") };
}

async function chamarOpenAICompat(ctx: Contexto, p: PedidoTransporte): Promise<ResultadoTransporte> {
	const corpo: Record<string, unknown> = {
		model: ctx.modelo.id,
		messages: [
			{ role: "system", content: p.sistema },
			{ role: "user", content: p.usuario },
		],
		temperature: 0.1,
	};
	if (p.maxTokens) corpo.max_tokens = p.maxTokens;
	if (p.formato === "json" && ctx.modelo.jsonNativo) corpo.response_format = { type: "json_object" };
	const headers = { Authorization: `Bearer ${ctx.chave}`, ...(ctx.provedor.cabecalhosExtras ?? {}) };
	try {
		const res = await postar(ctx, `${ctx.baseUrl}/chat/completions`, headers, corpo, p.timeoutMs);
		if (!res.ok) return falhaHttp(res);
		const dados = await res.json();
		return { ok: true, texto: String(dados?.choices?.[0]?.message?.content ?? "") };
	} catch (e) {
		return erroDeRede(e);
	}
}

/** Gemma no AI Studio não aceita systemInstruction nem modo JSON nativo. */
function corpoGemini(ctx: Contexto, p: PedidoTransporte): Record<string, unknown> {
	const geracao: Record<string, unknown> = { temperature: 0.1 };
	if (p.maxTokens) geracao.maxOutputTokens = p.maxTokens;
	if (!ctx.modelo.jsonNativo) {
		return { contents: [{ role: "user", parts: [{ text: `${p.sistema}\n\n${p.usuario}` }] }], generationConfig: geracao };
	}
	if (p.formato === "json") geracao.responseMimeType = "application/json";
	return {
		systemInstruction: { parts: [{ text: p.sistema }] },
		contents: [{ role: "user", parts: [{ text: p.usuario }] }],
		generationConfig: geracao,
	};
}

async function chamarGemini(ctx: Contexto, p: PedidoTransporte): Promise<ResultadoTransporte> {
	const url = `${ctx.baseUrl}/models/${ctx.modelo.id}:generateContent`;
	try {
		const res = await postar(ctx, url, { "x-goog-api-key": ctx.chave }, corpoGemini(ctx, p), p.timeoutMs);
		if (!res.ok) return falhaHttp(res);
		const dados = await res.json();
		const partes: { text?: string }[] = dados?.candidates?.[0]?.content?.parts ?? [];
		return { ok: true, texto: partes.map((x) => x.text ?? "").join("") };
	} catch (e) {
		return erroDeRede(e);
	}
}

export function chamarModelo(ctx: Contexto, p: PedidoTransporte): Promise<ResultadoTransporte> {
	return ctx.provedor.transporte === "gemini" ? chamarGemini(ctx, p) : chamarOpenAICompat(ctx, p);
}
