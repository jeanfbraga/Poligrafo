/* ==========================================================================
   Dossiê exportado — fichas detalhadas, uma por registro.
   Ficha = tabela de uma célula com filete na cor do nível de risco, para
   não quebrar entre páginas e ler bem impressa em preto e branco.
   ========================================================================== */
import { ExternalHyperlink, Paragraph, type ParagraphChild, Table, TableCell, TableLayoutType, TableRow, type TextRun, WidthType } from "docx";
import type { CampoCard, ModeloCard } from "@/components/nodes/card-model";
import { blocoTexto, COR, espaco, LARGURA_UTIL, linha, mono, paragrafo, plural, RISCO_DOC, rotulo, SEM_BORDA, selo, subtitulo, texto, tituloSecao } from "./estilo";
import type { Achado, Categoria, ModeloDossie } from "./modelo";

const MARGEM_FICHA = 240;
const LARGURA_ROTULO_CAMPO = 2200;

/** "www.camara.leg.br/..." → "camara.leg.br" (texto curto para o link na ficha). */
export function dominio(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url.slice(0, 40);
	}
}

export const refFonte = (a: Achado, i: number) => `${a.id}.${i + 1}`;

function cabecalhoFicha(a: Achado): Paragraph {
	const { card } = a;
	const nota = card.score === null ? [] : [mono(`  ·  NOTA ${card.score}/100`, { size: 15, color: COR.SUAVE })];
	return new Paragraph({
		spacing: { after: 80 },
		children: [
			mono(a.id, { bold: true, size: 18, color: COR.ACENTO }),
			texto("   "),
			selo(card.risco),
			mono(`   ${card.tag.toUpperCase()}`, { size: 15, color: COR.SUAVE, characterSpacing: 16 }),
			...nota,
		],
	});
}

export interface CampoFicha {
	label: string;
	value: string;
	/** Valor-chave do card (em negrito, primeira linha). */
	destaque?: boolean;
}

/** Valor-chave + campos do card, sem repetir o que já foi dito. */
export function camposDaFicha(card: ModeloCard): CampoFicha[] {
	const { chave } = card;
	const campos: CampoFicha[] = chave.valor && chave.valor !== "—" ? [{ label: chave.label, value: chave.valor, destaque: true }] : [];
	const valores = new Set(card.campos.map((c) => c.value));
	if (chave.dica && chave.dica !== "Data indisponível" && !valores.has(chave.dica)) campos.push({ label: "Detalhe", value: chave.dica });
	const extras = card.campos.filter((c: CampoCard) => c.label !== chave.label).map(({ label, value }) => ({ label, value }));
	return [...campos, ...extras];
}

/** Campos em grade rótulo/valor (tabela sem bordas: alinha igual em Word, LibreOffice e Google Docs). */
function gradeCampos(campos: CampoFicha[]): Table[] {
	if (campos.length === 0) return [];
	const larguraValor = LARGURA_UTIL - 2 * MARGEM_FICHA - LARGURA_ROTULO_CAMPO;
	const celulaCampo = (children: TextRun[], largura: number) =>
		new TableCell({
			width: { size: largura, type: WidthType.DXA },
			margins: { top: 20, bottom: 20, left: 0, right: 80 },
			children: [new Paragraph({ spacing: { after: 0 }, children })],
		});
	return [
		new Table({
			width: { size: LARGURA_ROTULO_CAMPO + larguraValor, type: WidthType.DXA },
			columnWidths: [LARGURA_ROTULO_CAMPO, larguraValor],
			layout: TableLayoutType.FIXED,
			borders: { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA, insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA },
			rows: campos.map(
				(c) =>
					new TableRow({
						cantSplit: true,
						children: [celulaCampo([rotulo(c.label)], LARGURA_ROTULO_CAMPO), celulaCampo([texto(c.value, { bold: c.destaque })], larguraValor)],
					}),
			),
		}),
	];
}

function blocosAnalise(a: Achado): Paragraph[] {
	const { card } = a;
	const regra = card.regra
		? `Classificado como crítico por regra objetiva (${card.regra}), independentemente da nota da análise automatizada.`
		: "";
	const blocos: [string, string][] = [
		["Análise automatizada", a.analise],
		["Critério de classificação", regra],
		["Fundamentação técnica", a.fundamentacao],
		["Enquadramento normativo", a.enquadramento],
	];
	return blocos.filter(([, corpo]) => corpo).flatMap(([titulo, corpo]) => blocoTexto(titulo, corpo));
}

function linksDaFicha(a: Achado): ParagraphChild[] {
	return a.fontes.flatMap((url, i) => [
		texto("   "),
		new ExternalHyperlink({
			link: url,
			children: [mono(`[${refFonte(a, i)}] ${dominio(url)}`, { size: 15, color: COR.LINK, underline: {} })],
		}),
	]);
}

function rodapeFicha(a: Achado): Paragraph {
	const base = a.card.fonte || "Não informada";
	return new Paragraph({
		border: { top: linha() },
		spacing: { before: 140, after: 0 },
		children: [rotulo("Fonte"), texto(`  ${base}`, { size: 17, color: COR.SUAVE }), ...linksDaFicha(a)],
	});
}

export function ficha(a: Achado): Table {
	const { card } = a;
	const sub = card.sub && card.sub.toUpperCase() !== card.tag.toUpperCase() ? card.sub : "";
	const corpo: (Paragraph | Table)[] = [
		cabecalhoFicha(a),
		new Paragraph({ spacing: { after: 20 }, children: [texto(card.titulo, { size: 26, bold: true })] }),
		...(sub ? [paragrafo([texto(sub, { size: 19, color: COR.SUAVE })], { after: 100 })] : [espaco(60)]),
		...gradeCampos(camposDaFicha(card)),
		...blocosAnalise(a),
		rodapeFicha(a),
	];
	return new Table({
		width: { size: LARGURA_UTIL, type: WidthType.DXA },
		columnWidths: [LARGURA_UTIL],
		layout: TableLayoutType.FIXED,
		borders: {
			top: linha(),
			bottom: linha(),
			right: linha(),
			left: linha(RISCO_DOC[card.risco].cor, 24),
			insideHorizontal: SEM_BORDA,
			insideVertical: SEM_BORDA,
		},
		rows: [
			new TableRow({
				cantSplit: true,
				children: [new TableCell({ margins: { top: 160, bottom: 160, left: MARGEM_FICHA, right: MARGEM_FICHA }, children: corpo })],
			}),
		],
	});
}

function resumoCategoria(c: Categoria): string {
	const partes = [plural(c.achados.length, "registro", "registros")];
	if (c.criticos) partes.push(plural(c.criticos, "crítico", "críticos"));
	if (c.atencao) partes.push(`${c.atencao} de atenção`);
	return partes.join(" · ").toUpperCase();
}

export function secaoAchados(m: ModeloDossie, numero: number): (Paragraph | Table)[] | null {
	if (m.achados.length === 0) return null;
	return [
		...tituloSecao(numero, "Registros detalhados", true),
		paragrafo(
			[
				texto(
					"Fichas agrupadas por categoria, da mais grave para a menos grave. O filete à esquerda indica o nível: " +
						"vermelho para crítico, âmbar para atenção e cinza para contratos listados como contexto.",
					{ color: COR.SUAVE },
				),
			],
			{ after: 120 },
		),
		...m.categorias.flatMap((c) => [subtitulo(c.nome, resumoCategoria(c)), ...c.achados.flatMap((a) => [ficha(a), espaco(200)])]),
	];
}
