import { describe, expect, it, vi } from "vitest";
import {
	BASE_CLDF,
	despesasCldfParaOPipe,
	lancamentoParaDespesa,
	lancamentosDoDeputado,
	recursosPorAno,
	valorCldf,
} from "../../src/services/integrations/assembleias/cldf";
import { despesasDaAssembleia } from "../../src/services/integrations/assembleias/despesas";

const CPF = "52998224725";
const RECURSOS = [
	{ id: "r2026", name: "Verbas Indenizatorias - 2026 (Até Agosto)", datastore_active: true, last_modified: "2026-09-22T19:07:50" },
	{ id: "r2025", name: "Verbas Indenizatorias - 2025", datastore_active: true, last_modified: "2026-09-14T20:18:58" },
	{ id: "r2024-maio", name: "Verbas Indenizatorias - 2024 (Até maio)", datastore_active: true, last_modified: "2024-08-14T19:21:05" },
	{ id: "r2024", name: "Verbas Indenizatorias - 2024", datastore_active: true, last_modified: "2025-03-24T21:05:20" },
	{ id: "r2021-sem", name: "Verbas Indenizatorias - 2021", datastore_active: false, last_modified: "2024-08-14T12:24:19" },
];
const lanc = (nome: string, cpf: string, valor: string, extra: Record<string, unknown> = {}) => ({
	NOME_PARLAMENTAR: nome, CPF_PARLAMENTAR: cpf, NOME_PRESTADOR: "ELDORADO FROTAS LTDA", CNPJ_PRESTADOR: "41.685.059/0001-48", CPF_PRESTADOR: "",
	NR_COMPROVANTE: "2533574", DATA_COMPROVANTE: "2026-01-02 00:00:00", VALOR_DESPESA: valor, CLASSIFICACAO: "Locação de veículo", ...extra,
});

describe("CLDF — verba indenizatória (CKAN)", () => {
	it("um recurso por ano (o mais atualizado, com datastore), os 2 anos mais recentes", () => {
		expect(recursosPorAno(RECURSOS)).toEqual([{ ano: 2026, id: "r2026" }, { ano: 2025, id: "r2025" }]);
		expect(recursosPorAno(RECURSOS, 3)[2]).toEqual({ ano: 2024, id: "r2024" });
	});

	it("valor em texto nos dois formatos; lançamento vira despesa do pipe", () => {
		expect([valorCldf("5600.0"), valorCldf("5.600,00"), valorCldf(""), valorCldf("abc")]).toEqual([5600, 5600, 0, 0]);
		expect(lancamentoParaDespesa(lanc("X", CPF, "5600.0"))).toEqual({
			cnpjCpfFornecedor: "41685059000148", nomeFornecedor: "ELDORADO FROTAS LTDA", tipoDespesa: "Locação de veículo",
			valorDocumento: 5600, dataDocumento: "2026-01-02", numeroDocumento: "2533574",
			urlDocumento: "https://dados.cl.df.gov.br/dataset/verbas-indenizatorias", fonte: "CLDF",
		});
	});

	it("acha o deputado pelo CPF (o nome na planilha varia); sem CPF, pelo nome sem o 'Deputado'; ambíguo = ninguém", () => {
		const lista = [
			lanc("Jane Klébia do Nascimento da Silva", "529.982.247-25", "10"),
			lanc("Deputado Robério Negreiros", "111.444.777-35", "20"),
			lanc("Deputado Fulano Silva", "000.000.001-91", "30"),
			lanc("Deputada Fulana Silva", "000.000.002-72", "40"),
		];
		expect(lancamentosDoDeputado(lista, CPF, "JANE KLEBIA")).toMatchObject({ por: "CPF", nomeNaCasa: "Jane Klébia do Nascimento da Silva", lancamentos: [{ VALOR_DESPESA: "10" }] });
		expect(lancamentosDoDeputado(lista, null, "ROBÉRIO NEGREIROS")).toMatchObject({ por: "nome", nomeNaCasa: "Deputado Robério Negreiros" });
		expect(lancamentosDoDeputado(lista, null, "SILVA")).toBeNull();
	});

	it("no pipe: lê os 2 anos, registra no log quantos lançamentos e como achou o deputado", async () => {
		const urls: string[] = [];
		const obter = vi.fn(async (url: string) => {
			urls.push(url);
			if (url.includes("package_show")) return { result: { resources: RECURSOS } };
			const ano = url.includes("r2026") ? "2026" : "2025";
			return { result: { records: [lanc("Jane Klébia", CPF, ano === "2026" ? "100.0" : "900.0", { DATA_COMPROVANTE: `${ano}-03-01 00:00:00` }), lanc("Outro", "11144477735", "50.0")] } };
		});
		const eventos: { tipo: string; payload: any }[] = [];
		const r = await despesasCldfParaOPipe({ nome: "JANE KLEBIA", cpf: CPF }, (tipo, payload) => eventos.push({ tipo, payload }), obter as never);
		expect(urls).toContain(`${BASE_CLDF}/datastore_search?resource_id=r2026&limit=10000`);
		expect(r.map((d) => d.valorDocumento)).toEqual([900, 100]);
		expect(eventos).toEqual([
			{ tipo: "STATUS", payload: { msg: "[CLDF] 2 lançamento(s) de verba indenizatória de Jane Klébia em 2026 e 2025 (dados abertos da CLDF; deputado achado pelo CPF)." } },
			{ tipo: "ETAPA", payload: { fonte: "casa", estado: "concluida", origem: "Câmara Legislativa do DF", detalhe: "2 gastos da verba indenizatória (2026 e 2025)" } },
		]);
	});

	it("portal fora do ar e deputado sem lançamento: cada caso com sua linha no log", async () => {
		const msgs: string[] = [];
		const etapas: any[] = [];
		const status = (t: string, p: any) => (t === "ETAPA" ? etapas.push(p) : msgs.push(p.msg));
		expect(await despesasCldfParaOPipe({ nome: "X" }, status, (async () => null) as never)).toEqual([]);
		expect(msgs.at(-1)).toBe("[CLDF] Dados abertos da Câmara Legislativa indisponíveis; verba indenizatória não consultada.");
		const vazio = vi.fn(async (url: string) => (url.includes("package_show") ? { result: { resources: RECURSOS } } : { result: { records: [] } }));
		expect(await despesasCldfParaOPipe({ nome: "FÁBIO FELIX", cpf: CPF }, status, vazio as never)).toEqual([]);
		expect(msgs.at(-1)).toBe("[CLDF] Nenhum lançamento de verba indenizatória de FÁBIO FELIX em 2026 e 2025 (procurado pelo CPF e pelo nome).");
		expect(etapas).toEqual([{ fonte: "casa", estado: "vazia", origem: "Câmara Legislativa do DF", detalhe: "nenhum gasto de verba indenizatória em 2026 e 2025" }]);
	});

	it("o roteador de assembleias passa o CPF para a fonte do DF; nome sozinho continua aceito", async () => {
		const fonte = vi.fn(async () => [{ valorDocumento: 1 }]);
		expect(await despesasDaAssembleia("df", { nome: "X", cpf: CPF }, () => {}, { DF: fonte })).toHaveLength(1);
		expect(fonte).toHaveBeenCalledWith({ nome: "X", cpf: CPF }, expect.any(Function));
		await despesasDaAssembleia("DF", "Y", () => {}, { DF: fonte });
		expect(fonte).toHaveBeenLastCalledWith({ nome: "Y" }, expect.any(Function));
	});
});
