/* ==========================================================================
   Dossiê exportado — capa e sumário executivo.
   ========================================================================== */
import { Paragraph, type ParagraphChild, Table, TableCell, TableLayoutType, TableRow, WidthType } from "docx";
import { brl, brlCurto } from "@/lib/format";
import {
	COR,
	espaco,
	LARGURA_UTIL,
	linha,
	mono,
	paragrafo,
	plural,
	preenchimento,
	RISCO_DOC,
	rotulo,
	SEM_BORDA,
	selo,
	subtitulo,
	tabelaDados,
	texto,
	tituloSecao,
} from "./estilo";
import type { Achado, Categoria, ModeloDossie } from "./modelo";

type Bloco = Paragraph | Table;

/* ---- capa ---- */

const LARGURA_ROTULO_CAPA = 2800;

function classificacao(t: ModeloDossie["totais"]): string {
	const partes = [
		t.criticos ? plural(t.criticos, "crítico", "críticos") : "",
		t.atencao ? `${t.atencao} de atenção` : "",
		t.contexto ? `${t.contexto} de contexto` : "",
	].filter(Boolean);
	if (partes.length === 0) return "—";
	return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}

function linhaCapa(rot: string, valor: string): TableRow {
	return new TableRow({
		cantSplit: true,
		children: [
			new TableCell({
				width: { size: LARGURA_ROTULO_CAPA, type: WidthType.DXA },
				margins: { top: 90, bottom: 90, left: 0, right: 120 },
				children: [new Paragraph({ children: [rotulo(rot)] })],
			}),
			new TableCell({
				width: { size: LARGURA_UTIL - LARGURA_ROTULO_CAPA, type: WidthType.DXA },
				margins: { top: 90, bottom: 90, left: 0, right: 0 },
				children: [new Paragraph({ children: [texto(valor)] })],
			}),
		],
	});
}

function fichaTecnica(m: ModeloDossie): Table {
	const t = m.totais;
	const linhas: [string, string][] = [
		["Gerado em", `${m.geradoEm} (horário de Brasília)`],
		["Registros listados", String(t.achados)],
		["Classificação", classificacao(t)],
		["Valor dos registros financeiros", t.valor > 0 ? brl(t.valor) : "—"],
		["Documentos vinculados", String(t.documentos)],
		["Bases consultadas", m.bases.join(", ") || "—"],
	];
	return new Table({
		width: { size: LARGURA_UTIL, type: WidthType.DXA },
		columnWidths: [LARGURA_ROTULO_CAPA, LARGURA_UTIL - LARGURA_ROTULO_CAPA],
		layout: TableLayoutType.FIXED,
		rows: linhas.map(([r, v]) => linhaCapa(r, v)),
		borders: {
			top: linha(COR.TINTA, 8),
			bottom: linha(),
			left: SEM_BORDA,
			right: SEM_BORDA,
			insideHorizontal: linha(),
			insideVertical: SEM_BORDA,
		},
	});
}

/** Caixa de destaque com filete à esquerda (aviso da capa). */
export function caixaNota(titulo: string, corpo: string): Table {
	return new Table({
		width: { size: LARGURA_UTIL, type: WidthType.DXA },
		columnWidths: [LARGURA_UTIL],
		layout: TableLayoutType.FIXED,
		borders: { top: SEM_BORDA, bottom: SEM_BORDA, right: SEM_BORDA, left: linha(COR.ACENTO, 24), insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA },
		rows: [
			new TableRow({
				cantSplit: true,
				children: [
					new TableCell({
						shading: preenchimento(COR.FUNDO),
						margins: { top: 160, bottom: 160, left: 240, right: 240 },
						children: [
							new Paragraph({ spacing: { after: 60 }, children: [texto(titulo, { bold: true })] }),
							new Paragraph({ spacing: { after: 0 }, children: [texto(corpo, { size: 18, color: COR.SUAVE })] }),
						],
					}),
				],
			}),
		],
	});
}

export function capa(m: ModeloDossie): Bloco[] {
	const p = m.politico;
	const sub = [p.cargo, p.partido, p.uf].filter(Boolean).join(" · ");
	return [
		new Paragraph({
			border: { bottom: linha(COR.ACENTO, 18) },
			spacing: { after: 0 },
			children: [mono("POLÍGRAFO", { bold: true, size: 22, color: COR.ACENTO, characterSpacing: 60 })],
		}),
		espaco(2400),
		paragrafo([rotulo("Dossiê de dados públicos", COR.ACENTO)], { after: 160 }),
		new Paragraph({ spacing: { after: 120, line: 240 }, children: [texto(p.nome, { size: 60, bold: true })] }),
		...(sub ? [paragrafo([texto(sub, { size: 24, color: COR.SUAVE })], { after: 0 })] : []),
		espaco(1000),
		fichaTecnica(m),
		espaco(1000),
		caixaNota(
			"Natureza deste documento",
			"Compilação automatizada de registros extraídos de bases públicas oficiais, organizada para apoiar a verificação " +
				"jornalística, acadêmica ou de controle social. Os níveis de risco indicam prioridade de verificação — não são " +
				"conclusão de irregularidade nem acusação. Confira cada registro na fonte original antes de qualquer uso.",
		),
	];
}

/* ---- sumário executivo ---- */

interface Indicador {
	valor: string;
	rotulo: string;
	cor: string;
}

function indicadores(t: ModeloDossie["totais"]): Table {
	const itens: Indicador[] = [
		{ valor: String(t.criticos), rotulo: "Críticos", cor: RISCO_DOC.crit.cor },
		{ valor: String(t.atencao), rotulo: "Atenção", cor: RISCO_DOC.warn.cor },
		{ valor: String(t.achados), rotulo: "Registros", cor: COR.TINTA },
		{ valor: t.valor > 0 ? brlCurto(t.valor) : "—", rotulo: "Valor financeiro", cor: COR.ACENTO },
	];
	const largura = Math.floor(LARGURA_UTIL / itens.length);
	const gap = linha(COR.BRANCO, 36);
	return new Table({
		width: { size: largura * itens.length, type: WidthType.DXA },
		columnWidths: itens.map(() => largura),
		layout: TableLayoutType.FIXED,
		borders: { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA, insideHorizontal: SEM_BORDA, insideVertical: gap },
		rows: [
			new TableRow({
				cantSplit: true,
				children: itens.map(
					(i) =>
						new TableCell({
							width: { size: largura, type: WidthType.DXA },
							shading: preenchimento(COR.FUNDO),
							borders: { top: linha(i.cor, 24) },
							margins: { top: 160, bottom: 160, left: 200, right: 120 },
							children: [
								new Paragraph({ spacing: { after: 20 }, children: [texto(i.valor, { size: 40, bold: true, color: i.cor })] }),
								new Paragraph({ spacing: { after: 0 }, children: [rotulo(i.rotulo)] }),
							],
						}),
				),
			}),
		],
	});
}

function narrativa(m: ModeloDossie): string {
	const t = m.totais;
	const nome = m.politico.nome;
	if (t.achados === 0) {
		return (
			`Nenhum registro relacionado a ${nome} atingiu os critérios de seleção deste dossiê (nível de atenção ou crítico), ` +
			"não há contratos vinculados e nenhum registro foi mantido no canvas. Isso não atesta regularidade: indica apenas " +
			"que as bases consultadas não produziram alertas."
		);
	}
	const valor = t.valor > 0 ? ` Os registros financeiros somam ${brl(t.valor)}.` : "";
	return (
		`Este dossiê reúne ${plural(t.achados, "registro", "registros")} relacionados a ${nome}, em ` +
		`${plural(m.categorias.length, "categoria", "categorias")}. Classificação: ${classificacao(t)}.${valor} ` +
		"Cada registro tem um identificador (A-01, A-02…) usado nas tabelas, nas fichas detalhadas e na lista de fontes."
	);
}

const valorCurto = (a: Achado) => (a.valor === null ? "—" : brlCurto(a.valor));

function tabelaDestaques(destaques: Achado[]): Table {
	return tabelaDados(
		[
			{ titulo: "ID", largura: 900 },
			{ titulo: "Registro", largura: 4338 },
			{ titulo: "Categoria", largura: 2000 },
			{ titulo: "Nível", largura: 1100 },
			{ titulo: "Valor", largura: 1300, direita: true },
		],
		destaques.map((a) => [
			[mono(a.id, { bold: true, size: 17, color: COR.ACENTO })],
			[texto(a.card.titulo, { bold: true, size: 19 })],
			[texto(a.categoria, { size: 18, color: COR.SUAVE })],
			[selo(a.card.risco)],
			[mono(valorCurto(a), { size: 17 })],
		]),
	);
}

function tabelaCategorias(categorias: Categoria[], t: ModeloDossie["totais"]): Table {
	const num = (n: number, o = {}) => [mono(n ? String(n) : "—", { size: 17, ...o })];
	const dinheiro = (v: number, o = {}) => [mono(v > 0 ? brlCurto(v) : "—", { size: 17, ...o })];
	const linhas: ParagraphChild[][][] = categorias.map((c) => [
		[texto(c.nome, { size: 19 })],
		num(c.achados.length),
		num(c.criticos, { color: RISCO_DOC.crit.cor, bold: c.criticos > 0 }),
		num(c.atencao, { color: RISCO_DOC.warn.cor, bold: c.atencao > 0 }),
		dinheiro(c.valor),
	]);
	linhas.push([[texto("Total", { bold: true, size: 19 })], num(t.achados, { bold: true }), num(t.criticos, { bold: true }), num(t.atencao, { bold: true }), dinheiro(t.valor, { bold: true })]);
	return tabelaDados(
		[
			{ titulo: "Categoria", largura: 3838 },
			{ titulo: "Registros", largura: 1300, direita: true },
			{ titulo: "Críticos", largura: 1300, direita: true },
			{ titulo: "Atenção", largura: 1300, direita: true },
			{ titulo: "Valor", largura: 1900, direita: true },
		],
		linhas,
	);
}

export function sumario(m: ModeloDossie, numero: number): Bloco[] {
	const blocos: Bloco[] = [...tituloSecao(numero, "Sumário executivo", false, 0), indicadores(m.totais), espaco(240), paragrafo([texto(narrativa(m))], { after: 120 })];
	if (m.destaques.length > 0) {
		blocos.push(subtitulo("Registros prioritários", `${m.destaques.length} mais graves`), tabelaDestaques(m.destaques));
	}
	if (m.categorias.length > 0) {
		blocos.push(subtitulo("Distribuição por categoria"), tabelaCategorias(m.categorias, m.totais));
	}
	return blocos;
}
