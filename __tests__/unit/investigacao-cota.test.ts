import { describe, expect, it } from "vitest";
import type { DossieNode } from "@/lib/investigacao/dossie-state";
import { ANO_INICIO_CEAP, LIMITE_NOTAS_CEAP, lerData, resumirCota, textoRecorte } from "@/lib/investigacao/cota";

const desp = (id: string, valor: number, data?: string, type = "DESPESA"): DossieNode => ({
	id,
	type,
	position: { x: 0, y: 0 },
	data: { label: id, valor, dataDocumento: data },
});

describe("lerData", () => {
	it("aceita ISO, ISO curto e dd/mm/aaaa; ignora lixo", () => {
		expect(lerData("2026-07-31T00:00:00")?.getFullYear()).toBe(2026);
		expect(lerData("2026-07-31")?.getMonth()).toBe(6);
		expect(lerData("31/07/2026")?.getDate()).toBe(31);
		expect(lerData("")).toBeNull();
		expect(lerData("sem data")).toBeNull();
		expect(lerData(undefined)).toBeNull();
	});
});

describe("resumirCota", () => {
	it("sem despesas não há resumo", () => {
		expect(resumirCota([], [])).toBeNull();
		expect(resumirCota([desp("p", 1, undefined, "PESSOA")], [])).toBeNull();
	});

	it("soma despesas do grafo e da lista, com período e sem limite atingido", () => {
		const r = resumirCota([desp("a", 100, "2024-02-06T00:00:00")], [desp("b", 50.5, "2026-08-25T00:00:00"), desp("c", 10)])!;
		expect(r.notas).toBe(3);
		expect(r.total).toBeCloseTo(160.5);
		expect(r.de?.getFullYear()).toBe(2024);
		expect(r.ate?.getFullYear()).toBe(2026);
		expect(r.limitado).toBe(false);
		expect(textoRecorte(r)).toBe(`Todas as 3 notas desde ${ANO_INICIO_CEAP}.`);
	});

	it("ao atingir o limite avisa que notas menores ficam fora", () => {
		const muitas = Array.from({ length: LIMITE_NOTAS_CEAP }, (_, i) => desp(`d${i}`, 10, "2025-01-01"));
		const r = resumirCota([], muitas)!;
		expect(r.limitado).toBe(true);
		expect(textoRecorte(r)).toMatch(/maiores notas \(por valor\)/);
		expect(textoRecorte(r)).toMatch(/não entram/);
	});

	it("sem datas válidas o período fica nulo", () => {
		const r = resumirCota([], [desp("a", 5, "xx")])!;
		expect(r.de).toBeNull();
		expect(r.ate).toBeNull();
	});
});
