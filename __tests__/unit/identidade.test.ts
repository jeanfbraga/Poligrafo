import { describe, expect, it } from "vitest";
import { ordenarMunicipios, slugMunicipio } from "../../src/app/api/investigar/tse";
import { podeConsultarPorCpf, resolverIdentidade } from "../../src/services/core/identidade";

const CPF_A = "52998224725";
const CPF_B = "11144477735";

describe("resolverIdentidade (v1)", () => {
	it("CPF oficial da Câmara vence e TSE que confere é usado", () => {
		const id = resolverIdentidade({ cpfOficial: "529.982.247-25", tse: { cpf: CPF_A, nome: "FULANO DE TAL" } });
		expect(id).toMatchObject({ cpf: CPF_A, documento: CPF_A, confianca: "alta", usarDadosTse: true, conflitos: [] });
		expect(podeConsultarPorCpf(id)).toBe(true);
	});

	it("TSE com CPF diferente do oficial é descartado (homônimo não sobrescreve nada)", () => {
		const id = resolverIdentidade({ cpfOficial: CPF_A, tse: { cpf: CPF_B, nome: "OUTRA PESSOA" } });
		expect(id.cpf).toBe(CPF_A);
		expect(id.usarDadosTse).toBe(false);
		expect(id.conflitos[0]).toMatch(/homônimo/);
	});

	it("CPF mascarado do TSE não vira documento", () => {
		const id = resolverIdentidade({ tse: { cpf: "***.982.247-**" } });
		expect(id).toMatchObject({ cpf: null, documento: null, confianca: "baixa" });
		expect(podeConsultarPorCpf(id)).toBe(false);
	});

	it("documento da ref escolhida tem precedência sobre o TSE", () => {
		const id = resolverIdentidade({ docDaRef: CPF_A, tse: { cpf: CPF_A } });
		expect(id).toMatchObject({ cpf: CPF_A, confianca: "alta", usarDadosTse: true });
	});

	it("só CNPJ de campanha: confiança média e documento marcado como CNPJ", () => {
		const id = resolverIdentidade({ tse: { documentoPrincipal: "33000167000101", isCnpj: true } });
		expect(id).toMatchObject({ cpf: null, cnpjCampanha: "33000167000101", documentoIsCnpj: true, confianca: "media" });
		expect(podeConsultarPorCpf(id)).toBe(false);
	});

	it("sem nada: confiança baixa, sem documento inventado", () => {
		expect(resolverIdentidade({})).toMatchObject({ documento: null, confianca: "baixa", usarDadosTse: false });
	});
});

describe("município do alvo no TSE", () => {
	it("slug igual para grafias diferentes", () => {
		expect(slugMunicipio("São Paulo")).toBe("sao-paulo");
		expect(slugMunicipio("SAO_PAULO")).toBe("sao-paulo");
		expect(slugMunicipio("Niterói")).toBe("niteroi");
	});

	it("município da ref vem primeiro e é marcado como encontrado", () => {
		const r = ordenarMunicipios(
			[{ codigo: "1", nome: "ANGRA DOS REIS" }, { codigo: "60011", nome: "RIO DE JANEIRO" }, { codigo: "58653", nome: "NITERÓI" }],
			"niteroi",
		);
		expect(r).toEqual({ codigos: ["58653", "60011", "1"], preferido: true });
	});

	it("sem município: capitais primeiro (o comparador antigo não ordenava)", () => {
		const r = ordenarMunicipios([{ codigo: "1", nome: "A" }, { codigo: "71072", nome: "SÃO PAULO" }]);
		expect(r).toEqual({ codigos: ["71072", "1"], preferido: false });
	});
});
