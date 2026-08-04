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

// Monta uma resposta fetch fake com body em streaming (getReader),
// imitando o XML único do repositório de dados abertos da ALESP.
function mockXmlStream(xml: string) {
	const encoder = new TextEncoder();
	const chunks = [encoder.encode(xml)];
	return {
		ok: true,
		status: 200,
		body: {
			getReader: () => ({
				read: vi
					.fn()
					.mockImplementation(() =>
						Promise.resolve(
							chunks.length
								? { value: chunks.shift(), done: false }
								: { value: undefined, done: true },
						),
					),
				cancel: vi.fn().mockResolvedValue(undefined),
				releaseLock: vi.fn(),
			}),
		},
	};
}

function blocoDespesa(
	ano: number,
	deputado: string,
	fornecedor: string,
	valor: string,
	cnpj = "12.345.678/0001-99",
	tipo = "Locação de Veículos",
	mes = 2,
) {
	return `<despesa><Ano>${ano}</Ano><Matricula>123</Matricula><Mes>${mes}</Mes><Valor>${valor}</Valor><CNPJ>${cnpj}</CNPJ><Deputado>${deputado}</Deputado><Tipo>${tipo}</Tipo><Fornecedor>${fornecedor}</Fornecedor></despesa>`;
}

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
			expect(resultados[0].ref).toBe(
				"ALESP:DEPUTADO_ESTADUAL:EDUARDO:99988877766",
			);
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
		it("deve extrair do XML streaming só as despesas do deputado, em anos recentes, ordenadas por valor", async () => {
			const anoAtual = new Date().getFullYear();
			const xml = `<?xml version="1.0" encoding="UTF-8"?><despesas>${
				blocoDespesa(
					anoAtual,
					"POLITICO TESTE",
					"LOCADORA VEICULOS SP",
					"8500.50",
				) +
				blocoDespesa(
					anoAtual - 1,
					"POLITICO TESTE DE SOUZA", // variação com nome do meio extra
					"GRAFICA PAULISTA",
					"15000.00",
					"98.765.432/0001-11",
					"Material Impresso",
				) +
				blocoDespesa(
					anoAtual,
					"OUTRO DEPUTADO", // não pode aparecer
					"FORNECEDOR ERRO",
					"99999.00",
				) +
				blocoDespesa(
					anoAtual - 5, // ano antigo demais — não pode aparecer
					"POLITICO TESTE",
					"FORNECEDOR ANTIGO",
					"7777.00",
				)
			}</despesas>`;

			(global.fetch as any).mockResolvedValue(mockXmlStream(xml));

			const despesas = await buscarDespesasDeputadoEstadualSP(
				"12345",
				"Politico Teste",
			);

			expect(despesas).toHaveLength(2);
			// Ordenado por valor desc: a gráfica (15000) vem primeiro
			expect(despesas[0].nomeFornecedor).toBe("GRAFICA PAULISTA");
			expect(despesas[0].cnpjCpfFornecedor).toBe("98765432000111");
			expect(despesas[0].tipoDespesa).toBe("Material Impresso");
			expect(despesas[0].valorDocumento).toBe(15000);
			expect(despesas[0].dataDocumento).toBe(`${anoAtual - 1}-02-01`);

			expect(despesas[1].nomeFornecedor).toBe("LOCADORA VEICULOS SP");
			expect(despesas[1].cnpjCpfFornecedor).toBe("12345678000199");
			expect(despesas[1].valorDocumento).toBe(8500.5);
			expect(despesas[1].dataDocumento).toBe(`${anoAtual}-02-01`);
		});

		it("deve avisar via sendEvent quando não encontra despesas do deputado", async () => {
			const anoAtual = new Date().getFullYear();
			const xml = `<despesas>${blocoDespesa(anoAtual, "OUTRO DEPUTADO", "X", "1.00")}</despesas>`;
			(global.fetch as any).mockResolvedValue(mockXmlStream(xml));
			const sendEvent = vi.fn();

			const despesas = await buscarDespesasDeputadoEstadualSP(
				"123",
				"Nome Inexistente",
				sendEvent,
			);

			expect(despesas).toEqual([]);
			expect(sendEvent).toHaveBeenCalledWith(
				"API_WARNING",
				expect.objectContaining({
					fonte: "Assembleia Legislativa de SP (ALESP)",
				}),
			);
		});

		it("deve retornar array vazio se a resposta for HTTP Error (não ok)", async () => {
			(global.fetch as any).mockResolvedValueOnce({
				ok: false,
				status: 404,
			});
			const despesas = await buscarDespesasDeputadoEstadualSP("123", "Nome");
			expect(despesas).toEqual([]);
		});

		it("deve retornar array vazio se ocorrer erro de rede", async () => {
			(global.fetch as any).mockRejectedValueOnce(
				new Error("Network error Timeout"),
			);
			const despesas = await buscarDespesasDeputadoEstadualSP("123", "Nome");
			expect(despesas).toEqual([]);
		});
	});
});
