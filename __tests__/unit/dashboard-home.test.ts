import { describe, expect, it } from "vitest";
import { calcularKpi, percentuaisRelativos, rankingDeUfs, rotaDoRanking } from "@/lib/dashboard-home";

describe("rotaDoRanking", () => {
	it("id numérico de deputado vai ao Perfil com nome, partido e UF", () => {
		const r = rotaDoRanking({ nome: "Fulano de Tal", id: 123, partido: "XYZ", uf: "RJ" });
		expect(r).toContain("/perfil/deputado/123?");
		expect(r).toContain("partido=XYZ");
	});

	it("cargo que não é de deputado não vai ao perfil de deputado", () => {
		expect(rotaDoRanking({ nome: "Zzz Inexistente", id: 5, cargo: "SENADOR" })).toContain("/dossie?");
	});

	it("sem id: usa o índice (Lula → perfil do presidente) ou cai no dossiê", () => {
		expect(rotaDoRanking({ nome: "Luiz Inácio Lula da Silva" })).toBe("/perfil/presidente/lula");
		const d = rotaDoRanking({ nome: "Nome Que Não Existe Mesmo", uf: "BR" });
		expect(d).toContain("/dossie?");
		expect(d).toContain("uf=FEDERAL");
	});
});

describe("percentuaisRelativos", () => {
	it("o maior vale 100 e há um mínimo visível", () => {
		expect(percentuaisRelativos([100, 50, 0.1])).toEqual([100, 50, 2]);
		expect(percentuaisRelativos([])).toEqual([]);
		expect(percentuaisRelativos([0, 0])).toEqual([2, 2]);
	});
});

describe("calcularKpi", () => {
	it("usa o ano mais recente e deriva média, concentração e soma Pix", () => {
		const k = calcularKpi({
			ceapTotal: [
				{ ano: "2024", total_gasto: "50" },
				{ ano: "2025", total_gasto: "600" },
				{ ano: "2025", total_gasto: "400" },
			],
			ceapTop10: [{ nome: "A", total_gasto: 100 }, { nome: "B", total_gasto: 300 }],
			emendasTop10: [{ autor: "A", total_pix: 7 }, { autor: "B", total_pix: 3 }],
		});
		expect(k).toEqual({ ano: 2025, total: 1000, mediaTop10: 200, somaPixTop10: 10, concentracaoTop10: 40 });
	});

	it("sem dados devolve zeros e o ano corrente", () => {
		const k = calcularKpi(null);
		expect(k.total).toBe(0);
		expect(k.concentracaoTop10).toBe(0);
		expect(k.ano).toBe(new Date().getFullYear());
	});
});

describe("rankingDeUfs", () => {
	it("ordena pelo total, não pela ordem das chaves", () => {
		const r = rankingDeUfs({ AC: { total: 1, deputados: [] }, SP: { total: 9, deputados: [] }, MG: { total: 5, deputados: [] } });
		expect(r.map((x) => x.uf)).toEqual(["SP", "MG", "AC"]);
		expect(rankingDeUfs(undefined)).toEqual([]);
	});
});
