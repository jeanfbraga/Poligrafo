import { describe, expect, it } from "vitest";
import { agruparServidores, lerPeriodo, statusDoPeriodo } from "@/lib/gabinete";

const HOJE = new Date(2026, 9, 2); // 02/10/2026

describe("lerPeriodo", () => {
	it("lê 'De … a …', 'Desde …' e o formato legado 'até'", () => {
		const a = lerPeriodo("De 19/02/2025 a 17/02/2026");
		expect(a.inicio?.getFullYear()).toBe(2025);
		expect(a.fim?.getFullYear()).toBe(2026);
		const b = lerPeriodo("Desde 31/03/2026");
		expect(b.fim).toBeNull();
		expect(b.valido).toBe(true);
		expect(lerPeriodo("01/01/2024 até 02/02/2025").fim?.getMonth()).toBe(1);
	});

	it("texto sem datas é inválido", () => {
		expect(lerPeriodo("").valido).toBe(false);
		expect(lerPeriodo(undefined).valido).toBe(false);
		expect(lerPeriodo("sem data").valido).toBe(false);
	});
});

describe("statusDoPeriodo", () => {
	it("período encerrado é EXONERADO (antes todos saíam ATIVO)", () => {
		expect(statusDoPeriodo("De 19/02/2025 a 17/02/2026", HOJE)).toBe("EXONERADO");
		expect(statusDoPeriodo("De 31/03/2026 a 13/08/2026", HOJE)).toBe("EXONERADO");
	});

	it("em aberto ou com fim futuro é ATIVO; fim hoje ainda é ATIVO", () => {
		expect(statusDoPeriodo("Desde 31/03/2026", HOJE)).toBe("ATIVO");
		expect(statusDoPeriodo("De 01/01/2026 a 31/12/2026", HOJE)).toBe("ATIVO");
		expect(statusDoPeriodo("De 01/01/2026 a 02/10/2026", HOJE)).toBe("ATIVO");
	});

	it("sem período legível mantém ATIVO", () => {
		expect(statusDoPeriodo(undefined, HOJE)).toBe("ATIVO");
	});
});

describe("agruparServidores", () => {
	const linhas = [
		{ nome: "ALINE MARIA PEREIRA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 19/02/2025 a 17/02/2026" },
		{ nome: "ALINE MARIA PEREIRA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 31/03/2026" },
		{ nome: "ALINE MARIA PEREIRA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 18/02/2026 a 30/03/2026" },
		{ nome: "FLAELSON LÉDA DOS REIS", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "De 31/03/2026 a 13/08/2026" },
		{ nome: "FABRÍCIO SANTOS DE MIRANDA", cargo: "CARGO DE NATUREZA ESPECIAL", periodo: "De 21/06/2023 a 16/08/2026" },
		{ nome: "FABRÍCIO SANTOS DE MIRANDA", cargo: "SECRETÁRIO PARLAMENTAR", periodo: "Desde 17/08/2026" },
	];

	it("uma entrada por pessoa (36 linhas do banco viram 16 pessoas)", () => {
		const g = agruparServidores(linhas, HOJE);
		expect(g.map((x) => x.nome).sort()).toEqual(["ALINE MARIA PEREIRA", "FABRÍCIO SANTOS DE MIRANDA", "FLAELSON LÉDA DOS REIS"]);
	});

	it("o vínculo atual é o mais recente e os vínculos vêm do mais novo ao mais antigo", () => {
		const aline = agruparServidores(linhas, HOJE).find((x) => x.nome.startsWith("ALINE"))!;
		expect(aline.vinculos).toHaveLength(3);
		expect(aline.atual.periodo).toBe("Desde 31/03/2026");
		expect(aline.vinculos.map((v) => v.periodo)).toEqual(["Desde 31/03/2026", "De 18/02/2026 a 30/03/2026", "De 19/02/2025 a 17/02/2026"]);
	});

	it("a pessoa é ATIVA se algum vínculo está vigente; ativos vêm primeiro", () => {
		const g = agruparServidores(linhas, HOJE);
		expect(g.find((x) => x.nome.startsWith("FLAELSON"))!.status).toBe("EXONERADO");
		expect(g.find((x) => x.nome.startsWith("FABR"))!.status).toBe("ATIVO");
		expect(g[g.length - 1].nome).toMatch(/FLAELSON/);
	});

	it("ignora linhas sem nome e tolera lista vazia/nula", () => {
		expect(agruparServidores([{ cargo: "X", periodo: "Desde 01/01/2026" }], HOJE)).toEqual([]);
		expect(agruparServidores([], HOJE)).toEqual([]);
		expect(agruparServidores(undefined as any, HOJE)).toEqual([]);
	});
});
