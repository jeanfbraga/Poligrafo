/* ==========================================================================
   Dossiê exportado — montagem do .docx.
   Capa (sem cabeçalho) + corpo com cabeçalho/rodapé paginados:
   sumário → registros detalhados → fontes → metodologia.
   ========================================================================== */
import { Document, type IStylesOptions, Packer, PageNumber, Paragraph, SectionType, type Table, TabStopType, TextRun, Footer, Header } from "docx";
import type { PayloadExportacao } from "../exportacao";
import { capa, sumario } from "./abertura";
import { secaoAchados } from "./achados";
import { secaoFontes, secaoMetodologia } from "./apendices";
import { COR, FONTE, LARGURA_UTIL, linha, mono, PAGINA, texto } from "./estilo";
import { type ModeloDossie, montarModeloDossie } from "./modelo";

const ESTILOS: IStylesOptions = {
	default: {
		document: {
			run: { font: FONTE.TEXTO, size: 20, color: COR.TINTA },
			paragraph: { spacing: { after: 80, line: 276 } },
		},
		heading1: {
			run: { font: FONTE.TEXTO, size: 36, bold: true, color: COR.TINTA },
			paragraph: { spacing: { before: 0, after: 280 }, keepNext: true },
		},
		heading2: {
			run: { font: FONTE.TEXTO, size: 24, bold: true, color: COR.ACENTO },
			paragraph: { spacing: { before: 400, after: 140 }, keepNext: true },
		},
	},
};

const PROPRIEDADES_PAGINA = {
	type: SectionType.NEXT_PAGE,
	page: {
		size: { width: PAGINA.LARGURA, height: PAGINA.ALTURA },
		margin: { top: PAGINA.MARGEM, bottom: PAGINA.MARGEM, left: PAGINA.MARGEM, right: PAGINA.MARGEM, header: 560, footer: 560 },
	},
};

const TAB_DIREITA = [{ type: TabStopType.RIGHT, position: LARGURA_UTIL }];

function cabecalho(m: ModeloDossie): Header {
	return new Header({
		children: [
			new Paragraph({
				tabStops: TAB_DIREITA,
				border: { bottom: linha() },
				children: [
					mono("POLÍGRAFO", { bold: true, size: 15, color: COR.ACENTO, characterSpacing: 40 }),
					mono("  ·  DOSSIÊ DE DADOS PÚBLICOS", { size: 15, color: COR.SUAVE }),
					texto(`\t${m.politico.nome}`, { size: 16, bold: true }),
				],
			}),
		],
	});
}

function rodape(m: ModeloDossie): Footer {
	return new Footer({
		children: [
			new Paragraph({
				tabStops: TAB_DIREITA,
				border: { top: linha() },
				children: [
					texto(`Gerado em ${m.geradoEm} · Compilação automatizada de dados públicos — não constitui acusação`, { size: 14, color: COR.SUAVE }),
					new TextRun({
						children: ["\tPágina ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES],
						font: FONTE.MONO,
						size: 14,
						color: COR.SUAVE,
					}),
				],
			}),
		],
	});
}

type Secao = (m: ModeloDossie, numero: number) => (Paragraph | Table)[] | null;

/** Numera só as seções que existem (sem registros, "Registros detalhados" some). */
function corpo(m: ModeloDossie): (Paragraph | Table)[] {
	const secoes: Secao[] = [sumario, secaoAchados, secaoFontes, secaoMetodologia];
	const blocos: (Paragraph | Table)[] = [];
	let numero = 0;
	for (const secao of secoes) {
		const conteudo = secao(m, numero + 1);
		if (!conteudo) continue;
		numero++;
		blocos.push(...conteudo);
	}
	return blocos;
}

export function montarDocumentoDossie(m: ModeloDossie): Document {
	return new Document({
		creator: "Polígrafo",
		title: `Dossiê de dados públicos — ${m.politico.nome}`,
		subject: "Compilação automatizada de dados públicos",
		description: `Gerado em ${m.geradoEm} (horário de Brasília)`,
		styles: ESTILOS,
		sections: [
			{ properties: PROPRIEDADES_PAGINA, children: capa(m) },
			{
				properties: PROPRIEDADES_PAGINA,
				headers: { default: cabecalho(m) },
				footers: { default: rodape(m) },
				children: corpo(m),
			},
		],
	});
}

export async function gerarDossieDocx(payload: PayloadExportacao, agora: Date = new Date()): Promise<Buffer> {
	return Packer.toBuffer(montarDocumentoDossie(montarModeloDossie(payload, agora)));
}
