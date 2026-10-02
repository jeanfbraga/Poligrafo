import { describe, expect, it } from "vitest";
import { calcularCamera, ZOOM_MINIMO_LEGIVEL } from "@/components/dossie/useDossieLayout";
import type { DossieNode } from "@/lib/investigacao/dossie-state";

const no = (id: string, x: number, y: number, type = "DESPESA", extra: Partial<DossieNode> = {}): DossieNode => ({
	id,
	type,
	position: { x, y },
	data: { label: id },
	...extra,
});

describe("calcularCamera", () => {
	it("sem nós ou sem tamanho de canvas não há câmera", () => {
		expect(calcularCamera([], 800, 600, 100)).toBeNull();
		expect(calcularCamera([no("a", 0, 0)], 0, 600, 100)).toBeNull();
	});

	it("grafo pequeno cabe inteiro em zoom legível e abaixo da faixa do topo", () => {
		const cam = calcularCamera([no("p", 0, 0, "PESSOA"), no("a", 400, 0)], 1000, 700, 112);
		expect(cam).not.toBeNull();
		expect(cam!.zoom).toBeGreaterThanOrEqual(ZOOM_MINIMO_LEGIVEL);
		expect(cam!.zoom).toBeLessThanOrEqual(1);
		// o topo do conteúdo (y=0 do grafo) fica abaixo da faixa/legenda
		expect(cam!.y).toBeGreaterThanOrEqual(112);
	});

	it("grafo muito alto não desce do zoom mínimo legível (foca a pessoa e vizinhos)", () => {
		const filhos = Array.from({ length: 12 }, (_, i) => no(`n${i}`, 400, i * 380 - 2000));
		const cam = calcularCamera([no("p", 0, 0, "PESSOA"), ...filhos], 800, 600, 112);
		expect(cam!.zoom).toBeGreaterThanOrEqual(ZOOM_MINIMO_LEGIVEL);
	});

	it("nós ocultos (emendas) não entram no enquadramento", () => {
		const a = calcularCamera([no("p", 0, 0, "PESSOA"), no("longe", 0, 99999, "EMENDA", { hidden: true })], 800, 600, 24);
		const b = calcularCamera([no("p", 0, 0, "PESSOA")], 800, 600, 24);
		expect(a).toEqual(b);
	});
});
