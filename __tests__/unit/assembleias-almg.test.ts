import { describe, expect, it, vi } from "vitest";
import { BASE_ALMG, despesasAlmg, despesasAlmgParaOPipe, notasDoMes, ultimosMeses } from "../../src/services/integrations/assembleias/almg";
import { despesasDaAssembleia } from "../../src/services/integrations/assembleias/despesas";

const MES = {
	list: [
		{
			descTipoDespesa: "Combustível e lubrificante",
			listaDetalheVerba: [
				{ cpfCnpj: "42.927.464/0001-98", nomeEmitente: "Auto Posto do Alemão Ltda.", valorReembolsado: 273.42, valorDespesa: 273.42, dataEmissao: { "@class": "sql-timestamp", $: "2025-03-11" }, descDocumento: "320957", descTipoDespesa: "Combustível e lubrificante" },
			],
		},
		{ descTipoDespesa: "Aluguel", listaDetalheVerba: [{ cpfCnpj: "52998224725", nomeEmitente: "Locador", valorReembolsado: 3000, dataEmissao: { $: "2025-03-05" } }] },
	],
};

describe("ALMG — verba indenizatória", () => {
	it("cada nota vira despesa no formato do pipe, com o link da consulta para conferir", () => {
		const url = `${BASE_ALMG}/prestacao_contas/verbas_indenizatorias/deputados/12193/2025/3?formato=json`;
		expect(notasDoMes(MES, url)[0]).toEqual({
			cnpjCpfFornecedor: "42927464000198", nomeFornecedor: "Auto Posto do Alemão Ltda.", tipoDespesa: "Combustível e lubrificante",
			valorDocumento: 273.42, dataDocumento: "2025-03-11", numeroDocumento: "320957", urlDocumento: url, fonte: "ALMG",
		});
		expect(notasDoMes(null, url)).toEqual([]);
	});

	it("últimos 24 meses, do mais recente ao mais antigo, virando o ano", () => {
		const meses = ultimosMeses(new Date(2026, 1, 15), 3);
		expect(meses).toEqual([{ ano: 2026, mes: 2 }, { ano: 2026, mes: 1 }, { ano: 2025, mes: 12 }]);
	});

	it("consulta mês a mês em grupos e ordena pelo valor", async () => {
		const obter = vi.fn(async (url: string) => (url.includes("/2026/2?") ? MES : null)) as never;
		const r = await despesasAlmg(12193, new Date(2026, 1, 15), obter);
		expect(vi.mocked(obter as any)).toHaveBeenCalledTimes(24);
		expect(r.map((d) => d.valorDocumento)).toEqual([3000, 273.42]);
	});

	it("no pipe: acha o deputado pelo nome, registra no log e limita a 60", async () => {
		const obter = vi.fn(async (url: string) => (url.includes("em_exercicio") ? { list: [{ id: 12193, nome: "Ana Paula Siqueira" }, { id: 1, nome: "Fulano" }] } : MES)) as never;
		const eventos: { tipo: string; payload: any }[] = [];
		const r = await despesasAlmgParaOPipe("ANA PAULA SIQUEIRA DE ARAUJO (Ana Paula Siqueira)", (tipo, payload) => eventos.push({ tipo, payload }), new Date(2026, 9, 7), obter);
		expect(r).toHaveLength(48);
		expect(eventos).toEqual([
			{ tipo: "STATUS", payload: { msg: "[ALMG] 48 nota(s) de verba indenizatória de Ana Paula Siqueira nos últimos 24 meses (dados abertos da ALMG)." } },
			// A lista de fontes da tela recebe o resultado em linguagem simples.
			{ tipo: "ETAPA", payload: { fonte: "casa", estado: "concluida", origem: "Assembleia de Minas Gerais", detalhe: "48 notas da verba indenizatória (24 meses)" } },
		]);
	});

	it("deputado não achado ou ALMG fora do ar: log na tela, nenhuma despesa", async () => {
		const msgs: string[] = [];
		const forasDoAr = vi.fn(async () => null) as never;
		expect(await despesasAlmgParaOPipe("X", (_t, p) => msgs.push(p.msg ?? p.mensagem), new Date(), forasDoAr)).toEqual([]);
		expect(msgs[0]).toBe("[ALMG] Dados abertos da Assembleia de MG indisponíveis; despesas de gabinete não consultadas.");
		const semDeputado = vi.fn(async () => ({ list: [{ id: 1, nome: "Fulano" }] })) as never;
		await despesasAlmgParaOPipe("Ciclano", (_t, p) => msgs.push(p.msg ?? p.mensagem), new Date(), semDeputado);
		expect(msgs[1]).toContain("não foi identificado(a) com segurança na lista de deputados em exercício da ALMG");
	});
});

describe("assembleias por UF", () => {
	it("UF sem fonte aberta: o log diz isso e nada é inventado; falha da fonte vira aviso no console", async () => {
		const msgs: string[] = [];
		expect(await despesasDaAssembleia("GO", "X", (_t, p) => msgs.push(p.msg), {})).toEqual([]);
		expect(msgs).toEqual(["Assembleia Legislativa de GO: sem fonte aberta de despesas de gabinete integrada. Seguindo com as demais fontes."]);
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await despesasDaAssembleia("MG", "X", () => {}, { MG: async () => Promise.reject(new Error("timeout")) })).toEqual([]);
		expect(aviso).toHaveBeenCalledWith("[ASSEMBLEIA MG] Falha nas despesas de gabinete:", expect.objectContaining({ message: "timeout" }));
		aviso.mockRestore();
	});
});
