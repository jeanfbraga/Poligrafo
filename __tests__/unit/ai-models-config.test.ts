import { describe, expect, it } from "vitest";
import { GEMINI_MODELS, GROQ_MODELS, OPENROUTER_MODELS, VISION_MODELS } from "@/services/ai/ai-models-config";
import { MODELOS, ORDEM_PROVEDORES, PROVEDORES } from "@/services/ai/gateway/registro";

/** Modelos que a verificação de 02/10/2026 mostrou como inexistentes/descontinuados/inadequados. */
const GROQ_MORTOS = ["groq/compound", "groq/compound-mini", "qwen/qwen3.6-27b", "openai/gpt-oss-safeguard-20b", "allam-2-7b"];
const GEMINI_MORTOS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemma-3-27b-it"];
/** Sumiram do catálogo do OpenRouter na verificação de 06/10/2026 (`npm run ia:verificar-modelos`). */
const OPENROUTER_MORTOS = [
	"meta-llama/llama-3.3-70b-instruct:free",
	"google/gemini-2.0-flash-exp:free",
	"deepseek/deepseek-r1:free",
	"openai/gpt-oss-20b:free",
	"qwen/qwen-2.5-coder-32b-instruct:free",
	"meta-llama/llama-3.1-8b-instruct:free",
	"qwen/qwen2.5-vl-72b-instruct:free",
];

describe("ai-models-config — lista de modelos", () => {
	it("não contém modelos Groq inexistentes ou inadequados", () => {
		for (const m of GROQ_MORTOS) expect(GROQ_MODELS as readonly string[]).not.toContain(m);
		expect(GROQ_MODELS.length).toBeGreaterThan(0);
	});

	it("não contém modelos Gemini descontinuados (nem na visão)", () => {
		for (const m of GEMINI_MORTOS) {
			expect(GEMINI_MODELS as readonly string[]).not.toContain(m);
			expect(VISION_MODELS.gemini as readonly string[]).not.toContain(m);
		}
	});

	it("não contém modelos do OpenRouter que sumiram (nem na visão)", () => {
		for (const m of OPENROUTER_MORTOS) {
			expect(OPENROUTER_MODELS as readonly string[]).not.toContain(m);
			expect(VISION_MODELS.openrouter as readonly string[]).not.toContain(m);
		}
	});

	it("visão do Groq descontinuada não volta", () => {
		expect(VISION_MODELS.groq).not.toBe("llama-3.2-11b-vision-preview");
	});

	it("os modelos 'lite' (rápidos) vêm antes dos 'flash' com raciocínio (lentos)", () => {
		const lista = GEMINI_MODELS as readonly string[];
		const primeiroLento = lista.findIndex((m) => m === "gemini-2.5-flash" || m === "gemini-3.5-flash");
		expect(lista.indexOf("gemini-2.5-flash-lite")).toBeLessThan(primeiroLento);
		expect(lista.indexOf("gemini-3.5-flash-lite")).toBeLessThan(primeiroLento);
	});

	it("sem duplicatas nas listas", () => {
		for (const lista of [GROQ_MODELS, GEMINI_MODELS, OPENROUTER_MODELS]) {
			expect(new Set(lista).size).toBe(lista.length);
		}
	});
});

describe("registro do gateway", () => {
	it("todo modelo aponta para um provedor conhecido e sem repetição", () => {
		const chaves = MODELOS.map((m) => `${m.provedor}:${m.id}`);
		expect(new Set(chaves).size).toBe(chaves.length);
		for (const m of MODELOS) expect(PROVEDORES[m.provedor]).toBeDefined();
	});

	it("a ordem do rodízio cobre todos os provedores", () => {
		expect(new Set(ORDEM_PROVEDORES)).toEqual(new Set(Object.keys(PROVEDORES)));
	});

	it("Gemma não usa modo JSON nativo nem systemInstruction", () => {
		for (const m of MODELOS.filter((x) => x.id.startsWith("gemma"))) expect(m.jsonNativo).toBe(false);
	});
});
