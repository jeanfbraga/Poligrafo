import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { camposDaFicha, dominio } from "@/lib/investigacao/dossie-docx/achados";
import { gerarDossieDocx } from "@/lib/investigacao/dossie-docx/documento";
import { dataHoraBrasilia, MAX_DESTAQUES, montarModeloDossie } from "@/lib/investigacao/dossie-docx/modelo";
import type { PayloadExportacao } from "@/lib/investigacao/exportacao";

const AGORA = new Date("2026-10-05T17:32:00Z");

const payload: PayloadExportacao = {
	nomePolitico: "ALICE RIBEIRO",
	politico: { nome: "ALICE RIBEIRO", cargo: "Deputada Federal", partido: "PXX", uf: "RJ" },
	despesasCriticas: [
		{ type: "CONTRATO", label: "Pregão 45/2024", valor: 1000, score_letalidade: 10, numeroControlePNCP: "123" },
		{ type: "DESPESA", label: "Posto", nomeFornecedor: "Posto", tipo: "COMBUSTÍVEIS", valor: 200, score_letalidade: 70, motivo_ia: "Km alto", link: "https://camara.leg.br/n/1" },
		{ type: "DESPESA", label: "Gráfica", nomeFornecedor: "Gráfica", tipo: "DIVULGAÇÃO", valor: 300, score_letalidade: 92, urlDocumento: "https://camara.leg.br/n/2" },
		{ type: "EMENDA", label: "EMENDA 1", _empenhado: 5000, isFantasma: true, percentualExecucao: 3, score_letalidade: 20, motivo_ia: "Execução de 3% após 14 meses." },
		{ type: "EMENDA_RESUMO", label: "Resumo", totalEmpenhado: 5000, score_letalidade: 65 },
		{ type: "SOCIO", label: "Marcos", cargo: "Sócio-administrador", score_letalidade: 61 },
	],
	urlsNotasFiscais: ["https://camara.leg.br/n/1", "https://extra.gov.br/x"],
};

describe("montarModeloDossie", () => {
	const m = montarModeloDossie(payload, AGORA);

	it("ordena categorias pela gravidade e numera os registros na ordem do documento", () => {
		expect(m.categorias.map((c) => c.nome)).toEqual(["Emendas parlamentares", "Despesas", "Pessoas relacionadas", "Contratos e convênios"]);
		expect(m.achados.map((a) => a.id)).toEqual(["A-01", "A-02", "A-03", "A-04", "A-05", "A-06"]);
		expect(m.achados.map((a) => a.card.titulo).slice(2, 4)).toEqual(["Gráfica", "Posto"]);
	});

	it("emenda fantasma é crítica por regra e mantém o texto completo da análise", () => {
		const emenda = m.achados.find((a) => a.card.titulo === "EMENDA 1");
		expect(emenda?.card.risco).toBe("crit");
		expect(emenda?.card.regra).toBe("emenda fantasma");
		expect(emenda?.analise).toBe("Execução de 3% após 14 meses.");
	});

	it("soma só valores financeiros atômicos (resumo de emendas não duplica)", () => {
		expect(m.totais).toMatchObject({ achados: 6, criticos: 2, atencao: 3, contexto: 1, valor: 1000 + 200 + 300 + 5000 });
	});

	it("destaques: só atenção/crítico, mais graves primeiro, no máximo 5", () => {
		expect(m.destaques.length).toBeLessThanOrEqual(MAX_DESTAQUES);
		expect(m.destaques.every((a) => a.card.risco !== "ok")).toBe(true);
		expect(m.destaques[0].card.risco).toBe("crit");
	});

	it("vincula fontes ao registro e separa as avulsas", () => {
		expect(m.totais.documentos).toBe(3);
		expect(m.outrasFontes).toEqual(["https://extra.gov.br/x"]);
	});

	it("identificação aceita só texto vindo da requisição", () => {
		const sujo = montarModeloDossie({ ...payload, politico: { nome: "", cargo: 42 as never, uf: "SP" } }, AGORA);
		expect(sujo.politico).toEqual({ nome: "ALICE RIBEIRO", cargo: undefined, partido: undefined, uf: "SP" });
	});

	it("tolera payload sem entidades ou com lixo", () => {
		const vazio = montarModeloDossie({ nomePolitico: "X", despesasCriticas: [null, 3, "a"] as never, urlsNotasFiscais: [] }, AGORA);
		expect(vazio.totais.achados).toBe(0);
		expect(vazio.categorias).toEqual([]);
	});
});

describe("formatação", () => {
	it("data/hora no fuso de Brasília, independente do fuso do servidor", () => {
		expect(dataHoraBrasilia(AGORA)).toBe("05/10/2026 às 14:32");
	});

	it("dominio encurta a URL para o link da ficha", () => {
		expect(dominio("https://www.camara.leg.br/cota/123.pdf")).toBe("camara.leg.br");
	});

	it("campos da ficha: valor-chave em destaque, sem repetir data já listada", () => {
		const m = montarModeloDossie(payload, AGORA);
		const grafica = m.achados.find((a) => a.card.titulo === "Gráfica");
		const campos = camposDaFicha(grafica!.card);
		expect(campos[0]).toMatchObject({ label: "Valor", destaque: true });
		expect(campos.filter((c) => c.label === "Valor")).toHaveLength(1);
	});
});

describe("gerarDossieDocx", () => {
	async function textoDo(buffer: Buffer, parte = "word/document.xml") {
		const zip = await JSZip.loadAsync(buffer);
		return (await zip.file(parte)?.async("string")) ?? "";
	}

	it("gera as seções, os IDs e o tom neutro", async () => {
		const xml = await textoDo(await gerarDossieDocx(payload, AGORA));
		for (const t of ["Sumário executivo", "Registros detalhados", "Fontes e documentos", "Metodologia e limitações", "A-01", "A-03.1", "Deputada Federal · PXX · RJ"]) {
			expect(xml).toContain(t);
		}
		for (const t of ["ALVO", "letalidade", "CONFIDENCIAL", "FLAGRADAS"]) expect(xml).not.toContain(t);
	});

	it("A4 retrato, tabelas dentro da área útil e cabeçalho repetido", async () => {
		const xml = await textoDo(await gerarDossieDocx(payload, AGORA));
		expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>');
		const larguras = [...xml.matchAll(/<w:tblW w:type="dxa" w:w="(\d+)"\/>/g)].map((r) => Number(r[1]));
		expect(Math.max(...larguras)).toBeLessThanOrEqual(11906 - 2 * 1134);
		expect(xml).toContain("<w:tblHeader/>");
	});

	it("sem registros: omite a seção de fichas e renumera", async () => {
		const xml = await textoDo(await gerarDossieDocx({ nomePolitico: "X", despesasCriticas: [], urlsNotasFiscais: [] }, AGORA));
		expect(xml).not.toContain("Registros detalhados");
		expect(xml).toContain("Seção 02".toUpperCase());
		expect(xml).toContain("Nenhum registro relacionado a X");
	});

	it("rodapé paginado com data de Brasília", async () => {
		const buffer = await gerarDossieDocx(payload, AGORA);
		const zip = await JSZip.loadAsync(buffer);
		const rodapes = await Promise.all(Object.keys(zip.files).filter((f) => /word\/footer\d*\.xml/.test(f)).map((f) => zip.file(f)!.async("string")));
		const rodape = rodapes.join("");
		expect(rodape).toContain("05/10/2026 às 14:32");
		expect(rodape).toContain("NUMPAGES");
	});
});
