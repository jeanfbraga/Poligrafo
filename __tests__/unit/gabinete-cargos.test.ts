import { describe, expect, it } from "vitest";
import { agruparServidores, resumoPorCargo } from "@/lib/gabinete";

const HOJE = new Date(2026, 9, 2);
const reg = (nome: string, cargo: string, periodo: string) => ({ nome, cargo, periodo });

describe("resumoPorCargo", () => {
	it("conta só pessoas ativas, pelo cargo atual, do maior para o menor", () => {
		const pessoas = agruparServidores(
			[
				reg("Ana", "Secretário Parlamentar", "Desde 18/02/2026"),
				reg("Bia", "Secretário Parlamentar", "Desde 18/02/2026"),
				reg("Caio", "Cargo de Natureza Especial", "Desde 31/07/2026"),
				reg("Davi", "Secretário Parlamentar", "De 01/01/2025 a 17/02/2026"),
			],
			HOJE,
		);
		expect(resumoPorCargo(pessoas)).toEqual([
			{ cargo: "Secretário Parlamentar", quantidade: 2 },
			{ cargo: "Cargo de Natureza Especial", quantidade: 1 },
		]);
	});

	it("sem servidores, lista vazia", () => {
		expect(resumoPorCargo([])).toEqual([]);
	});
});
