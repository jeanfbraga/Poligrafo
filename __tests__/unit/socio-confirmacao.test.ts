import { beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarEstadoFonteHttp } from "../../src/lib/fonte-http";
import { confirmarVinculoSocietario, nomesDeReferencia, verificarEmpresaDoPolitico } from "../../src/services/core/socio-confirmacao";

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

describe("consulta do QSA (BrasilAPI)", () => {
	beforeEach(() => reiniciarEstadoFonteHttp());

	it("consulta a BrasilAPI pelo CNPJ e decide pelo QSA", async () => {
		const fetchFn = vi.fn(async () => new Response(JSON.stringify({ qsa: [{ nome_socio: "JOSE DA SILVA JUNIOR", cnpj_cpf_do_socio: "***982247**" }] }), { status: 200 }));
		const v = await verificarEmpresaDoPolitico("11.222.333/0001-81", NOMES, CPF, fetchFn as unknown as typeof fetch);
		expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toBe("https://brasilapi.com.br/api/cnpj/v1/11222333000181");
		expect(v).toMatchObject({ confirmado: true, forca: "CPF_E_NOME" });
	});

	it("QSA fora do ar: não confirma e o motivo (que vai para o log da tela) diz por quê", async () => {
		const fetchFn = vi.fn(async () => new Response("não encontrado", { status: 404 }));
		const v = await verificarEmpresaDoPolitico("99888777000155", NOMES, CPF, fetchFn as unknown as typeof fetch);
		expect(v).toEqual({ confirmado: false, motivo: "QSA indisponível (HTTP_4XX)" });
	});
});
