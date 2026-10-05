/* ==========================================================================
   Dossiê exportado — gráfico da cota mensal contra o teto, em tabela nativa.
   Barra horizontal por mês: verde até o teto, âmbar no que passa dele; o teto
   é um filete tracejado vertical na mesma posição em todas as linhas. Valor e
   situação vêm escritos ao lado (a cor nunca é a única pista; imprime em P&B).
   Tabela em vez de imagem: fica nítida, editável e abre no Word, LibreOffice e Google Docs.
   ========================================================================== */
import { BorderStyle, type IBorderOptions, Paragraph, Table, TableCell, TableLayoutType, TableRow, WidthType } from "docx";
import type { MesDaCota, ResumoDaCota } from "@/lib/cota-mensal";
import { brl, brlCurto } from "@/lib/format";
import { COR, LARGURA_UTIL, linha, mono, preenchimento, RISCO_DOC, rotulo, SEM_BORDA, texto } from "./estilo";

const COL = { MES: 900, BARRA: 5300, GASTO: 1500 } as const;
const COL_SITUACAO = LARGURA_UTIL - COL.MES - COL.BARRA - COL.GASTO;
/** Abaixo disso o segmento some (evita células de largura ~0, que os leitores desenham mal). */
const SEGMENTO_MIN = 20;
const ALTURA_BARRA = 200;

const TETO: IBorderOptions = { style: BorderStyle.DASHED, size: 8, color: COR.TINTA };

interface Segmento {
	largura: number;
	fill?: string;
	/** Este segmento termina exatamente no teto: leva o filete tracejado à direita. */
	marcaTeto?: boolean;
}

/**
 * g = fim do gasto, t = posição do teto (-1 sem teto), em DXA. Quando gasto e teto quase coincidem,
 * a fatia entre eles seria fina demais: o filete vai para a própria barra, para não sumir da linha.
 */
function fatiar(g: number, t: number): Segmento[] {
	if (t < 0) return [{ largura: g, fill: COR.ACENTO }];
	if (g - t >= SEGMENTO_MIN) {
		return [
			{ largura: t, fill: COR.ACENTO, marcaTeto: true },
			{ largura: g - t, fill: RISCO_DOC.warn.cor },
		];
	}
	if (t - g < SEGMENTO_MIN && g >= SEGMENTO_MIN) return [{ largura: Math.max(g, t), fill: COR.ACENTO, marcaTeto: true }];
	return [{ largura: g, fill: COR.ACENTO }, { largura: t - g, marcaTeto: true }];
}

/** Fatias da barra de um mês, em DXA, somando sempre a largura da trilha. */
export function segmentosDoMes(gasto: number, teto: number, escala: number, trilha: number = COL.BARRA): Segmento[] {
	const pos = (v: number) => Math.round((Math.max(0, v) / escala) * trilha);
	const t = teto > 0 ? pos(teto) : -1;
	const g = pos(gasto);
	const usados = fatiar(g, t).filter((s) => s.largura >= SEGMENTO_MIN);
	const resto = trilha - usados.reduce((s, x) => s + x.largura, 0);
	return resto > 0 ? [...usados, { largura: resto }] : usados;
}

function barra(m: MesDaCota, teto: number, escala: number): Table {
	const segs = segmentosDoMes(m.gasto, teto, escala);
	return new Table({
		width: { size: COL.BARRA, type: WidthType.DXA },
		columnWidths: segs.map((s) => s.largura),
		layout: TableLayoutType.FIXED,
		borders: { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA, insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA },
		rows: [
			new TableRow({
				height: { value: ALTURA_BARRA, rule: "exact" },
				children: segs.map(
					(s) =>
						new TableCell({
							width: { size: s.largura, type: WidthType.DXA },
							shading: s.fill ? preenchimento(s.fill) : undefined,
							margins: { top: 0, bottom: 0, left: 0, right: 0 },
							borders: { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: s.marcaTeto ? TETO : SEM_BORDA },
							children: [new Paragraph({ spacing: { after: 0, line: 160 }, children: [] })],
						}),
				),
			}),
		],
	});
}

function situacao(m: MesDaCota, teto: number) {
	if (m.gasto <= 0) return [];
	if (teto > 0 && m.gasto > teto) return [texto(`▲ acima: +${brlCurto(m.gasto - teto)}`, { size: 17, bold: true, color: RISCO_DOC.warn.cor })];
	return [texto("dentro do teto", { size: 17, color: COR.SUAVE })];
}

const celula = (largura: number, children: (Paragraph | Table)[], margemEsquerda = 0) =>
	new TableCell({
		width: { size: largura, type: WidthType.DXA },
		margins: { top: 50, bottom: 50, left: margemEsquerda, right: 60 },
		verticalAlign: "center",
		children,
	});

/** Toda célula precisa terminar em parágrafo; depois da barra (tabela aninhada) ele fica quase sem altura. */
const FECHO_DA_BARRA = () => new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: "exact" }, children: [] });

const MARGEM_SITUACAO = 200;

const p = (runs: ReturnType<typeof texto>[], direita = false) => new Paragraph({ spacing: { after: 0 }, alignment: direita ? "right" : "left", children: runs });

function linhaMes(m: MesDaCota, teto: number, escala: number): TableRow {
	return new TableRow({
		cantSplit: true,
		children: [
			celula(COL.MES, [p([mono(m.name.toUpperCase(), { size: 16, color: COR.SUAVE })])]),
			celula(COL.BARRA, [barra(m, teto, escala), FECHO_DA_BARRA()]),
			celula(COL.GASTO, [p([mono(m.gasto > 0 ? brlCurto(m.gasto) : "—", { size: 17, color: m.gasto > 0 ? COR.TINTA : COR.SUAVE })], true)], 60),
			celula(COL_SITUACAO, [p(situacao(m, teto))], MARGEM_SITUACAO),
		],
	});
}

function cabecalho(teto: number): TableRow {
	return new TableRow({
		tableHeader: true,
		cantSplit: true,
		children: [
			celula(COL.MES, [p([rotulo("Mês")])]),
			celula(COL.BARRA, [p([rotulo("Gasto no mês"), mono(teto > 0 ? `   (- - - teto mensal de ${brl(teto)})` : "", { size: 15, color: COR.SUAVE })])]),
			celula(COL.GASTO, [p([rotulo("Valor")], true)], 60),
			celula(COL_SITUACAO, [p([rotulo("Situação")])], MARGEM_SITUACAO),
		],
	});
}

export function graficoCota(resumo: ResumoDaCota): Table {
	const maior = Math.max(...resumo.dados.map((d) => d.gasto), resumo.teto);
	const escala = maior * 1.05 || 1;
	return new Table({
		width: { size: LARGURA_UTIL, type: WidthType.DXA },
		columnWidths: [COL.MES, COL.BARRA, COL.GASTO, COL_SITUACAO],
		layout: TableLayoutType.FIXED,
		borders: { top: linha(COR.TINTA, 8), bottom: linha(COR.TINTA, 8), left: SEM_BORDA, right: SEM_BORDA, insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA },
		rows: [cabecalho(resumo.teto), ...resumo.dados.map((m) => linhaMes(m, resumo.teto, escala))],
	});
}
