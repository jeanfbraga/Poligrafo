import { describe, expect, it } from "vitest";
import { agruparDespesasPorAnoMes, cpfParcial, percentualSigiloso, rotuloMes } from "@/lib/cpgf";

describe("cpgf", () => {
	it("agrupa por ano e mês e ignora datas inválidas", () => {
		const g = agruparDespesasPorAnoMes([
			{ data: "10/12/2022", valor: 1 },
			{ data: "15/12/2022", valor: 2 },
			{ data: "01/11/2022", valor: 3 },
			{ data: "20/10/2021", valor: 4 },
			{ data: "sem-data", valor: 5 },
			{ valor: 6 },
		]);
		expect(Object.keys(g).sort()).toEqual(["2021", "2022"]);
		expect(g["2022"]["12"]).toHaveLength(2);
		expect(g["2022"]["11"]).toHaveLength(1);
		expect(agruparDespesasPorAnoMes(undefined)).toEqual({});
	});

	it("rotuloMes e percentualSigiloso", () => {
		expect(rotuloMes("03")).toBe("Mar");
		expect(rotuloMes("13")).toBe("13");
		expect(percentualSigiloso(339, 1000)).toBe(33.9);
		expect(percentualSigiloso(1, 0)).toBe(0);
	});

	it("cpfParcial mascara os dois últimos dígitos", () => {
		expect(cpfParcial("12345678901")).toBe("123.456.789-**");
		expect(cpfParcial()).toBe("RESTRITO");
	});
});
