import { afterEach, describe, expect, it, vi } from "vitest";
import { podeGravarCachePesquisas, podeLerCachePesquisas } from "@/lib/cache-pesquisas";

describe("política do cache `pesquisas`", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("em produção lê e grava", () => {
		vi.stubEnv("NODE_ENV", "production");
		expect(podeLerCachePesquisas()).toBe(true);
		expect(podeGravarCachePesquisas()).toBe(true);
	});

	it("em desenvolvimento lê do banco, mas nunca grava (banco compartilhado com produção)", () => {
		vi.stubEnv("NODE_ENV", "development");
		expect(podeLerCachePesquisas()).toBe(true);
		expect(podeGravarCachePesquisas()).toBe(false);
	});
});
