/* ==========================================================================
   Dossiê exportado — fontes e documentos + metodologia e limitações.
   ========================================================================== */
import { ExternalHyperlink, Paragraph, type ParagraphChild, type Table } from "docx";
import { LIMITE_ATENCAO, LIMITE_CRITICO, type Risco } from "../risco";
import { refFonte } from "./achados";
import { COR, mono, paragrafo, plural, selo, subtitulo, tabelaDados, texto, tituloSecao } from "./estilo";
import type { ModeloDossie } from "./modelo";

type Bloco = Paragraph | Table;

const link = (url: string): ExternalHyperlink =>
	new ExternalHyperlink({ link: url, children: [mono(url, { size: 15, color: COR.LINK, underline: {} })] });

const marcador = (children: ParagraphChild[]) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children });

function tabelaFontes(m: ModeloDossie): Table {
	const linhas = m.achados.flatMap((a) =>
		a.fontes.map((url, i) => [
			[mono(refFonte(a, i), { bold: true, size: 16, color: COR.ACENTO })],
			[texto(a.card.titulo, { size: 18 })],
			[link(url)],
		]),
	);
	return tabelaDados(
		[
			{ titulo: "Ref.", largura: 1200 },
			{ titulo: "Registro", largura: 3000 },
			{ titulo: "Endereço", largura: 5438 },
		],
		linhas,
	);
}

export function secaoFontes(m: ModeloDossie, numero: number): Bloco[] {
	const blocos: Bloco[] = [
		...tituloSecao(numero, "Fontes e documentos", true),
		paragrafo(
			[
				texto(
					"Endereços dos documentos citados nas fichas, para conferência direta na origem. " +
						"A referência (ex.: A-03.1) indica o registro e a ordem do documento dentro dele.",
					{ color: COR.SUAVE },
				),
			],
			{ after: 160 },
		),
	];
	if (m.totais.documentos > 0) blocos.push(tabelaFontes(m));
	else blocos.push(paragrafo([texto("Nenhum documento comprobatório foi vinculado aos registros desta investigação.")]));
	if (m.outrasFontes.length > 0) {
		blocos.push(subtitulo("Outras fontes consultadas"), ...m.outrasFontes.map((u) => marcador([link(u)])));
	}
	return blocos;
}

/* ---- metodologia ---- */

const CRITERIOS: [Risco, string][] = [
	[
		"crit",
		`Nota de risco igual ou superior a ${LIMITE_CRITICO}, ou regra objetiva: emenda fantasma (execução incompatível com o valor ` +
			"empenhado), processo judicial ou sanção, classificação crítica na fonte original ou padrão atípico na rede de relações.",
	],
	["warn", `Nota de risco entre ${LIMITE_ATENCAO} e ${LIMITE_CRITICO - 1}.`],
	["ok", "Contratos listados independentemente da nota, para dar contexto às relações financeiras."],
];

const LIMITACOES = [
	"Homônimos e registros com identificação incompleta podem ser atribuídos à pessoa errada; confira CPF/CNPJ na fonte.",
	"As bases públicas têm atraso de publicação e sofrem correções posteriores; o retrato vale para a data de geração.",
	"A análise automatizada pode errar, omitir contexto ou supervalorizar coincidências. Ela orienta, não conclui.",
	"Valores são nominais, sem correção monetária, e podem incluir registros parciais (ex.: empenhado ≠ pago).",
	"A ausência de um registro neste dossiê não atesta regularidade: indica apenas que ele não atingiu os critérios de seleção.",
];

export function secaoMetodologia(m: ModeloDossie, numero: number): Bloco[] {
	return [
		...tituloSecao(numero, "Metodologia e limitações", false),
		subtitulo("Seleção dos registros"),
		paragrafo([
			texto(
				"Entram no dossiê os registros que o Polígrafo classifica como críticos ou de atenção — a mesma régua usada " +
					"no painel de investigação — e todos os contratos encontrados.",
			),
		]),
		tabelaDados(
			[
				{ titulo: "Nível", largura: 1500 },
				{ titulo: "Critério", largura: 8138 },
			],
			CRITERIOS.map(([r, criterio]) => [[selo(r)], [texto(criterio, { size: 19 })]]),
		),
		subtitulo("Nota de risco"),
		paragrafo([
			texto(
				"Pontuação de 0 a 100 atribuída por análise automatizada (modelo de linguagem) a partir dos dados de cada registro. " +
					"Indica prioridade de verificação, não probabilidade de irregularidade.",
			),
		]),
		subtitulo("Bases consultadas"),
		paragrafo([
			texto(
				m.bases.length > 0
					? `Registros deste dossiê vêm de ${plural(m.bases.length, "base", "bases")}: ${m.bases.join("; ")}.`
					: "Bases públicas governamentais (Câmara dos Deputados, Senado Federal, TSE, Portal da Transparência, Receita Federal, PNCP).",
			),
		]),
		subtitulo("Limitações"),
		...LIMITACOES.map((l) => marcador([texto(l)])),
		new Paragraph({
			spacing: { before: 360 },
			children: [
				texto(
					`Documento gerado automaticamente pelo Polígrafo em ${m.geradoEm} (horário de Brasília), a partir de dados públicos. ` +
						"Não possui caráter acusatório. Cabe a quem o utiliza verificar as fontes oficiais antes de qualquer ação jurídica ou editorial.",
					{ italics: true, size: 17, color: COR.SUAVE },
				),
			],
		}),
	];
}
