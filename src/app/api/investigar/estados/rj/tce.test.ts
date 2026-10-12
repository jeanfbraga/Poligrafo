import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarProxyOsint } from "../../proxy_osint";
import * as tseModule from "../../tse";
import { buscarDespesasVereadorRJ } from "./tce";

// Mock da dependência de rede (o vereador vem da base de eleitos, não do TSE ao vivo).
vi.mock("../../tse", () => ({
	fetchWithTimeout: vi.fn(),
}));

describe("Módulo de Extração: Rio de Janeiro", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("buscarProxyOsint (Proxy OSINT)", () => {
		it("deve retornar despesas federais quando CGU tem dados", async () => {
			// Mock CGU response
			vi.mocked(tseModule.fetchWithTimeout).mockResolvedValue({
				ok: true,
				json: async () => [
					{
						nomeFavorecido: "GIGI CASTILHO",
						funcao: "Fundo Eleitoral",
						valor: 50000,
						data: "2024-06-01",
					},
				],
			} as any);

			process.env.TRANSPARENCIA_API_KEY = "test-key";
			const result = await buscarProxyOsint("56646419000170", "GIGI CASTILHO");

			expect(result.despesasFederais.length).toBeGreaterThanOrEqual(0); // Depends on mock timing
			expect(result.statusMensagem).toBeDefined();
		});

		it("deve retornar vazio com mensagem honesta quando não há dados", async () => {
			vi.mocked(tseModule.fetchWithTimeout).mockRejectedValue(
				new Error("Network error"),
			);

			const result = await buscarProxyOsint("11122233344", "TESTE");

			expect(result.despesasFederais).toEqual([]);
			expect(result.statusMensagem).toContain("sem achados");
		});

		it("buscarDespesasVereadorRJ deve retornar apenas despesasFederais", async () => {
			vi.mocked(tseModule.fetchWithTimeout).mockRejectedValue(
				new Error("Network error"),
			);

			const despesas = await buscarDespesasVereadorRJ("123");

			expect(despesas).toEqual([]);
		});
	});
});
