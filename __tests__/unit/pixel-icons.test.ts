import { describe, expect, it } from "vitest";
import {
	buildPixelPath,
	ICONS_8,
	ICONS_10,
	resolvePixelIcon,
} from "@/components/pixel/pixel-icons";

describe("ícones pixel — integridade das grades", () => {
	it("toda grade 10x10 tem 10 linhas de 10 colunas só com '#' e '.'", () => {
		for (const [name, rows] of Object.entries(ICONS_10)) {
			expect(rows, name).toHaveLength(10);
			for (const row of rows) {
				expect(row, `${name}: ${row}`).toMatch(/^[#.]{10}$/);
			}
		}
	});

	it("toda grade 8x8 tem 8 linhas de 8 colunas só com '#' e '.'", () => {
		for (const [name, rows] of Object.entries(ICONS_8)) {
			expect(rows, name).toHaveLength(8);
			for (const row of rows) {
				expect(row, `${name}: ${row}`).toMatch(/^[#.]{8}$/);
			}
		}
	});

	it("todo ícone 8x8 existe também na versão 10x10", () => {
		for (const name of Object.keys(ICONS_8)) {
			expect(name in ICONS_10, name).toBe(true);
		}
	});

	it("todo ícone tem ao menos um pixel aceso", () => {
		for (const [name, rows] of Object.entries({ ...ICONS_10 })) {
			expect(rows.join("").includes("#"), name).toBe(true);
		}
	});
});

describe("buildPixelPath", () => {
	it("agrupa sequências horizontais em um único retângulo", () => {
		expect(buildPixelPath(["###..#"])).toBe("M0 0h3v1h-3zM5 0h1v1h-1z");
	});

	it("emite um retângulo por linha com pixels", () => {
		expect(buildPixelPath(["#.", ".#"])).toBe("M0 0h1v1h-1zM1 1h1v1h-1z");
	});

	it("grade vazia gera path vazio", () => {
		expect(buildPixelPath(["....", "...."])).toBe("");
	});
});

describe("resolvePixelIcon — escolha de grade e tamanho", () => {
	it("12–15px com versão 8x8 usa a grade 8 renderizada em 16px", () => {
		const r = resolvePixelIcon("search", 14);
		expect(r.grid).toBe(8);
		expect(r.px).toBe(16);
	});

	it("16px ou mais usa a grade 10 renderizada em 20px", () => {
		const r = resolvePixelIcon("search", 16);
		expect(r.grid).toBe(10);
		expect(r.px).toBe(20);
	});

	it("ícones simples abaixo de 16px ficam em 10px", () => {
		expect(resolvePixelIcon("chev", 14).px).toBe(10);
		expect(resolvePixelIcon("x", 12).px).toBe(10);
	});

	it("ícones simples a partir de 16px vão para 20px", () => {
		expect(resolvePixelIcon("x", 16).px).toBe(20);
	});

	it("ícone sem versão 8x8 em 14px cai para 20px (grade 10)", () => {
		const r = resolvePixelIcon("lock", 14);
		expect(r.grid).toBe(10);
		expect(r.px).toBe(20);
	});

	it("abaixo de 12px usa sempre 10px", () => {
		expect(resolvePixelIcon("search", 10).px).toBe(10);
	});

	it("o path é estável (cache) entre chamadas", () => {
		expect(resolvePixelIcon("user", 16).path).toBe(resolvePixelIcon("user", 20).path);
	});
});
