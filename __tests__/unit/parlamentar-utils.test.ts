import { describe, it, expect } from "vitest";
import {
	formatarNomeFrente,
	formatarComissao,
	agruparFrentesPorTema,
	identificarTemaFrente,
} from "@/lib/parlamentar-utils";

describe("parlamentar-utils", () => {
	describe("formatarNomeFrente", () => {
		it("limpa prefixos padrão e extrai sigla", () => {
			const res = formatarNomeFrente("Frente Parlamentar da Agropecuária - FPA");
			expect(res.label).toBe("Agropecuária");
			expect(res.sigla).toBe("FPA");
			expect(res.isMista).toBe(false);
			expect(res.tema).toBe("Agro & Meio Ambiente");
		});

		it("detecta frente mista e remove em defesa de", () => {
			const res = formatarNomeFrente("Frente Parlamentar Mista em Defesa da Primeira Infância");
			expect(res.label).toBe("Primeira Infância");
			expect(res.isMista).toBe(true);
			expect(res.tema).toBe("Educação & Ciência");
		});

		it("trata siglas entre parênteses", () => {
			const res = formatarNomeFrente("Frente Parlamentar do Cooperativismo (FRENCOOP)");
			expect(res.label).toBe("Cooperativismo");
			expect(res.sigla).toBe("FRENCOOP");
		});

		it("classifica segurança pública", () => {
			const res = formatarNomeFrente("Frente Parlamentar da Segurança Pública");
			expect(res.label).toBe("Segurança Pública");
			expect(res.tema).toBe("Segurança & Defesa");
		});
	});

	describe("formatarComissao", () => {
		it("reconhece sigla CCJC e limpa nome", () => {
			const res = formatarComissao("Comissão de Constituição e Justiça e de Cidadania");
			expect(res.sigla).toBe("CCJC");
			expect(res.tipo).toBe("Permanente");
			expect(res.nome).toContain("Constituição e Justiça");
		});

		it("reconhece CPI e destaca", () => {
			const res = formatarComissao("CPI - Manipulação de Jogos e Apostas Esportivas");
			expect(res.tipo).toBe("CPI");
			expect(res.destaque).toBe(true);
		});

		it("respeita objeto com cargo de Presidente", () => {
			const res = formatarComissao({
				nomeOrgao: "Comissão de Fiscalização Financeira e Controle",
				siglaOrgao: "CFFC",
				titulo: "Presidente",
			});
			expect(res.sigla).toBe("CFFC");
			expect(res.cargo).toBe("Presidente");
			expect(res.destaque).toBe(true);
		});
	});

	describe("agruparFrentesPorTema", () => {
		it("agrupa frentes por categorias temáticas", () => {
			const lista = [
				"Frente Parlamentar da Agropecuária",
				"Frente Parlamentar da Segurança Pública",
				"Frente Parlamentar da Educação",
				"Frente Parlamentar pelo Livre Mercado",
			];
			const agrupado = agruparFrentesPorTema(lista);
			expect(agrupado["Agro & Meio Ambiente"]).toHaveLength(1);
			expect(agrupado["Segurança & Defesa"]).toHaveLength(1);
			expect(agrupado["Educação & Ciência"]).toHaveLength(1);
			expect(agrupado["Economia & Mercado"]).toHaveLength(1);
		});
	});
});
