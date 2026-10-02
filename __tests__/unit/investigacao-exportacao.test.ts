import { describe, expect, it } from "vitest";
import type { DossieNode } from "@/lib/investigacao/dossie-state";
import { montarPayloadExportacao, montarShareData, nomeArquivoDossie } from "@/lib/investigacao/exportacao";

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

	it("inclui risco ≥ 60 e todos os contratos; exclui o resto", () => {
		expect(p.despesasCriticas.map((d) => d.label)).toEqual(["Gráfica", "Táxi", "Pregão"]);
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

	it("nomeArquivoDossie troca espaços por underscore", () => {
		expect(nomeArquivoDossie("Alice Ribeiro")).toBe("dossie-Alice_Ribeiro.docx");
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
