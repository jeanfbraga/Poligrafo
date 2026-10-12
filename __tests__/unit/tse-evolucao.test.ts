import { describe, expect, it } from "vitest";
import { CAMPANHAS_GERAIS, CAMPANHAS_MUNICIPAIS, calcularVariacoesPatrimonio } from "../../src/app/api/investigar/tse";

const item = (ano: number, patrimonioTotal: number) => ({ ano, idEleicao: String(ano), cargo: "Deputado Federal", patrimonioTotal, bensDeclarados: [] });

describe("TSE: eleições e evolução patrimonial", () => {
	it("deve incluir a eleição de 2026 como a primeira campanha geral", () => {
		expect(CAMPANHAS_GERAIS[0].ano).toBe("2026");
		expect(CAMPANHAS_GERAIS[0].idEleicao).toBe("20322002026");
	});

	it("deve incluir a eleição de 2024 como a primeira campanha municipal", () => {
		expect(CAMPANHAS_MUNICIPAIS[0].ano).toBe("2024");
		expect(CAMPANHAS_MUNICIPAIS[0].idEleicao).toBe("2045202024");
	});

	it("variação entre as duas declarações mais recentes (de 18 mil para 5,49 milhões)", () => {
		const r = calcularVariacoesPatrimonio([item(2026, 5487552.64), item(2022, 18327.66)]);
		expect(r.patrimonioAnterior).toBe(18327.66);
		expect(r.anoPatrimonioAnterior).toBe(2022);
		expect(r.variacaoPatrimonio).toBeCloseTo(5469224.98, 2);
		expect(r.variacaoPatrimonioPercentual).toBeGreaterThan(20000);
	});

	it("sem declaração anterior não há variação; anterior zerada vale 100%", () => {
		expect(calcularVariacoesPatrimonio([item(2026, 1000)])).toEqual({});
		expect(calcularVariacoesPatrimonio([item(2026, 1000), item(2022, 0)]).variacaoPatrimonioPercentual).toBe(100);
	});
});
