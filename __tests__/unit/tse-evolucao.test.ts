import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	buscarCpfNoTSE,
	CAMPANHAS_GERAIS,
	CAMPANHAS_MUNICIPAIS,
} from "../../src/app/api/investigar/tse";

describe("TSE Integração e Evolução Patrimonial", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("deve incluir a eleição de 2026 como a primeira campanha geral", () => {
		expect(CAMPANHAS_GERAIS[0].ano).toBe("2026");
		expect(CAMPANHAS_GERAIS[0].idEleicao).toBe("20322002026");
	});

	it("deve incluir a eleição de 2024 como a primeira campanha municipal", () => {
		expect(CAMPANHAS_MUNICIPAIS[0].ano).toBe("2024");
		expect(CAMPANHAS_MUNICIPAIS[0].idEleicao).toBe("2045202024");
	});

	it("deve calcular corretamente a variação patrimonial entre eleições", async () => {
		const fetchMock = vi.fn();
		global.fetch = fetchMock;

		// Mock da listagem 2026
		fetchMock.mockImplementation((url: string) => {
			if (url.includes("2026") && url.includes("/candidatos")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							candidatos: [
								{
									id: 190002540158,
									nomeUrna: "OTONI DE PAULA",
									nomeCompleto: "OTONI MOURA DE PAULO JUNIOR",
									cargo: { nome: "Deputado Federal" },
									partido: { sigla: "PSD" },
								},
							],
						}),
				});
			}

			if (url.includes("2026") && url.includes("/candidato/190002540158")) {
				return Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(
							JSON.stringify({
								cpf: "07217877709",
								nomeCompleto: "OTONI MOURA DE PAULO JUNIOR",
								totalDeBens: 5487552.64,
								bens: [
									{ descricao: "Apartamento", valor: 4444000 },
									{ descricao: "Veículo", valor: 530000 },
								],
								cargo: { nome: "Deputado Federal" },
								partido: { sigla: "PSD" },
							}),
						),
				});
			}

			// Mock de 2022
			if (url.includes("2022") && url.includes("/candidatos")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							candidatos: [
								{
									id: 190001644973,
									nomeUrna: "OTONI DE PAULA",
									nomeCompleto: "OTONI MOURA DE PAULO JUNIOR",
									cargo: { nome: "Deputado Federal" },
									partido: { sigla: "MDB" },
								},
							],
						}),
				});
			}

			if (url.includes("2022") && url.includes("/candidato/190001644973")) {
				return Promise.resolve({
					ok: true,
					json: () =>
						Promise.resolve({
							cpf: "07217877709",
							nomeCompleto: "OTONI MOURA DE PAULO JUNIOR",
							totalDeBens: 18327.66,
							bens: [{ descricao: "Quotas", valor: 18327.66 }],
							cargo: { nome: "Deputado Federal" },
							partido: { sigla: "MDB" },
						}),
				});
			}

			// Demais anos não encontrados
			return Promise.resolve({
				ok: false,
				status: 404,
			});
		});

		const resultado = await buscarCpfNoTSE("Otoni de Paula", "RJ", "6");

		expect(resultado).not.toBeNull();
		expect(resultado?.cpf).toBe("07217877709");
		expect(resultado?.anoEleicao).toBe(2026);
		expect(resultado?.patrimonioTotal).toBe(5487552.64);
		expect(resultado?.patrimonioAnterior).toBe(18327.66);
		expect(resultado?.anoPatrimonioAnterior).toBe(2022);
		expect(resultado?.variacaoPatrimonio).toBeCloseTo(5469224.98, 2);
		expect(resultado?.variacaoPatrimonioPercentual).toBeGreaterThan(20000);
		expect(resultado?.historicoPatrimonio?.length).toBeGreaterThanOrEqual(2);
	});
});
