import { describe, expect, it } from "vitest";
import { casaDoVereador, perfilDaCasa } from "../../src/services/core/alcada";
import { alvoLocalDaRef, interpretarRef } from "../../src/services/core/alvo-ref";

describe("interpretarRef — todos os formatos (novos e antigos)", () => {
	it("Câmara e Senado", () => {
		expect(interpretarRef("FEDERAL:CAMARA:209787")).toEqual({ tipo: "CAMARA", id: "209787" });
		expect(interpretarRef("FEDERAL:SENADO:5012")).toEqual({ tipo: "SENADO", id: "5012" });
	});

	it("prefeito de SP/RJ continua prefeito (antes virava vereador)", () => {
		expect(interpretarRef("SP:PREFEITO:sao-paulo:52998224725")).toMatchObject({
			tipo: "MUNICIPAL", uf: "SP", cargo: "PREFEITO", municipio: "sao-paulo", doc: "52998224725",
		});
		expect(interpretarRef("RJ:PREFEITO:niteroi:52998224725")).toMatchObject({ cargo: "PREFEITO", municipio: "niteroi" });
	});

	it("ESTADUAL:{UF}:{doc} vira assembleia (antes terminava em erro)", () => {
		expect(interpretarRef("ESTADUAL:MG:01236681665")).toEqual({
			tipo: "ASSEMBLEIA", uf: "MG", casa: "ASSEMBLEIA_LEGISLATIVA", doc: "01236681665",
		});
	});

	it("ALERJ/ALESP com nome codificado", () => {
		expect(interpretarRef("ALESP:DEPUTADO_ESTADUAL:ANDR%C3%89%20DO%20PRADO:123")).toMatchObject({
			tipo: "ASSEMBLEIA", uf: "SP", casa: "ALESP", nome: "ANDRÉ DO PRADO", doc: "123",
		});
	});

	it("executivos e refs legadas de SP/RJ", () => {
		expect(interpretarRef("GOVERNADOR:SP:Tarcísio de Freitas")).toMatchObject({ tipo: "EXECUTIVO", cargo: "GOVERNADOR", uf: "SP" });
		expect(interpretarRef("PRESIDENTE:BR:Lula")).toMatchObject({ tipo: "EXECUTIVO", cargo: "PRESIDENTE" });
		expect(interpretarRef("SP:VEREADOR:sao-paulo:999")).toMatchObject({ tipo: "MUNICIPAL", cargo: "VEREADOR" });
		expect(interpretarRef("RJ:X:777")).toMatchObject({ tipo: "MUNICIPAL", cargo: "VEREADOR", municipio: "rio-de-janeiro", doc: "777" });
		expect(interpretarRef("???")).toEqual({ tipo: "DESCONHECIDA", bruto: "???" });
	});
});

describe("alvoLocalDaRef", () => {
	it("prefeito vira PREFEITURA com município para SICONFI/FNDE", () => {
		const a = alvoLocalDaRef(interpretarRef("SP:PREFEITO:sao-paulo:52998224725"), "Ricardo Nunes");
		expect(a).toMatchObject({ casa: "PREFEITURA", uri: "sao-paulo", uf: "SP", _nomeMunicipio: "sao paulo" });
	});

	it("vereador de Niterói não recebe a casa da CMRJ", () => {
		expect(alvoLocalDaRef(interpretarRef("RJ:VEREADOR:niteroi:1"), "x")?.casa).toBe("CAMARA_MUNICIPAL_LOCAL");
		expect(alvoLocalDaRef(interpretarRef("RJ:VEREADOR:rio-de-janeiro:1"), "x")?.casa).toBe("CAMARA_MUNICIPAL_RJ");
	});

	it("deputado estadual de MG ganha alvo (antes: 'ref não encontrado')", () => {
		expect(alvoLocalDaRef(interpretarRef("ESTADUAL:MG:01236681665"), "Ana Paula")).toMatchObject({
			casa: "ASSEMBLEIA_LEGISLATIVA", uf: "MG", id: "01236681665",
		});
	});

	it("Câmara/Senado/Executivo continuam no orquestrador", () => {
		expect(alvoLocalDaRef(interpretarRef("FEDERAL:CAMARA:1"), "x")).toBeNull();
		expect(alvoLocalDaRef(interpretarRef("GOVERNADOR:SP:x"), "x")).toBeNull();
	});
});

describe("perfilDaCasa", () => {
	it("presidente tem rótulo próprio (antes 'Político')", () => {
		expect(perfilDaCasa("PRESIDENCIA_DA_REPUBLICA")).toMatchObject({ cargoDisplay: "Presidente da República", cargoTse: "1" });
	});

	it("governador e assembleias são ESTADUAL (antes caíam em FEDERAL)", () => {
		expect(perfilDaCasa("GOVERNO_ESTADUAL").esfera).toBe("ESTADUAL");
		expect(perfilDaCasa("ASSEMBLEIA_LEGISLATIVA").esfera).toBe("ESTADUAL");
		expect(perfilDaCasa("ASSEMBLEIA_LEGISLATIVA", "DF")).toMatchObject({ cargoTse: "8", cargoDisplay: "Deputado Distrital" });
	});

	it("emendas por autor só para deputado federal e senador", () => {
		const comEmendas = ["CAMARA", "SENADO", "GOVERNO_ESTADUAL", "PREFEITURA", "ALESP", "CAMARA_MUNICIPAL_RJ"]
			.filter((c) => perfilDaCasa(c).emendasPorAutor);
		expect(comEmendas).toEqual(["CAMARA", "SENADO"]);
	});

	it("vereador de qualquer município é MUNICIPAL, cargo 13", () => {
		expect(perfilDaCasa("CAMARA_MUNICIPAL_LOCAL")).toMatchObject({ esfera: "MUNICIPAL", cargoTse: "13" });
		expect(casaDoVereador("sao_paulo")).toBe("CAMARA_MUNICIPAL_SP");
	});
});
