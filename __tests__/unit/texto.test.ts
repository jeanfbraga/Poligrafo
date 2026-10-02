import { describe, expect, it } from "vitest";
import { corrigirTextoTse, descricaoDeBem, estaEmCaixaAlta, frasesEmCaixaBaixa, tituloCaso } from "@/lib/texto";

describe("estaEmCaixaAlta", () => {
	it("detecta texto gritado e ignora o que já está em caixa mista", () => {
		expect(estaEmCaixaAlta("RADIO PRESS PRODUCOES LTDA")).toBe(true);
		expect(estaEmCaixaAlta("Radio Press Producoes")).toBe(false);
		expect(estaEmCaixaAlta("PL")).toBe(false); // curto demais para decidir
	});
});

describe("tituloCaso", () => {
	it("nomes de pessoas em Title Case, com partículas em minúscula", () => {
		expect(tituloCaso("ALINE MARIA PEREIRA")).toBe("Aline Maria Pereira");
		expect(tituloCaso("ISABELA COSTA MONTEIRO DE BARROS FORTUNATO")).toBe("Isabela Costa Monteiro de Barros Fortunato");
		expect(tituloCaso("FLAELSON LÉDA DOS REIS")).toBe("Flaelson Léda dos Reis");
	});

	it("preserva siglas empresariais, UFs e algarismos romanos", () => {
		expect(tituloCaso("ADMINISTRADORA DE BENS DI SARNO S/S LTDA")).toBe("Administradora de Bens Di Sarno S/S LTDA");
		expect(tituloCaso("CLARO S.A. - EMBRATEL")).toBe("Claro S.A. - Embratel");
		expect(tituloCaso("CAMPO GRANDE - MS")).toBe("Campo Grande - MS");
		expect(tituloCaso("LUIZ III DE SOUZA")).toBe("Luiz III de Souza");
	});

	it("a primeira palavra sempre começa em maiúscula; números ficam", () => {
		expect(tituloCaso("DE ACOLHIMENTO E DESENVOLVIMENTO")).toBe("De Acolhimento e Desenvolvimento");
		expect(tituloCaso("FRENTE 2026 DO PARANÁ")).toBe("Frente 2026 do Paraná");
	});

	it("texto já em caixa mista, vazio ou nulo não é alterado", () => {
		expect(tituloCaso("Frente Parlamentar Mista")).toBe("Frente Parlamentar Mista");
		expect(tituloCaso("")).toBe("");
		expect(tituloCaso(null)).toBe("");
		expect(tituloCaso(undefined)).toBe("");
	});
});

describe("frasesEmCaixaBaixa", () => {
	it("descrição longa vira texto corrido com maiúscula no início das frases", () => {
		expect(frasesEmCaixaBaixa("UM IMOVEL COMERCIAL, SITO NA RUA DR. PAULINO. LOTE DE TERRENO COM 4.000M2")).toMatch(/^Um imovel comercial, sito na rua dr\. Paulino\. Lote de terreno/);
	});

	it("mantém siglas (CNPJ, RENAVAM) e não mexe em texto de caixa mista", () => {
		expect(frasesEmCaixaBaixa("COTAS PARTICIPAÇÃO - CNPJ: 00.617.236/0001-47")).toContain("CNPJ");
		expect(frasesEmCaixaBaixa("Fundo de investimento")).toBe("Fundo de investimento");
	});
});

describe("corrigirTextoTse — travessão perdido na codificação", () => {
	it("troca ¿ por travessão, com ou sem espaços", () => {
		expect(corrigirTextoTse("SALDO EM CONTA DE INVESTIMENTOS ¿ POSIÇÃO 1")).toBe("SALDO EM CONTA DE INVESTIMENTOS – POSIÇÃO 1");
		expect(corrigirTextoTse("ANÁPOLIS¿GO")).toBe("ANÁPOLIS–GO");
		expect(corrigirTextoTse("Colônia Boa Vida ¿ Núcleo ¿Panorama")).toBe("Colônia Boa Vida – Núcleo – Panorama");
	});

	it("não mexe em texto sem o caractere", () => {
		expect(corrigirTextoTse("Terreno")).toBe("Terreno");
		expect(corrigirTextoTse(undefined)).toBe("");
	});
});

describe("descricaoDeBem", () => {
	it("corrige o travessão e tira a caixa alta contínua", () => {
		const r = descricaoDeBem("SALDO EM CONTA DE INVESTIMENTOS ¿ POSIÇÃO 1");
		expect(r).not.toContain("¿");
		expect(r).toContain("–");
		expect(r).toMatch(/^Saldo em conta de investimentos/);
	});
});
