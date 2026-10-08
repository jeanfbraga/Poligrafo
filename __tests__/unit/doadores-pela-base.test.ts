import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.doUnmock("@/services/integrations/tse/campanha");
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("doadores da campanha (a tabela antiga por nome foi aposentada)", () => {
	it("com o número do candidato: vêm das contas de campanha no Banco de Perfil, sem chamar o TSE ao vivo", async () => {
		const buscarContasCampanha = vi.fn(async () => ({
			doadores: [
				{ documento: "529.982.247-25" }, { documento: "52998224725" }, { documento: "" }, { documento: "11222333000181" },
			],
			fornecedores: [{ documento: "99888777000155" }],
		}));
		vi.doMock("@/services/integrations/tse/campanha", () => ({ buscarContasCampanha }));
		const fetchFn = vi.fn();
		vi.stubGlobal("fetch", fetchFn);
		const { buscarDoadoresTSE } = await import("../../src/app/api/investigar/tse");
		expect(await buscarDoadoresTSE("FULANO", "MG", "6", "2040602022", "130001234567")).toEqual(["52998224725", "11222333000181"]);
		expect(buscarContasCampanha).toHaveBeenCalledWith("130001234567");
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it("sem número do candidato: não consulta a base e segue para o TSE ao vivo (sem cache por nome)", async () => {
		const buscarContasCampanha = vi.fn();
		vi.doMock("@/services/integrations/tse/campanha", () => ({ buscarContasCampanha }));
		const fetchFn = vi.fn(async () => new Response("bloqueado", { status: 403 }));
		vi.stubGlobal("fetch", fetchFn);
		const { buscarDoadoresTSE } = await import("../../src/app/api/investigar/tse");
		expect(await buscarDoadoresTSE("FULANO", "MG")).toEqual([]);
		expect(buscarContasCampanha).not.toHaveBeenCalled();
		expect(String(fetchFn.mock.calls[0]?.[0])).toContain("divulgacandcontas.tse.jus.br");
	});
});
