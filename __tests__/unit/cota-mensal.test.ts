import { describe, expect, it } from "vitest";
import { resumirCotaMensal } from "@/lib/cota-mensal";

const mes = (m: number, gasto: number, ano = 2026, teto = 46000) => ({ mes_referencia: m, ano_referencia: ano, valor_gasto: gasto, valor_teto: teto });

describe("resumirCotaMensal", () => {
	it("sem nenhum gasto não é 'dentro do teto'", () => {
		const r = resumirCotaMensal([mes(8, 0), mes(9, 0)]);
		expect(r.situacao).toBe("sem-gasto");
		expect(r.totalGasto).toBe(0);
		expect(r.mesesComGasto).toBe(0);
		expect(r.teto).toBe(46000);
	});

	it("com gasto e nenhum mês acima do teto: dentro", () => {
		const r = resumirCotaMensal([mes(1, 10000), mes(2, 45999)]);
		expect(r.situacao).toBe("dentro");
		expect(r.mesesComGasto).toBe(2);
	});

	it("algum mês acima do teto: acima (e conta os meses)", () => {
		const r = resumirCotaMensal([mes(1, 50000), mes(2, 1000), mes(3, 70000)]);
		expect(r.situacao).toBe("acima");
		expect(r.mesesAcima).toBe(2);
	});

	it("usa o ano mais recente e não mistura meses de anos diferentes", () => {
		const r = resumirCotaMensal([mes(1, 99999, 2025, 40000), mes(1, 500, 2026, 46000)]);
		expect(r.ano).toBe(2026);
		expect(r.teto).toBe(46000);
		expect(r.dados[0].gasto).toBe(500);
	});

	it("valores nulos viram zero", () => {
		const r = resumirCotaMensal([{ mes_referencia: 3, ano_referencia: 2026, valor_gasto: null, valor_teto: 46000 }]);
		expect(r.totalGasto).toBe(0);
	});
});
