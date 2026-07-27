import { describe, expect, it } from "vitest";
import {
	agregarEmendasPorUf,
	agruparCeapPorUf,
	normalizarUfDestino,
	agruparPesquisas,
} from "../../src/lib/dashboard-aggregations";

describe("agruparCeapPorUf", () => {
	const dep = (uf: string, total_gasto: number, nome = "X") => ({
		uf,
		total_gasto,
		nome,
	});

	it("total da UF soma TODOS os deputados, não apenas os 5 do detalhe", () => {
		// Regressão do bug "4,4 mi repetidos": RS com 7 deputados tinha o
		// "total" calculado somando apenas os 5 primeiros.
		const rows = [
			dep("RS", 900),
			dep("RS", 800),
			dep("RS", 700),
			dep("RS", 600),
			dep("RS", 500),
			dep("RS", 400),
			dep("RS", 300),
		];
		const grupos = agruparCeapPorUf(rows);
		expect(grupos.RS.total).toBe(4200);
		expect(grupos.RS.deputados).toHaveLength(5);
		expect(grupos.RS.deputados[0].total_gasto).toBe(900);
	});

	it("duas UFs com top-5 idêntico têm totais diferentes quando a bancada difere", () => {
		// Caso real: RS (31 deps) e RR (8 deps) exibiam o mesmo "4,4 mi".
		const top5 = [900, 800, 700, 600, 500];
		const rows = [
			...top5.map((v) => dep("RS", v)),
			dep("RS", 250),
			dep("RS", 250),
			...top5.map((v) => dep("RR", v)),
		];
		const grupos = agruparCeapPorUf(rows);
		expect(grupos.RS.total).toBe(4000);
		expect(grupos.RR.total).toBe(3500);
		expect(grupos.RS.total).toBeGreaterThan(grupos.RR.total);
	});

	it("ignora deputados sem UF ou com UF='BR'", () => {
		const grupos = agruparCeapPorUf([
			dep("BR", 999),
			dep("", 999),
			{ total_gasto: 999, nome: "sem uf" } as any,
			dep("SP", 100),
		]);
		expect(Object.keys(grupos)).toEqual(["SP"]);
		expect(grupos.SP.total).toBe(100);
	});

	it("converte total_gasto para número e tolera valores inválidos", () => {
		const grupos = agruparCeapPorUf([
			{ uf: "MG", total_gasto: "123.5" as any, nome: "a" },
			{ uf: "MG", total_gasto: Number.NaN, nome: "b" },
		]);
		expect(grupos.MG.total).toBeCloseTo(123.5);
	});

	it("retorna chaves em ordem alfabética", () => {
		const grupos = agruparCeapPorUf([dep("SP", 1), dep("AC", 2), dep("MG", 3)]);
		expect(Object.keys(grupos)).toEqual(["AC", "MG", "SP"]);
	});
});

describe("normalizarUfDestino", () => {
	it("mantém siglas", () => {
		expect(normalizarUfDestino("SP")).toBe("SP");
		expect(normalizarUfDestino("BA")).toBe("BA");
	});

	it("converte 'NOME (UF)' para sigla", () => {
		expect(normalizarUfDestino("SÃO PAULO (UF)")).toBe("SP");
		expect(normalizarUfDestino("BAHIA (UF)")).toBe("BA");
		expect(normalizarUfDestino("MINAS GERAIS (UF)")).toBe("MG");
		expect(normalizarUfDestino("ESPÍRITO SANTO (UF)")).toBe("ES");
		expect(normalizarUfDestino("MATO GROSSO DO SUL (UF)")).toBe("MS");
		expect(normalizarUfDestino("DISTRITO FEDERAL (UF)")).toBe("DF");
		expect(normalizarUfDestino("PARÁ (UF)")).toBe("PA");
	});

	it("preserva rótulos especiais", () => {
		expect(normalizarUfDestino("MÚLTIPLO")).toBe("MÚLTIPLO");
	});
});

describe("agregarEmendasPorUf", () => {
	it("funde o mesmo estado escrito de formas diferentes", () => {
		// Caso real: "SP" e "SÃO PAULO (UF)" apareciam como duas barras.
		const out = agregarEmendasPorUf([
			{ uf_destino: "SP", total_pix: 48_255_867.3 },
			{ uf_destino: "SÃO PAULO (UF)", total_pix: 23_158_571.95 },
			{ uf_destino: "BA", total_pix: 22_778_970.99 },
			{ uf_destino: "BAHIA (UF)", total_pix: 84_168_266.81 },
		]);
		expect(out).toHaveLength(2);
		const sp = out.find((r: any) => r.uf_destino === "SP");
		const ba = out.find((r: any) => r.uf_destino === "BA");
		expect(sp?.total_pix).toBeCloseTo(71_414_439.25, 2);
		expect(ba?.total_pix).toBeCloseTo(106_947_237.8, 2);
	});

	it("ordena do maior para o menor e mantém MÚLTIPLO", () => {
		const out = agregarEmendasPorUf([
			{ uf_destino: "AC", total_pix: 10 },
			{ uf_destino: "MÚLTIPLO", total_pix: 1000 },
			{ uf_destino: "ACRE (UF)", total_pix: 5 },
		]);
		expect(out.map((r: any) => r.uf_destino)).toEqual(["MÚLTIPLO", "AC"]);
		expect(out[1].total_pix).toBe(15);
	});
});

describe("agruparPesquisas", () => {
	it("agrupa pesquisas com o mesmo id_deputado", () => {
		const out = agruparPesquisas([
			{ termo: "Davi Alcolumbre", quantidade: 2, id_deputado: 123 },
			{ termo: "Davi Alcolumbre", quantidade: 1, id_deputado: 123 },
			{ termo: "Outro Político", quantidade: 5, id_deputado: 456 },
		]);
		expect(out).toHaveLength(2);
		expect(out.find((r: any) => r.id_deputado === 123)?.quantidade).toBe(3);
		expect(out.find((r: any) => r.id_deputado === 456)?.quantidade).toBe(5);
	});

	it("agrupa pesquisas pelo termo normalizado se não houver id_deputado", () => {
		const out = agruparPesquisas([
			{ termo: "Davi Alcolumbre", quantidade: 2 },
			{ termo: "davi alcolumbre", quantidade: 1 },
			{ termo: " DAVÍ ALCOLUMBRÉ ", quantidade: 3 },
			{ termo: "Fulano", quantidade: 5 },
		]);
		expect(out).toHaveLength(2);
		expect(out.find((r: any) => r.termo.toLowerCase().includes("davi"))?.quantidade).toBe(6);
	});

	it("ordena do maior para o menor", () => {
		const out = agruparPesquisas([
			{ termo: "A", quantidade: 2 },
			{ termo: "B", quantidade: 5 },
			{ termo: "C", quantidade: 3 },
			{ termo: "A", quantidade: 1 }, // A vai para 3
		]);
		expect(out.map((r: any) => r.termo)).toEqual(["B", "A", "C"]);
		expect(out.map((r: any) => r.quantidade)).toEqual([5, 3, 3]); // Se houver empate, a ordem é mantida como inserido
	});

	it("não mistura registros com o mesmo nome mas id_deputado diferentes (caso improvável)", () => {
		const out = agruparPesquisas([
			{ termo: "João Silva", quantidade: 2, id_deputado: 1 },
			{ termo: "João Silva", quantidade: 3, id_deputado: 2 },
		]);
		expect(out).toHaveLength(2);
		expect(out.find((r: any) => r.id_deputado === 1)?.quantidade).toBe(2);
		expect(out.find((r: any) => r.id_deputado === 2)?.quantidade).toBe(3);
	});
});
