import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarEstadoFonteHttp } from "../../src/lib/fonte-http";
import { fetchContratosByCNPJ } from "../../src/services/integrations/pncp/client";
import { filtrarEOrdenar } from "../../src/services/integrations/contratos/fornecedor";

const CNPJ = "33000167000101";

function json(dados: unknown) {
	return new Response(JSON.stringify(dados), { status: 200, headers: { "content-type": "application/json" } });
}

const contratoCgu = (id: number, cnpj: string, valor: number) => ({
	id,
	objeto: "Objeto: SERVIÇO",
	fornecedor: { cnpjFormatado: cnpj, razaoSocialReceita: "PETROLEO BRASILEIRO S A PETROBRAS" },
	unidadeGestora: { nome: "UG", orgaoVinculado: { cnpj: "00394460000141", nome: "MINISTÉRIO" } },
	valorFinalCompra: valor,
	dataAssinatura: "2025-01-01",
});

const itemPncp = (controle: string, ni: string, valor: number) => ({
	numero_controle_pncp: controle,
	fornecedor_ni: ni,
	fornecedor_nome: "X",
	orgao_cnpj: "46395000000139",
	orgao_nome: "PREFEITURA",
	esfera_id: "M",
	description: "CONTRATO",
	valor_global: valor,
	item_url: `/contratos/1/2025/${controle}`,
});

describe("contratos por fornecedor (PNCP/CGU)", () => {
	beforeEach(() => {
		reiniciarEstadoFonteHttp();
		vi.stubEnv("TRANSPARENCIA_API_KEY", "chave-teste");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("descarta contratos de outros fornecedores (o filtro do PNCP era ignorado)", () => {
		const r = filtrarEOrdenar([
			{ id: "a", niFornecedor: CNPJ, valorGlobal: 10 } as any,
			{ id: "b", niFornecedor: "06121879000106", valorGlobal: 999 } as any,
			{ id: "a", niFornecedor: CNPJ, valorGlobal: 10 } as any,
		], "33.000.167/0001-01");
		expect(r.map((c) => c.id)).toEqual(["a"]);
	});

	it("junta CGU e busca do PNCP, só do fornecedor, do maior valor ao menor", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url.includes("portaldatransparencia")) {
				return json(url.includes("pagina=1") ? [contratoCgu(1, "33.000.167/0001-01", 500), contratoCgu(2, "33.000.167/0001-01", 50)] : []);
			}
			if (url.includes("pncp.gov.br/api/search")) {
				expect(url).toContain("PETROLEO%20BRASILEIRO");
				return json({ items: [itemPncp("P1", CNPJ, 900), itemPncp("P2", "06121879000106", 9999)] });
			}
			return new Response("", { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const r = await fetchContratosByCNPJ(CNPJ);
		expect(r.map((c) => c.numeroControlePNCP)).toEqual(["P1", "cgu:1", "cgu:2"]);
		expect(r.every((c) => c.niFornecedor === CNPJ)).toBe(true);
		expect(r[0]).toMatchObject({ fonte: "PNCP", orgaoEntidade: { razaoSocial: "PREFEITURA" } });
		expect(r[1].url).toBe("https://portaldatransparencia.gov.br/contratos/1");
	});

	it("sem chave da CGU e sem razão social: volta vazio sem chamar o PNCP às cegas", async () => {
		vi.stubEnv("TRANSPARENCIA_API_KEY", "");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect(await fetchContratosByCNPJ(CNPJ)).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("documento inválido não consulta nada", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		expect(await fetchContratosByCNPJ("123")).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
