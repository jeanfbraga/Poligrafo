import { describe, expect, it } from "vitest";
import { GEMINI_MODELS, GROQ_MODELS, VISION_MODELS } from "@/services/ai/ai-models-config";

/** Modelos que a verificação de 02/10/2026 mostrou como inexistentes/descontinuados/inadequados. */
const GROQ_MORTOS = ["groq/compound", "groq/compound-mini", "qwen/qwen3.6-27b", "openai/gpt-oss-safeguard-20b", "allam-2-7b"];
const GEMINI_MORTOS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemma-3-27b-it"];

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

	it("os modelos 'lite' (rápidos) vêm antes dos 'flash' com raciocínio (lentos)", () => {
		const lista = GEMINI_MODELS as readonly string[];
		const primeiroLento = lista.findIndex((m) => m === "gemini-2.5-flash" || m === "gemini-3.5-flash");
		expect(lista.indexOf("gemini-2.5-flash-lite")).toBeLessThan(primeiroLento);
		expect(lista.indexOf("gemini-3.5-flash-lite")).toBeLessThan(primeiroLento);
	});

	it("sem duplicatas nas listas", () => {
		expect(new Set(GROQ_MODELS).size).toBe(GROQ_MODELS.length);
		expect(new Set(GEMINI_MODELS).size).toBe(GEMINI_MODELS.length);
	});
});
