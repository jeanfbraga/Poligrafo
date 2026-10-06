import { describe, expect, it } from "vitest";
import { confirmarVinculoSocietario, nomesDeReferencia } from "../../src/services/core/socio-confirmacao";

const CPF = "52998224725"; // miolo 982247
const NOMES = nomesDeReferencia(["José da Silva Júnior", "ZÉ DA SILVA (ZEZINHO DO POVO)", "abc"]);

describe("confirmação de sócio pelo QSA", () => {
	it("nomes de referência: sem acento, nome de urna separado e curtos fora", () => {
		expect(NOMES).toEqual(["JOSE DA SILVA JUNIOR", "ZE DA SILVA", "ZEZINHO DO POVO"]);
	});

	it("nome e miolo do CPF iguais: confirmado (forte)", () => {
		const v = confirmarVinculoSocietario({ qsa: [{ nome_socio: "JOSE DA SILVA JUNIOR", cnpj_cpf_do_socio: "***982247**" }] }, NOMES, CPF);
		expect(v).toMatchObject({ confirmado: true, forca: "CPF_E_NOME" });
	});

	it("mesmo nome com miolo diferente é homônimo: descartado", () => {
		const v = confirmarVinculoSocietario({ qsa: [{ nome_socio: "JOSÉ DA SILVA JÚNIOR", cnpj_cpf_do_socio: "***111222**" }] }, NOMES, CPF);
		expect(v.confirmado).toBe(false);
		expect(v.motivo).toMatch(/homônimo/);
	});

	it("sem CPF do político para conferir: vale o nome (como antes)", () => {
		const v = confirmarVinculoSocietario({ qsa: [{ nome_socio: "Jose da Silva Junior", cnpj_cpf_do_socio: "***111222**" }] }, NOMES, null);
		expect(v).toMatchObject({ confirmado: true, forca: "NOME" });
	});

	it("entre dois sócios homônimos, o que tem o CPF certo confirma", () => {
		const v = confirmarVinculoSocietario({
			qsa: [
				{ nome_socio: "JOSE DA SILVA JUNIOR", cnpj_cpf_do_socio: "***111222**" },
				{ nome_socio: "JOSE DA SILVA JUNIOR", cnpj_cpf_do_socio: "***982247**" },
			],
		}, NOMES, CPF);
		expect(v).toMatchObject({ confirmado: true, forca: "CPF_E_NOME" });
	});

	it("nenhum sócio com o nome: não confirmado", () => {
		expect(confirmarVinculoSocietario({ qsa: [{ nome_socio: "MARIA SOUZA" }] }, NOMES, CPF).confirmado).toBe(false);
	});

	it("MEI sem QSA: razão social com o nome; CPF inteiro na razão precisa ser o do político", () => {
		expect(confirmarVinculoSocietario({ razao_social: `JOSE DA SILVA JUNIOR ${CPF}`, qsa: [] }, NOMES, CPF))
			.toMatchObject({ confirmado: true, forca: "RAZAO_SOCIAL" });
		expect(confirmarVinculoSocietario({ razao_social: "JOSE DA SILVA JUNIOR 11144477735" }, NOMES, CPF).confirmado).toBe(false);
		expect(confirmarVinculoSocietario({ razao_social: "PADARIA BOM PAO LTDA" }, NOMES, CPF).confirmado).toBe(false);
	});
});
