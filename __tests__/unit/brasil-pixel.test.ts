import { describe, expect, it } from "vitest";
import {
	BRMAP_CODES,
	BRMAP_ROWS,
	CELULA,
	construirFormaBrasil,
	FOGOS,
	nivelDeCalor,
	TROFEU,
	ufDaLetra,
} from "@/components/dashboard/brasil-pixel";

describe("mapa pixel do Brasil", () => {
	const forma = construirFormaBrasil();

	it("a grade tem 54 linhas e 55 colunas de largura máxima", () => {
		expect(BRMAP_ROWS).toHaveLength(54);
		expect(forma.W).toBe(55 * CELULA);
		expect(forma.H).toBe(54 * CELULA);
	});

	it("todas as 27 UFs aparecem no preenchimento", () => {
		expect(Object.keys(forma.fill).sort()).toEqual([...BRMAP_CODES].sort());
		expect(BRMAP_CODES).toHaveLength(27);
	});

	it("cada UF tem contorno e os estados grandes têm rótulo (DF não)", () => {
		for (const uf of BRMAP_CODES) expect(forma.edge[uf], uf).toBeTruthy();
		expect(forma.label.AM).toBeDefined();
		expect(forma.label.SP).toBeDefined();
		expect(forma.label.DF).toBeUndefined();
	});

	it("ufDaLetra converte letra, '#' (DF) e vazio", () => {
		expect(ufDaLetra("A")).toBe("AC");
		expect(ufDaLetra("#")).toBe("DF");
		expect(ufDaLetra(".")).toBeNull();
	});

	it("os paths de preenchimento só usam retângulos (M h v h z)", () => {
		expect(forma.fill.SP).toMatch(/^(M[\d.]+ [\d.]+h\d+v6h-\d+z)+$/);
	});

	it("nivelDeCalor usa raiz quadrada e cobre 0 a 4", () => {
		expect(nivelDeCalor(100, 100)).toBe(4);
		expect(nivelDeCalor(50, 100)).toBe(3);
		expect(nivelDeCalor(25, 100)).toBe(2);
		expect(nivelDeCalor(8, 100)).toBe(1);
		expect(nivelDeCalor(1, 100)).toBe(0);
		expect(nivelDeCalor(5, 0)).toBe(0);
	});

	it("troféu 16x16 e fogos determinísticos", () => {
		for (const [x, y, w] of TROFEU) {
			expect(x + w).toBeLessThanOrEqual(16);
			expect(y).toBeLessThan(16);
		}
		expect(FOGOS).toHaveLength(14);
		expect(construirFormaBrasil().fill).toEqual(forma.fill);
	});
});
