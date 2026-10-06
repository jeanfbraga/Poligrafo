import { describe, expect, it } from "vitest";
import { validarAvaliacaoLicitacoes } from "../../src/app/api/investigar/licitacoes/ai_licitacoes";

describe("contrato da IA de licitações", () => {
	const validar = validarAvaliacaoLicitacoes(["A", "B", "C", "D"]);

	it("exige a lista e pelo menos metade dos contratos enviados", () => {
		expect(validar({}).success).toBe(false);
		expect(validar({ contratos_avaliados: [] }).success).toBe(false);
		expect(validar({ contratos_avaliados: [{ numeroControlePNCP: "A" }] }).success).toBe(false);
		expect(validar({ contratos_avaliados: [{ numeroControlePNCP: "A" }, { numeroControlePNCP: "B" }] }).success).toBe(true);
	});

	it("ignora contratos que não foram enviados (a IA não pode inventar)", () => {
		expect(validar({ contratos_avaliados: [{ numeroControlePNCP: "X" }, { numeroControlePNCP: "Y" }] }).success).toBe(false);
	});
});
