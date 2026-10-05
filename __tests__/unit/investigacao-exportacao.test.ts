import { describe, expect, it } from "vitest";
import type { DossieNode } from "@/lib/investigacao/dossie-state";
import { fontesDoAchado, montarPayloadExportacao, montarShareData, nomeArquivoDossie } from "@/lib/investigacao/exportacao";

const no = (id: string, type: string, data: Record<string, unknown>): DossieNode => ({ id, type, position: { x: 0, y: 0 }, data });

const nodes = [
	no("p", "PESSOA", { label: "ALICE RIBEIRO", cargo: "DEPUTADO FEDERAL", uf: "RJ", urlFoto: "http://x/f.jpg" }),
	no("d1", "DESPESA", { label: "Gráfica", score_letalidade: 90, urlDocumento: "https://x/nota.pdf" }),
	no("d2", "DESPESA", { label: "Posto", score_letalidade: 20 }),
	no("c1", "CONTRATO", { label: "Pregão", numeroControlePNCP: "123", score_letalidade: 10 }),
];
const evidencias = [no("e1", "DESPESA", { label: "Táxi", score_letalidade: 65, link: "http://x/taxi" })];

describe("montarPayloadExportacao", () => {
	const p = montarPayloadExportacao(nodes, evidencias, "busca");

	it("canvas visível entra sempre (despesa de nota baixa incluída); rail só com alerta", () => {
		expect(p.despesasCriticas.map((d) => d.label)).toEqual(["Gráfica", "Táxi", "Posto", "Pregão"]);
		const rail = [no("e2", "DESPESA", { label: "Café", score_letalidade: 10 })];
		expect(montarPayloadExportacao([], rail, "").despesasCriticas).toEqual([]);
	});

	it("oculto no canvas (emenda recolhida no hub) só entra com alerta; nós de navegação nunca", () => {
		const canvas = [
			{ ...no("em1", "EMENDA", { label: "Emenda ok", score_letalidade: 10 }), hidden: true },
			{ ...no("em2", "EMENDA", { label: "Emenda alerta", score_letalidade: 70 }), hidden: true },
			no("rx", "RESUMO_GASTOS", { label: "Raio-X de Gastos", valor: 1000 }),
			no("at", "ATIVIDADE_PARLAMENTAR", { label: "Atividade" }),
		];
		expect(montarPayloadExportacao(canvas, [], "").despesasCriticas.map((d) => d.label)).toEqual(["Emenda alerta"]);
	});

	it("usa a régua do app: crítico por regra entra mesmo com nota baixa; a pessoa nunca entra", () => {
		const comRegra = [
			...nodes,
			no("em", "EMENDA", { label: "Emenda fantasma", score_letalidade: 20, isFantasma: true }),
			no("pj", "PROCESSO_JUDICIAL", { label: "Ação", score_letalidade: 0 }),
		];
		const labels = montarPayloadExportacao(comRegra, [], "").despesasCriticas.map((d) => d.label);
		expect(labels).toEqual(expect.arrayContaining(["Emenda fantasma", "Ação"]));
		expect(labels).not.toContain("ALICE RIBEIRO");
	});

	it("leva a identificação da pessoa para a capa", () => {
		expect(p.politico).toEqual({ nome: "ALICE RIBEIRO", cargo: "DEPUTADO FEDERAL", partido: undefined, uf: "RJ" });
	});

	it("ordena por score decrescente", () => {
		const scores = p.despesasCriticas.map((d) => d.score_letalidade);
		expect(scores).toEqual([...scores].sort((a, b) => b - a));
	});

	it("coleta URLs http de documento, link e PNCP", () => {
		expect(p.urlsNotasFiscais).toEqual(
			expect.arrayContaining(["https://x/nota.pdf", "http://x/taxi", "https://pncp.gov.br/app/contratos?q=123"]),
		);
		expect(p.urlsNotasFiscais.every((u) => u.startsWith("http"))).toBe(true);
	});

	it("usa o nome da pessoa; sem ela, o termo buscado; sem nada, Desconhecido", () => {
		expect(p.nomePolitico).toBe("ALICE RIBEIRO");
		expect(montarPayloadExportacao([], [], "Fulano").nomePolitico).toBe("Fulano");
		expect(montarPayloadExportacao([], [], "").nomePolitico).toBe("Desconhecido");
	});

	it("nomeArquivoDossie: ASCII, underscore no lugar de espaço e data", () => {
		const dia = new Date(2026, 9, 5, 12);
		expect(nomeArquivoDossie("Alice Ribeiro", dia)).toBe("dossie-Alice_Ribeiro-2026-10-05.docx");
		expect(nomeArquivoDossie("João D'Ávila", dia)).toBe("dossie-Joao_DAvila-2026-10-05.docx");
		expect(nomeArquivoDossie("  ", dia)).toBe("dossie-sem_nome-2026-10-05.docx");
	});
});

describe("fontesDoAchado", () => {
	it("junta documento, link e PNCP, só http(s) e sem repetir", () => {
		expect(
			fontesDoAchado({ urlDocumento: "https://a", url_documento: "https://a", link: "javascript:alert(1)", numeroControlePNCP: "1/2" }),
		).toEqual(["https://a", "https://pncp.gov.br/app/contratos?q=1%2F2"]);
	});
});

describe("montarShareData", () => {
	it("monta o card com dados da pessoa e do achado", () => {
		const s = montarShareData(nodes[0], { label: "Gráfica", valor: 48900, score_letalidade: 91, dataDocumento: "2025-03-12", motivo_ia: "Suspeito", urlDocumento: "https://x/n.pdf" }, "DESPESA");
		expect(s).toMatchObject({
			politicoNome: "ALICE RIBEIRO",
			politicoCargo: "DEPUTADO FEDERAL",
			politicoUf: "RJ",
			politicoFoto: "http://x/f.jpg",
			achadoTipo: "DESPESA",
			achadoValor: 48900,
			achadoTitulo: "Gráfica",
			achadoScore: 91,
			achadoMotivo: "Suspeito",
			achadoFonteUrl: "https://x/n.pdf",
		});
	});

	it("usa _empenhado quando não há valor; sem pessoa cai nos padrões", () => {
		expect(montarShareData(undefined, { _empenhado: 10, label: "E" }, "EMENDA")).toMatchObject({
			politicoNome: "Desconhecido",
			politicoCargo: "Político",
			politicoUf: "BR",
			achadoValor: 10,
		});
	});

	it("achado sem valor nem título usa o objeto ou o texto padrão", () => {
		expect(montarShareData(undefined, { objeto: "Obra" }, "X").achadoTitulo).toBe("Obra");
		expect(montarShareData(undefined, {}, "X")).toMatchObject({ achadoTitulo: "Registro encontrado", achadoValor: undefined });
	});
});
