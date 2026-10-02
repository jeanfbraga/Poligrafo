import { describe, expect, it } from "vitest";
import { agruparBens, categoriaDoBem, maioresBens } from "@/lib/patrimonio";

describe("categoriaDoBem", () => {
	it("agrupa os tipos do TSE em 6 categorias", () => {
		expect(categoriaDoBem("Terreno")).toBe("imoveis");
		expect(categoriaDoBem("Outros bens imóveis")).toBe("imoveis");
		expect(categoriaDoBem("Apartamento")).toBe("imoveis");
		expect(categoriaDoBem("Veículo automotor terrestre: caminhão, automóvel, moto, etc.")).toBe("veiculos");
		expect(categoriaDoBem("Outras participações societárias")).toBe("participacoes");
		expect(categoriaDoBem("Quotas ou quinhões de capital")).toBe("participacoes");
		expect(categoriaDoBem("Depósito bancário em conta corrente no País")).toBe("dinheiro");
		expect(categoriaDoBem("Dinheiro em espécie - moeda nacional")).toBe("dinheiro");
	});

	it("'Fundos: Ações…' é aplicação (não participação); desconhecido vai para 'outros'", () => {
		expect(categoriaDoBem("Fundos: Ações, Mútuos de Privatização, Invest. Empresas Emergentes")).toBe("aplicacoes");
		expect(categoriaDoBem("CDB, RDB e outros títulos")).toBe("aplicacoes");
		expect(categoriaDoBem("Obra de arte")).toBe("outros");
		expect(categoriaDoBem(undefined)).toBe("outros");
	});
});

describe("agruparBens / maioresBens", () => {
	const bens = [
		{ descricao: "Casa A", tipoBem: "Casa", valor: 600 },
		{ descricao: "Terreno B", tipoBem: "Terreno", valor: 200 },
		{ descricao: "Carro", tipoBem: "Veículo automotor terrestre", valor: 150 },
		{ descricao: "Quotas", tipoBem: "Outras participações societárias", valor: 50 },
	];

	it("soma por categoria, em ordem decrescente, com percentual do total listado", () => {
		const g = agruparBens(bens);
		expect(g.map((x) => x.categoria)).toEqual(["imoveis", "veiculos", "participacoes"]);
		expect(g[0]).toMatchObject({ rotulo: "Imóveis", total: 800, quantidade: 2 });
		expect(g[0].percentual).toBeCloseTo(80);
		expect(g.reduce((s, x) => s + x.percentual, 0)).toBeCloseTo(100);
	});

	it("sem bens ou com valores zero não quebra", () => {
		expect(agruparBens([])).toEqual([]);
		expect(agruparBens([{ tipoBem: "Casa", valor: 0 }])[0].percentual).toBe(0);
	});

	it("os N maiores, sem alterar a lista original", () => {
		expect(maioresBens(bens, 2).map((b) => b.descricao)).toEqual(["Casa A", "Terreno B"]);
		expect(bens[0].descricao).toBe("Casa A");
	});
});
