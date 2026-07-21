import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarEmpresasDoSocio } from "./socio-search";

// Mock global fetch for ALL calls (including fallback's DuckDuckGo + BrasilAPI)
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("buscarEmpresasDoSocio", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deve retornar array vazio se o nome do sócio for vazio", async () => {
		// A implementação atual normaliza e faz a busca — com nome vazio, retorna []
		mockFetch.mockResolvedValue({ ok: false, status: 403 });
		const result = await buscarEmpresasDoSocio("");
		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(0);
	});

	it("deve retornar a lista de empresas quando a Casa dos Dados responde com sucesso", async () => {
		const mockCasaDosResponse = {
			data: {
				cnpj: [
					{
						cnpj: "12345678000199",
						razao_social: "EMPRESA TESTE 1",
						situacao_cadastral: "Ativa",
						cnae_descricao: "Consultoria",
					},
					{
						cnpj: "98765432000188",
						razao_social: "EMPRESA TESTE 2",
						situacao_cadastral: "Ativa",
						cnae_descricao: "Tecnologia",
					},
				],
			},
		};

		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => mockCasaDosResponse,
		});

		const result = await buscarEmpresasDoSocio("JOAO DA SILVA");

		expect(result).toHaveLength(2);
		expect(result[0].cnpj).toBe("12345678000199");
		expect(result[0].razao_social).toBe("EMPRESA TESTE 1");
		expect(result[1].cnpj).toBe("98765432000188");
	});

	it("deve retornar array vazio quando a API falha e fallback DuckDuckGo também não retorna CNPJs", async () => {
		// 1st call: Casa dos Dados throws
		mockFetch.mockRejectedValueOnce(new Error("Network Error"));
		// 2nd call: DuckDuckGo fallback also fails
		mockFetch.mockRejectedValueOnce(new Error("Fallback Error"));

		const result = await buscarEmpresasDoSocio("MARIA SOUZA");

		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(0);
	});

	it("deve retornar array vazio quando a API responde com erro HTTP e fallback também falha", async () => {
		// 1st call: Casa dos Dados returns 403
		mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
		// 2nd call: DuckDuckGo fallback returns no CNPJs
		mockFetch.mockResolvedValueOnce({
			ok: true,
			text: async () => "<html>No results</html>",
		});

		const result = await buscarEmpresasDoSocio("TESTE NOME");

		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(0);
	});

	it("deve retornar empresas do fallback DuckDuckGo quando Casa dos Dados bloqueia e DuckDuckGo encontra CNPJs válidos", async () => {
		// 1st call: Casa dos Dados returns 403
		mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
		// 2nd call: DuckDuckGo returns HTML with a CNPJ
		mockFetch.mockResolvedValueOnce({
			ok: true,
			text: async () =>
				"<div>Resultado para 12.345.678/0001-99 empresa xyz</div>",
		});
		// 3rd call: BrasilAPI validates the CNPJ — sócio matches
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				cnpj: "12345678000199",
				razao_social: "XYZ PARTICIPACOES LTDA",
				descricao_situacao_cadastral: "Ativa",
				cnae_fiscal_descricao: "Holdings",
				qsa: [{ nome_socio: "TESTE NOME" }],
			}),
		});

		const result = await buscarEmpresasDoSocio("TESTE NOME");

		expect(result).toHaveLength(1);
		expect(result[0].cnpj).toBe("12345678000199");
		expect(result[0].razao_social).toBe("XYZ PARTICIPACOES LTDA");
	});
});
