import { afterEach, describe, expect, it, vi } from "vitest";
import { chaveCachePesquisa, lerCachePesquisa, padraoMesmaRef, podeGravarCachePesquisas, podeLerCachePesquisas } from "@/lib/cache-pesquisas";

describe("chave e leitura do cache `pesquisas`", () => {
	it("a mesma chave na leitura e na gravação, com ou sem ref", () => {
		expect(chaveCachePesquisa("flávio bolsonaro", "FEDERAL:SENADO:5894")).toBe("flávio bolsonaro_FEDERAL:SENADO:5894");
		expect(chaveCachePesquisa("abilio brunini", null)).toBe("abilio brunini");
	});

	it("a busca pela mesma ref escapa os curingas do LIKE (antes `%` ou `_` na ref casavam outro político)", () => {
		expect(padraoMesmaRef("FEDERAL:SENADO:5894")).toBe("%\\_FEDERAL:SENADO:5894");
		expect(padraoMesmaRef("PREFEITO:SP:%")).toBe("%\\_PREFEITO:SP:\\%");
		expect(padraoMesmaRef("RJ:VEREADOR:rio_x")).toBe("%\\_RJ:VEREADOR:rio\\_x");
	});

	function cliente(respostas: ({ grafo_dados: unknown } | null)[]) {
		const filtros: [string, string][] = [];
		const consulta: Record<string, unknown> = {};
		for (const m of ["select", "gte", "order", "limit"]) consulta[m] = () => consulta;
		consulta.eq = (_c: string, v: string) => (filtros.push(["eq", v]), consulta);
		consulta.like = (_c: string, v: string) => (filtros.push(["like", v]), consulta);
		consulta.maybeSingle = async () => ({ data: respostas.shift() ?? null, error: null });
		return { filtros, c: { from: () => consulta } as never };
	}

	it("chave exata primeiro; sem ela, a mesma ref com outra grafia do nome", async () => {
		const exata = cliente([{ grafo_dados: { nodes: [1] } }]);
		expect(await lerCachePesquisa(exata.c, "k_REF", "REF", "2026-10-08")).toEqual({ grafo_dados: { nodes: [1] } });
		expect(exata.filtros).toEqual([["eq", "k_REF"]]);
		const outraGrafia = cliente([null, { grafo_dados: { nodes: [2] } }]);
		expect(await lerCachePesquisa(outraGrafia.c, "flavio bolsonaro_FEDERAL:SENADO:5894", "FEDERAL:SENADO:5894", "x")).toEqual({ grafo_dados: { nodes: [2] } });
		expect(outraGrafia.filtros).toEqual([["eq", "flavio bolsonaro_FEDERAL:SENADO:5894"], ["like", "%\\_FEDERAL:SENADO:5894"]]);
	});

	it("sem ref, só a chave exata", async () => {
		const c = cliente([null]);
		expect(await lerCachePesquisa(c.c, "nome", null, "x")).toBeNull();
		expect(c.filtros).toEqual([["eq", "nome"]]);
	});
});

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
