import { beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarEstadoFonteHttp } from "../../src/lib/fonte-http";
import { fatosDeNos } from "../../src/services/cruzamentos/adaptadores";
import { executarCruzamentos } from "../../src/services/cruzamentos/motor";
import type { Fato } from "../../src/services/cruzamentos/tipos";
import { buscarPagamentosFederais, lerPagamento } from "../../src/services/integrations/transparencia/pagamentos";

const CNPJ = "11222333000181";
const PAGAMENTO = {
	data: "15/01/2025", documento: "242160242162025DF800224", documentoResumido: "2025DF800224",
	observacao: "PAGAMENTO AO FORNECEDOR X", funcao: "24 - Comunicações", programa: "2305 - COMUNICACOES",
	acao: "15UI - REDE", orgao: "Ministério das Comunicações", orgaoSuperior: "Ministério das Comunicações",
	valor: "1.234.567,89", autor: "Sem informação", nomeFavorecido: "EMPRESA X", codigoFavorecido: "11.222.333/0001-81",
};

describe("pagamentos do governo federal (Portal, documentos-por-favorecido)", () => {
	beforeEach(() => reiniciarEstadoFonteHttp());

	it("lê o pagamento: valor brasileiro, data ISO, 'Sem informação' vira vazio", () => {
		expect(lerPagamento(PAGAMENTO)).toMatchObject({
			documento: "2025DF800224", data: "2025-01-15", valor: 1234567.89, orgao: "Ministério das Comunicações",
			autorEmenda: "", favorecido: "EMPRESA X", codigoFavorecido: CNPJ,
		});
	});

	it("usa codigoPessoa + ano + fase 3 (o antigo /por-favorecido?cnpjFornecedor= dava 403) e confere o favorecido", async () => {
		const fetchFn = vi.fn(async (url: string) => {
			const ano = new URL(url).searchParams.get("ano");
			const outro = { ...PAGAMENTO, codigoFavorecido: "99.888.777/0001-55", valor: "9999999,00" };
			const corpo = ano === "2025" ? [PAGAMENTO, outro] : [{ ...PAGAMENTO, valor: "10,00", data: "02/02/2026" }];
			return new Response(JSON.stringify(corpo), { status: 200 });
		});
		const r = await buscarPagamentosFederais("11.222.333/0001-81", [2026, 2025], "chave", fetchFn as never);
		const url = new URL(String(fetchFn.mock.calls[0][0]));
		expect(url.pathname).toBe("/api-de-dados/despesas/documentos-por-favorecido");
		expect(url.searchParams.get("codigoPessoa")).toBe(CNPJ);
		expect(url.searchParams.get("fase")).toBe("3");
		expect(r.map((p) => p.valor)).toEqual([1234567.89, 10]);
		const nunca = vi.fn();
		expect(await buscarPagamentosFederais(CNPJ, [2026], "", nunca as never)).toEqual([]);
		expect(nunca).not.toHaveBeenCalled();
	});

	it("o nó do pagamento vira fato e cruza com empresa do político (contrato público)", () => {
		const fatos = fatosDeNos([{ id: `cgu-pagamento-${CNPJ}-0`, type: "DESPESA", data: { documento: CNPJ, valor: 1234567.89, dataDocumento: "2025-01-15", orgao: "Ministério das Comunicações", tipo: "24 - Comunicações", fonte: "Portal da Transparência — pagamentos do governo federal" } }], "2026-10-08T00:00:00Z");
		expect(fatos).toEqual([expect.objectContaining({ papel: "CONTRATADO_PUBLICO", documento: CNPJ, valor: 1234567.89, detalhe: "Ministério das Comunicações — 24 - Comunicações" })]);
		const empresa: Fato = { id: "e", papel: "EMPRESA_DO_POLITICO", documento: CNPJ, nome: "EMPRESA X", procedencia: { fonte: "QSA", chave: "x", coletadoEm: "" } };
		expect(executarCruzamentos([empresa, ...fatos]).map((a) => [a.regra, a.severidade])).toEqual([["empresa-politico-contratada", "MEDIA"]]);
	});
});

describe("buscarReceitasFederais no pipe", () => {
	it("emite nós de contexto sem nota fixa e registra no log quantos pagamentos achou", async () => {
		vi.resetModules();
		vi.doMock("@/services/integrations/transparencia/pagamentos", () => ({
			buscarPagamentosFederais: vi.fn(async () => [lerPagamento(PAGAMENTO), lerPagamento({ ...PAGAMENTO, valor: "5,00" })]),
		}));
		vi.doMock("@/services/integrations/contratos/fornecedor", () => ({ buscarContratosPorFornecedor: vi.fn(async () => []) }));
		const { buscarReceitasFederais } = await import("../../src/app/api/investigar/scrapers/osint-fiscal");
		const eventos: { tipo: string; payload: any }[] = [];
		await buscarReceitasFederais(CNPJ, "pessoa-1", (tipo: string, payload: any) => eventos.push({ tipo, payload }));
		const ano = new Date().getFullYear();
		expect(eventos[0]).toEqual({ tipo: "STATUS", payload: { msg: `[CGU] 2 pagamento(s) do governo federal ao documento ${CNPJ} em ${ano - 1}–${ano}.` } });
		const nos = eventos.filter((e) => e.tipo === "NODE_NOVO");
		expect(nos).toHaveLength(2);
		expect(nos[0].payload).toMatchObject({ id: `cgu-pagamento-${CNPJ}-0`, data: { label: "Ministério das Comunicações", valor: 1234567.89, documento: CNPJ } });
		expect(nos[0].payload.data).not.toHaveProperty("score_letalidade");
		vi.doUnmock("@/services/integrations/transparencia/pagamentos");
		vi.doUnmock("@/services/integrations/contratos/fornecedor");
	});
});

describe("TCEs com fonte morta (roteador municipal)", () => {
	it("não chama endereço morto: devolve vazio e diz no log por quê", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { buscarDespesasMunicipalMestre, TCES_APOSENTADOS } = await import("../../src/app/api/investigar/municipios/router");
		for (const uf of Object.keys(TCES_APOSENTADOS)) {
			expect(await buscarDespesasMunicipalMestre(uf, "x", "Fulano", "cidade", "PREFEITURA")).toEqual([]);
		}
		expect(aviso).toHaveBeenCalledWith("[TCE-MG] Fonte aposentada (TCE-MG: CKAN sem resource_id, falha de rede); despesas do município por TCE não consultadas. Os contratos da prefeitura vêm do PNCP.");
		expect(aviso).toHaveBeenCalledTimes(5);
		aviso.mockRestore();
	});
});
