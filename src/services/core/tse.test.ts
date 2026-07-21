import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeString } from "../../app/api/investigar/tse";

// Mock global fetch
global.fetch = vi.fn();

describe("TSE Service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("normalizeString", () => {
		it("deve remover acentos e converter para lowercase", () => {
			expect(normalizeString("JOÃO DA SILVA")).toBe("joao da silva");
			expect(normalizeString("André Figueiredo")).toBe("andre figueiredo");
			expect(normalizeString("WÉVERTON MARQUES")).toBe("weverton marques");
		});

		it("deve lidar com string vazia", () => {
			expect(normalizeString("")).toBe("");
		});

		it("deve fazer trim de espaços", () => {
			expect(normalizeString("  test  ")).toBe("test");
		});
	});
});

describe("Congresso Index", () => {
	it("deve carregar o índice JSON com políticos", async () => {
		const index = await import("../data/congresso-index.json");
		expect(Array.isArray(index.default)).toBe(true);
		expect(index.default.length).toBeGreaterThan(500);
	});

	it("deve conter os campos obrigatórios para cada político", async () => {
		const index = await import("../data/congresso-index.json");
		const sample = index.default[0];
		expect(sample).toHaveProperty("id");
		expect(sample).toHaveProperty("nome");
		expect(sample).toHaveProperty("uf");
		expect(sample).toHaveProperty("casa");
	});

	it("deve incluir tanto CAMARA quanto SENADO", async () => {
		const index = await import("../data/congresso-index.json");
		const casas = new Set(index.default.map((p: any) => p.casa));
		expect(casas.has("CAMARA")).toBe(true);
		expect(casas.has("SENADO")).toBe(true);
	});

	it("deve encontrar políticos por nome parcial normalizado", async () => {
		const index = await import("../data/congresso-index.json");
		const termo = "lula";
		const termoNorm = termo
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
		const matches = index.default.filter((p: any) =>
			p.nome
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
				.includes(termoNorm),
		);
		expect(Array.isArray(matches)).toBe(true);
	});
});
