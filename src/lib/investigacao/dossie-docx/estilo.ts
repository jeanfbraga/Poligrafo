/* ==========================================================================
   Dossiê exportado — tokens visuais e blocos básicos do docx.
   Paleta "Terminal Fósforo" adaptada para papel: o verde fósforo da tela
   (#3dff8b) não tem contraste em fundo branco, então o acento vira um verde
   escuro; vermelho/âmbar seguem a semântica de risco do app.
   ========================================================================== */
import {
	AlignmentType,
	BorderStyle,
	type IBorderOptions,
	type IRunOptions,
	type ParagraphChild,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableLayoutType,
	TableRow,
	TextRun,
	WidthType,
} from "docx";
import type { Risco } from "../risco";

export const COR = {
	TINTA: "13201A",
	SUAVE: "5E6E65",
	LINHA: "D3DDD7",
	FUNDO: "F3F7F4",
	ACENTO: "0A7A3D",
	LINK: "0B5CAD",
	BRANCO: "FFFFFF",
} as const;

export const FONTE = { TEXTO: "Calibri", MONO: "Consolas" } as const;

/** A4 retrato com margens de 2 cm. */
export const PAGINA = { LARGURA: 11906, ALTURA: 16838, MARGEM: 1134 } as const;
export const LARGURA_UTIL = PAGINA.LARGURA - 2 * PAGINA.MARGEM;

export const RISCO_DOC: Record<Risco, { rotulo: string; cor: string; fundo: string }> = {
	crit: { rotulo: "CRÍTICO", cor: "B42318", fundo: "FDECEA" },
	warn: { rotulo: "ATENÇÃO", cor: "A15C00", fundo: "FFF4DE" },
	ok: { rotulo: "CONTEXTO", cor: "4A5A51", fundo: "EEF2EF" },
};

type OpcoesRun = Omit<IRunOptions, "text" | "children">;

export const texto = (text: string, o: OpcoesRun = {}) => new TextRun({ text, ...o });
export const mono = (text: string, o: OpcoesRun = {}) => new TextRun({ text, font: FONTE.MONO, ...o });

/** Rótulo em caixa alta, monoespaçado e espaçado (a "sobrancelha" do Terminal Fósforo). */
export const rotulo = (text: string, cor: string = COR.SUAVE) =>
	mono(text.toUpperCase(), { size: 15, color: cor, characterSpacing: 16 });

export const preenchimento = (fill: string) => ({ type: ShadingType.CLEAR, fill, color: "auto" });

/** Selo de nível de risco: texto branco sobre a cor do nível. */
export const selo = (r: Risco) =>
	mono(` ${RISCO_DOC[r].rotulo} `, { bold: true, size: 15, color: COR.BRANCO, shading: preenchimento(RISCO_DOC[r].cor) });

export const linha = (cor: string = COR.LINHA, size = 4): IBorderOptions => ({ style: BorderStyle.SINGLE, size, color: cor });
/** "nil" (e não "none"): alguns leitores de docx ignoram "none" e desenham a grade padrão. */
export const SEM_BORDA: IBorderOptions = { style: BorderStyle.NIL };

export const espaco = (after: number) => new Paragraph({ spacing: { before: 0, after }, children: [] });

export const paragrafo = (children: TextRun[], o: { after?: number; alinhar?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
	new Paragraph({ children, spacing: { after: o.after ?? 120 }, alignment: o.alinhar });

/** Rótulo + texto corrido (blocos da ficha e da metodologia). */
export function blocoTexto(titulo: string, corpo: string): Paragraph[] {
	return [
		new Paragraph({ keepNext: true, spacing: { before: 120, after: 40 }, children: [rotulo(titulo)] }),
		new Paragraph({ spacing: { after: 60 }, children: [texto(corpo)] }),
	];
}

/* ---- tabela de dados (cabeçalho repetido, linhas que não quebram) ---- */

export interface Coluna {
	titulo: string;
	largura: number;
	direita?: boolean;
}

const celula = (runs: ParagraphChild[], col: Coluna, fill?: string) =>
	new TableCell({
		width: { size: col.largura, type: WidthType.DXA },
		margins: { top: 70, bottom: 70, left: 100, right: 100 },
		shading: fill ? preenchimento(fill) : undefined,
		children: [new Paragraph({ children: runs, alignment: col.direita ? AlignmentType.RIGHT : AlignmentType.LEFT })],
	});

export function tabelaDados(colunas: Coluna[], linhas: ParagraphChild[][][]): Table {
	const cabecalho = new TableRow({
		tableHeader: true,
		cantSplit: true,
		children: colunas.map((c) => celula([rotulo(c.titulo, COR.TINTA)], c, COR.FUNDO)),
	});
	const corpo = linhas.map((l) => new TableRow({ cantSplit: true, children: l.map((runs, i) => celula(runs, colunas[i])) }));
	return new Table({
		width: { size: LARGURA_UTIL, type: WidthType.DXA },
		columnWidths: colunas.map((c) => c.largura),
		layout: TableLayoutType.FIXED,
		rows: [cabecalho, ...corpo],
		borders: {
			top: linha(COR.TINTA, 8),
			bottom: linha(COR.TINTA, 8),
			left: SEM_BORDA,
			right: SEM_BORDA,
			insideHorizontal: linha(),
			insideVertical: SEM_BORDA,
		},
	});
}

/** Abertura de seção: sobrancelha numerada + título (Heading 1, aparece no painel de navegação do Word). */
export function tituloSecao(numero: number, titulo: string, novaPagina: boolean, antes = novaPagina ? 0 : 560): Paragraph[] {
	return [
		new Paragraph({
			pageBreakBefore: novaPagina,
			keepNext: true,
			spacing: { before: antes, after: 40 },
			children: [rotulo(`Seção ${String(numero).padStart(2, "0")}`, COR.ACENTO)],
		}),
		new Paragraph({
			heading: "Heading1",
			border: { bottom: linha(COR.TINTA, 8) },
			children: [texto(titulo)],
		}),
	];
}

export const subtitulo = (titulo: string, detalhe?: string) =>
	new Paragraph({
		heading: "Heading2",
		children: detalhe ? [texto(titulo), mono(`  ${detalhe}`, { size: 16, color: COR.SUAVE, bold: false })] : [texto(titulo)],
	});

export const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;
