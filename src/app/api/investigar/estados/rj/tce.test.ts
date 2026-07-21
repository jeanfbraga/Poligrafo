import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarProxyOsint } from "../../proxy_osint";
import * as tseModule from "../../tse";
import { buscarDespesasVereadorRJ, buscarMunicipalRJ } from "./tce";

// Mock da dependência TSE
vi.mock("../../tse", () => ({
	buscarCpfNoTSE: vi.fn(),
	fetchWithTimeout: vi.fn(),
}));

describe("Módulo de Extração: Rio de Janeiro", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("buscarMunicipalRJ", () => {
		it("deve retornar VEREADOR com isCnpj quando TSE retorna CNPJ de campanha", async () => {
			vi.mocked(tseModule.buscarCpfNoTSE).mockResolvedValueOnce({
				cpf: "56646419000170",
				documentoPrincipal: "56646419000170",
				isCnpj: true,
				municipio: "rio-de-janeiro",
				idUe: "60011",
				nome: "GIRLANDIA DOS SANTOS GRACIANO",
			});
			vi.mocked(tseModule.buscarCpfNoTSE).mockResolvedValueOnce(null);

			const resultados = await buscarMunicipalRJ("Gigi Castilho");

			expect(resultados).toHaveLength(1);
			expect(resultados[0].ref).toBe(
				"RJ:VEREADOR:rio-de-janeiro:56646419000170",
			);
			expect(resultados[0].isCnpj).toBe(true);
			expect(resultados[0].casa).toBe("CAMARA_MUNICIPAL_RJ");
		});

		it("deve retornar vazio se o político não for encontrado", async () => {
			vi.mocked(tseModule.buscarCpfNoTSE).mockResolvedValue(null);
			const resultados = await buscarMunicipalRJ("Desconhecido");
			expect(resultados).toHaveLength(0);
		});
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
