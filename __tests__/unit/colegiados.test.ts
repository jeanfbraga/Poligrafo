import { describe, expect, it } from "vitest";
import { comissoesFormatadas, contagemPorTema, filtrarComissoes, filtrarFrentes, frentesFormatadas } from "@/lib/colegiados";

const FRENTES = [
	"Frente Parlamentar Mista da Agropecuária - FPA",
	"Frente Parlamentar em Defesa da Saúde Mental",
	"Frente Parlamentar Mista em Defesa dos Pequenos Produtores Rurais",
	"",
	null,
];

describe("frentes e comissões formatadas", () => {
	it("ignora vazios e ordena por nome", () => {
		const f = frentesFormatadas(FRENTES);
		expect(f).toHaveLength(3);
		expect([...f].map((x) => x.label)).toEqual([...f].map((x) => x.label).sort((a, b) => a.localeCompare(b)));
	});

	it("tolera lista nula", () => {
		expect(frentesFormatadas(null)).toEqual([]);
		expect(comissoesFormatadas(undefined)).toEqual([]);
	});
});

describe("filtrarFrentes", () => {
	const f = frentesFormatadas(FRENTES);

	it("sem tema e sem busca devolve tudo", () => {
		expect(filtrarFrentes(f, "todos", "")).toHaveLength(3);
	});

	it("busca por trecho do nome, sem diferenciar caixa", () => {
		const r = filtrarFrentes(f, "todos", "SAÚDE");
		expect(r).toHaveLength(1);
		expect(r[0].label).toMatch(/Saúde Mental/);
	});

	it("filtra por tema e combina com a busca", () => {
		const temas = contagemPorTema(f);
		const primeiro = temas[0].tema;
		expect(filtrarFrentes(f, primeiro, "").every((x) => x.tema === primeiro)).toBe(true);
		expect(filtrarFrentes(f, primeiro, "zzzz-nada")).toHaveLength(0);
	});
});

describe("contagemPorTema", () => {
	it("só temas com frentes, do maior para o menor; a soma fecha com o total", () => {
		const f = frentesFormatadas(FRENTES);
		const c = contagemPorTema(f);
		expect(c.reduce((s, x) => s + x.quantidade, 0)).toBe(f.length);
		expect(c.every((x) => x.quantidade > 0)).toBe(true);
		for (let i = 1; i < c.length; i++) expect(c[i - 1].quantidade).toBeGreaterThanOrEqual(c[i].quantidade);
	});
});

describe("filtrarComissoes", () => {
	const c = comissoesFormatadas(["Constituição e Justiça e de Cidadania", "Educação", "Comissão de Saúde"]);

	it("busca por nome", () => {
		expect(filtrarComissoes(c, "justiça")).toHaveLength(1);
		expect(filtrarComissoes(c, "")).toHaveLength(3);
		expect(filtrarComissoes(c, "xyz")).toHaveLength(0);
	});
});
