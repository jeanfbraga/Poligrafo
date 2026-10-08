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
		expect(resolverIdentidade({})).toMatchObject({ documento: null, confianca: "baixa", usarDadosTse: false, sqCandidato: null });
	});
});

describe("resolverIdentidade (v2, base de eleitos)", () => {
	const PREFEITO = { sq_candidato: "250002034955", nm_candidato: "RICARDO LUIS REIS NUNES", ds_cargo: "PREFEITO", nm_ue: "SÃO PAULO", ano_eleicao: 2024 };

	it("vereador/prefeito de 2024 (CPF mascarado pelo TSE): número do candidato dá confiança média", () => {
		const id = resolverIdentidade({ docDaRef: "250002034955", eleito: PREFEITO, tse: { nome: "Ricardo Luís Reis Nunes" } });
		expect(id).toMatchObject({ cpf: null, confianca: "media", usarDadosTse: true, sqCandidato: "250002034955", conflitos: [] });
		expect(id.evidencias.join(" ")).toMatch(/Eleito confirmado na base do TSE \(2024\): PREFEITO — SÃO PAULO/);
		expect(podeConsultarPorCpf(id)).toBe(false);
	});

	it("TSE ao vivo com outro nome que o eleito da ref é homônimo: dados descartados", () => {
		const id = resolverIdentidade({ eleito: PREFEITO, tse: { nome: "RICARDO NUNES DA SILVA" } });
		expect(id.usarDadosTse).toBe(false);
		expect(id.conflitos[0]).toMatch(/Nome do TSE diferente do eleito/);
	});

	it("CPF do eleito (2022) vira documento quando não há oficial nem ref", () => {
		const id = resolverIdentidade({ eleito: { ...PREFEITO, nr_cpf_candidato: CPF_A } });
		expect(id).toMatchObject({ cpf: CPF_A, confianca: "alta" });
		expect(id.evidencias[0]).toMatch(/base de eleitos/);
	});

	it("eleito achado por nome: usa o número do candidato, mas NÃO adota o CPF (confiança média)", () => {
		const id = resolverIdentidade({ eleito: { ...PREFEITO, nr_cpf_candidato: CPF_A, porNome: true } });
		expect(id).toMatchObject({ cpf: null, confianca: "media", sqCandidato: "250002034955" });
		expect(id.evidencias.join(" ")).toContain("por nome exato, cargo e UF (resultado único; CPF não adotado)");
		expect(podeConsultarPorCpf(id)).toBe(false);
	});

	it("eleito achado por nome e confirmado por outra fonte oficial (Senado): CPF adotado e a fonte aparece", () => {
		const id = resolverIdentidade({ eleito: { ...PREFEITO, nr_cpf_candidato: CPF_A, porNome: false, confirmadoPor: "nome civil confirmado pelo Senado Federal" } });
		expect(id).toMatchObject({ cpf: CPF_A, confianca: "alta" });
		expect(id.evidencias.join(" ")).toContain("Eleito confirmado na base do TSE (nome civil confirmado pelo Senado Federal)");
		expect(podeConsultarPorCpf(id)).toBe(true);
	});

	it("eleito com CPF diferente do oficial é ignorado", () => {
		const id = resolverIdentidade({ cpfOficial: CPF_A, eleito: { ...PREFEITO, nr_cpf_candidato: CPF_B } });
		expect(id).toMatchObject({ cpf: CPF_A, sqCandidato: null });
		expect(id.conflitos[0]).toMatch(/base de eleitos diferente/);
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
