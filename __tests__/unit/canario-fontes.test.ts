import { describe, expect, it } from "vitest";
import {
	avaliarBuscaPncp,
	avaliarEndpointSuspeito,
	avaliarFiltroFornecedor,
	avaliarPartesDataJud,
	extrairLista,
	linhaMarkdown,
	paginaAntirrobo,
} from "../../scripts/qa/canario/avaliacoes";
import { SONDAS } from "../../scripts/qa/canario/sondas";

describe("canário de fontes — avaliações", () => {
	it("detecta filtro de fornecedor ignorado (caso real do PNCP)", () => {
		const itens = [{ niFornecedor: "06121879000106" }, { niFornecedor: "33000167000101" }];
		const v = avaliarFiltroFornecedor(itens, "33.000.167/0001-01");
		expect(v.estado).toBe("ALERTA");
		expect(v.detalhe).toContain("1 de 2");
	});

	it("aceita filtro de fornecedor respeitado e lista vazia", () => {
		expect(avaliarFiltroFornecedor([{ niFornecedor: "33000167000101" }], "33000167000101").estado).toBe("OK");
		expect(avaliarFiltroFornecedor([], "33000167000101").estado).toBe("OK");
	});

	it("DataJud sem campo partes vira alerta (busca por CPF inútil)", () => {
		expect(avaliarPartesDataJud([{ _source: { numeroProcesso: "1" } }]).estado).toBe("ALERTA");
		expect(avaliarPartesDataJud([{ _source: { partes: [] } }]).estado).toBe("OK");
		expect(avaliarPartesDataJud([]).estado).toBe("FALHA");
	});

	it("endpoint suspeito: 4xx confirma, 2xx desmente, 5xx é falha", () => {
		expect(avaliarEndpointSuspeito(404).estado).toBe("ALERTA");
		expect(avaliarEndpointSuspeito(403).estado).toBe("ALERTA");
		expect(avaliarEndpointSuspeito(200).estado).toBe("OK");
		expect(avaliarEndpointSuspeito(503).estado).toBe("FALHA");
	});

	it("extrai listas dos envelopes reais das APIs", () => {
		expect(extrairLista([1, 2])).toHaveLength(2);
		expect(extrairLista({ dados: [1] })).toHaveLength(1);
		expect(extrairLista({ rows: [1, 2, 3] })).toHaveLength(3); // ALERJ DOCIGP
		expect(extrairLista({ list: [1] })).toHaveLength(1); // ALMG
		expect(extrairLista({ municipios: [1, 2] })).toHaveLength(2); // TCE-RS
		expect(extrairLista({ resposta: { conteudo: [1] } })).toHaveLength(1);
		expect(extrairLista("texto")).toEqual([]);
	});

	it("reconhece página antirrobô no lugar de JSON", () => {
		expect(paginaAntirrobo('<script>window["bobcmn"]="..";/TSPD/</script>')).toBe(true);
		expect(paginaAntirrobo({ items: [] })).toBe(false);
	});

	it("busca do PNCP precisa trazer fornecedor_ni para conferência", () => {
		expect(avaliarBuscaPncp({ items: [{ fornecedor_ni: "1" }] }).estado).toBe("OK");
		expect(avaliarBuscaPncp({ items: [{ title: "x" }] }).estado).toBe("ALERTA");
		expect(avaliarBuscaPncp({ items: [] }).estado).toBe("FALHA");
	});

	it("gera linha de tabela markdown sem quebrar com barra vertical", () => {
		const linha = linhaMarkdown({
			estado: "ALERTA", alcada: "federal", fonte: "PNCP", usadaEm: "x", detalhe: "a | b", ms: 10,
		});
		expect(linha).toContain("⚠️ ALERTA");
		expect(linha).not.toContain("a | b");
	});
});

describe("canário de fontes — catálogo", () => {
	it("ids únicos e cobertura das três alçadas", () => {
		const ids = SONDAS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const alcada of ["federal", "estadual", "municipal"]) {
			expect(SONDAS.some((s) => s.alcada === alcada)).toBe(true);
		}
	});

	it("inclui as sondas que provam o diagnóstico de 06/10/2026", () => {
		const ids = SONDAS.map((s) => s.id);
		for (const id of ["pncp-fornecedor-filtro", "cgu-sancoes-suspeito", "datajud-partes", "compras-legado"]) {
			expect(ids).toContain(id);
		}
	});
});
