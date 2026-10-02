import { describe, expect, it } from "vitest";
import { MIN_SESSOES_RANKING, rankingMenosPresentes, sessaoContaParaAusencia, taxaDePresenca, textoDePresenca } from "@/lib/frequencia";

describe("sessaoContaParaAusencia", () => {
	it("sessão antes da entrada em exercício não gera ausência", () => {
		expect(sessaoContaParaAusencia("2026-06-30T14:00", "2026-07-09")).toBe(false);
		expect(sessaoContaParaAusencia("2026-07-09T14:00", "2026-07-09")).toBe(true);
		expect(sessaoContaParaAusencia("2026-08-01", "2026-07-09")).toBe(true);
	});

	it("sem data de entrada, conta (comportamento anterior)", () => {
		expect(sessaoContaParaAusencia("2026-06-30", "")).toBe(true);
	});
});

describe("taxa e ranking de menos presentes", () => {
	const linha = (id: number, presencas: number, ausencias: number) => ({ id_deputado: id, presencas, ausencias_nao_justificadas: ausencias });

	it("taxa é presenças sobre sessões elegíveis", () => {
		expect(taxaDePresenca(linha(1, 30, 10))).toBe(0.75);
		expect(taxaDePresenca(linha(2, 0, 0))).toBeNull();
	});

	it("ordena pela menor taxa, não pelo menor número de presenças", () => {
		// B tem menos presenças (10) mas taxa melhor (10/20 = 50%) que A (25/92 = 27%).
		const r = rankingMenosPresentes([linha(1, 25, 67), linha(2, 10, 10)]);
		expect(r.map((x) => x.id_deputado)).toEqual([1, 2]);
	});

	it("quem tem poucas sessões elegíveis (entrou há pouco) não entra no ranking", () => {
		const r = rankingMenosPresentes([linha(1, 2, 3), linha(2, 40, 52)]);
		expect(r.map((x) => x.id_deputado)).toEqual([2]);
		expect(MIN_SESSOES_RANKING).toBeGreaterThan(5);
	});

	it("respeita o limite e tolera lista nula", () => {
		const muitas = Array.from({ length: 15 }, (_, i) => linha(i + 1, i, 60));
		expect(rankingMenosPresentes(muitas, 10)).toHaveLength(10);
		expect(rankingMenosPresentes(null)).toEqual([]);
	});

	it("texto traz presenças, sessões e percentual", () => {
		expect(textoDePresenca(25, 92, 25 / 92)).toBe("25/92 sess. · 27%");
	});
});
