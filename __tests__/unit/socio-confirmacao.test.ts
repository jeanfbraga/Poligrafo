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

	it("CNPJ inexistente (404): não confirma, diz por quê e não gasta a reserva", async () => {
		const fetchFn = vi.fn(async () => new Response("não encontrado", { status: 404 }));
		const v = await verificarEmpresaDoPolitico("99888777000155", NOMES, CPF, fetchFn as unknown as typeof fetch);
		expect(v).toEqual({ confirmado: false, motivo: "QSA indisponível (HTTP_4XX)" });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("BrasilAPI recusa (429/403): o Minha Receita responde com o mesmo formato; as duas fora = motivo das duas", async () => {
		const reserva = vi.fn(async (url: string) => (url.includes("brasilapi")
			? new Response("limite", { status: 403 })
			: new Response(JSON.stringify({ qsa: [{ nome_socio: "JOSE DA SILVA JUNIOR", cnpj_cpf_do_socio: "***982247**" }] }), { status: 200 })));
		const v = await verificarEmpresaDoPolitico("11.222.333/0001-81", NOMES, CPF, reserva as unknown as typeof fetch);
		expect(v).toMatchObject({ confirmado: true, forca: "CPF_E_NOME" });
		expect(String((reserva.mock.calls.at(-1) as unknown[])[0])).toBe("https://minhareceita.org/11222333000181");
		reiniciarEstadoFonteHttp();
		const fora = vi.fn(async () => new Response("erro", { status: 403 }));
		expect(await verificarEmpresaDoPolitico("11222333000181", NOMES, CPF, fora as unknown as typeof fetch)).toEqual({ confirmado: false, motivo: "QSA indisponível (HTTP_4XX; reserva: HTTP_4XX; ReceitaWS: HTTP_4XX)" });
		expect(String((fora.mock.calls.at(-1) as unknown[])[0])).toBe("https://receitaws.com.br/v1/cnpj/11222333000181");
	});

	it("BrasilAPI e Minha Receita sem a empresa (baixada, como a Bolsotini em 08/10/2026): a ReceitaWS responde no formato dela", async () => {
		const { buscarDadosCnpj } = await import("@/services/integrations/receita/cnpj");
		const so = vi.fn(async (url: string) => (url.includes("receitaws")
			? new Response(JSON.stringify({ status: "OK", nome: "BOLSOTINI CHOCOLATES E CAFE LTDA", situacao: "BAIXADA", capital_social: "100000.00", qsa: [{ nome: "JOSE DA SILVA JUNIOR", qual: "22-Sócio" }] }), { status: 200 })
			: new Response("erro", { status: 403 })));
		const r = await buscarDadosCnpj("21.636.316/0001-44", so as unknown as typeof fetch);
		expect(r).toMatchObject({ ok: true, via: "ReceitaWS", dados: { razao_social: "BOLSOTINI CHOCOLATES E CAFE LTDA", descricao_situacao_cadastral: "BAIXADA", capital_social: 100000, qsa: [{ nome_socio: "JOSE DA SILVA JUNIOR", qualificacao_socio: "22-Sócio" }] } });
		// Sem CPF no QSA da ReceitaWS: vale o nome, como no Minha Receita sem miolo.
		expect(confirmarVinculoSocietario(r.ok ? r.dados : {}, NOMES, CPF)).toMatchObject({ confirmado: true, forca: "NOME" });
	});

	it("ReceitaWS com status ERROR (CNPJ inexistente) não vira empresa", async () => {
		const { deReceitaWs } = await import("@/services/integrations/receita/cnpj");
		expect(deReceitaWs({ status: "ERROR" })).toBeNull();
		expect(deReceitaWs(null)).toBeNull();
	});

	it("na tela: a recusa da BrasilAPI vira 'tentando de novo'; a resposta da reserva limpa o aviso", async () => {
		const { observarFontes } = await import("@/lib/fonte-http/observador");
		const sinais: { tipo: string; url: string }[] = [];
		const reserva = vi.fn(async (url: string) => (url.includes("brasilapi") ? new Response("x", { status: 429 }) : new Response(JSON.stringify({ qsa: [] }), { status: 200 })));
		await observarFontes((s) => sinais.push(s), () => verificarEmpresaDoPolitico("11222333000181", NOMES, CPF, reserva as unknown as typeof fetch));
		// Nova tentativa + passagem para a reserva (o ouvinte de etapas manda um "lenta" só); nunca "falhou".
		expect(sinais.map((s) => `${s.tipo} ${new URL(s.url).host}`)).toEqual(["lenta brasilapi.com.br", "lenta brasilapi.com.br", "respondeu minhareceita.org"]);
	});
});
