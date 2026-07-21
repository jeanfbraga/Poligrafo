import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";

import * as tseModule from "../../tse";
import {
	buscarDeputadoEstadualSP,
	buscarDespesasDeputadoEstadualSP,
} from "./alesp";

vi.mock("../../tse", () => ({
	buscarCpfNoTSE: vi.fn(),
}));

global.fetch = vi.fn();

describe("Módulo de Extração: ALESP", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("buscarDeputadoEstadualSP", () => {
		it("deve retornar DEPUTADO_ESTADUAL e formatar a ref corretamente se encontrado no TSE", async () => {
			vi.mocked(tseModule.buscarCpfNoTSE).mockResolvedValueOnce({
				cpf: "99988877766",
				nome: "EDUARDO",
				documentoPrincipal: "99988877766",
				isCnpj: false,
				idUe: "71072",
				municipio: "sao-paulo",
			});

			const resultados = await buscarDeputadoEstadualSP("Eduardo");

			expect(resultados).toHaveLength(1);
			expect(resultados[0].ref).toBe("ALESP:DEPUTADO_ESTADUAL:99988877766");
			expect(resultados[0].casa).toBe("ALESP");
			expect(tseModule.buscarCpfNoTSE).toHaveBeenCalledWith(
				"eduardo",
				"SP",
				"7",
			);
		});

		it("deve retornar vazio se o político não for encontrado no TSE", async () => {
			vi.mocked(tseModule.buscarCpfNoTSE).mockResolvedValue(null);

			const resultados = await buscarDeputadoEstadualSP("Desconhecido Silva");

			expect(resultados).toHaveLength(0);
		});
	});

	describe("buscarDespesasDeputadoEstadualSP", () => {
		it("deve extrair e formatar despesas corretamente a partir da API Aberta ALESP", async () => {
			const mockJson = [
				{
					Ano: "2024",
					Mes: "2",
					Deputado: "Politico Teste",
					CNPJ: "12.345.678/0001-99",
					Fornecedor: "LOCADORA VEICULOS SP",
					Tipo: "Locação de Veículos",
					Valor: "8500.50",
				},
				{
					Ano: "2024",
					Mes: "2",
					Deputado: "Politico Teste",
					CNPJ: "98.765.432/0001-11",
					Fornecedor: "GRAFICA PAULISTA",
					Tipo: "Material Impresso",
					Valor: "15000.00",
				},
				{
					Ano: "2024",
					Mes: "2",
					Deputado: "Outro Deputado",
					CNPJ: "00.000.000/0000-00",
					Fornecedor: "FORNECEDOR ERRO",
					Tipo: "NAO DEVE APARECER",
					Valor: "15000.00",
				},
			];

			(global.fetch as any).mockResolvedValue({
				ok: true,
				json: async () => mockJson,
			});

			// Simulando um ID de deputado
			const identificador = "12345";
			const despesas = await buscarDespesasDeputadoEstadualSP(
				identificador,
				"Politico Teste",
			);

			expect(despesas.length).toBe(6);

			const primeiraDespesa = despesas[0];
			expect(primeiraDespesa.cnpjCpfFornecedor).toBe("12345678000199");
			expect(primeiraDespesa.nomeFornecedor).toBe("LOCADORA VEICULOS SP");
			expect(primeiraDespesa.tipoDespesa).toBe("Locação de Veículos");
			expect(primeiraDespesa.valorDocumento).toBe(8500.5);

			const anoAtual = new Date().getFullYear();
			expect(primeiraDespesa.dataDocumento).toBe(`${anoAtual}-02-01`);
		});

		it("deve retornar array vazio se a resposta for HTTP Error (não ok)", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 404,
			});
			const despesas = await buscarDespesasDeputadoEstadualSP("123", "Nome");
			expect(despesas).toEqual([]);
		});

		it("deve retornar array vazio se ocorrer erro de rede ou cheerio estourar", async () => {
			(global.fetch as any).mockRejectedValueOnce(
				new Error("Network error Timeout"),
			);
			const despesas = await buscarDespesasDeputadoEstadualSP("123", "Nome");
			expect(despesas).toEqual([]);
		});
	});
});
