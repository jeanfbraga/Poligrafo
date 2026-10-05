/* ==========================================================================
   Dossiê exportado — seção "Atuação parlamentar" (deputado federal):
   gabinete, cota parlamentar contra o teto e votos nominais com link do projeto.
   ========================================================================== */
import { ExternalHyperlink, Paragraph, type ParagraphChild, type Table } from "docx";
import type { ResumoDaCota } from "@/lib/cota-mensal";
import { brl } from "@/lib/format";
import { MESES } from "@/lib/cota-mensal";
import { tituloCaso } from "@/lib/texto";
import type { SentidoVoto } from "@/lib/votos";
import { COR, mono, paragrafo, plural, preenchimento, subtitulo, tabelaDados, texto, tituloSecao } from "./estilo";
import { graficoCota } from "./grafico-cota";
import type { ModeloDossie } from "./modelo";
import { PERFIL_INDISPONIVEL, type PerfilDossie, urlPerfilCamara } from "./perfil";

type Bloco = Paragraph | Table;

const link = (url: string, rotuloLink: string, size = 17) =>
	new ExternalHyperlink({ link: url, children: [texto(rotuloLink, { size, color: COR.LINK, underline: {} })] });

const SELO_VOTO: Record<SentidoVoto, { fill?: string; cor: string }> = {
	sim: { fill: COR.ACENTO, cor: COR.BRANCO },
	nao: { fill: COR.TINTA, cor: COR.BRANCO },
	outro: { cor: COR.SUAVE },
};

/** Selo do voto. Vermelho/âmbar ficam reservados para risco: "Não" não é alerta. */
function seloVoto(sentido: SentidoVoto, voto: string) {
	const s = SELO_VOTO[sentido];
	return mono(` ${voto.toUpperCase()} `, { bold: true, size: 15, color: s.cor, shading: s.fill ? preenchimento(s.fill) : undefined });
}

/* ---- gabinete ---- */

function gabinete(p: PerfilDossie): Bloco[] {
	const g = p.gabinete;
	const blocos: Bloco[] = [subtitulo("Gabinete", plural(g.ativos, "servidor ativo", "servidores ativos").toUpperCase())];
	if (g.ativos + g.desligados === 0) {
		return [...blocos, paragrafo([texto("Nenhum servidor de gabinete consta na base da Câmara para este mandato.")])];
	}
	blocos.push(
		paragrafo([
			texto(
				`${plural(g.ativos, "servidor ativo", "servidores ativos")} e ${plural(g.desligados, "já desligado", "já desligados")}, ` +
					`em ${plural(g.periodos, "período de lotação registrado", "períodos de lotação registrados")} pela Câmara.`,
			),
		]),
	);
	if (g.cargos.length > 0) {
		blocos.push(
			tabelaDados(
				[
					{ titulo: "Cargo", largura: 7638 },
					{ titulo: "Ativos", largura: 2000, direita: true },
				],
				g.cargos.map((c) => [[texto(tituloCaso(c.cargo), { size: 19 })], [mono(String(c.quantidade), { size: 17 })]]),
			),
		);
	}
	return blocos;
}

/* ---- cota ---- */

function resumoCota(c: ResumoDaCota): string {
	const acima = c.dados.filter((d) => c.teto > 0 && d.gasto > c.teto).map((d) => MESES[d.mesNum - 1].toLowerCase());
	const base = `Em ${c.ano}, a cota somou ${brl(c.totalGasto)} em ${plural(c.mesesComGasto, "mês", "meses")} com gasto. Teto mensal: ${brl(c.teto)}.`;
	if (acima.length === 0) return `${base} O gasto ficou dentro do teto em todos os meses.`;
	return `${base} O gasto passou do teto em ${plural(acima.length, "mês", "meses")} (${acima.join(", ")}).`;
}

function cota(p: PerfilDossie): Bloco[] {
	const c = p.cota;
	if (!c) return [subtitulo("Cota parlamentar (CEAP)"), paragrafo([texto("Nenhum registro de cota parlamentar foi encontrado na base da Câmara.")])];
	const detalhe = c.situacao === "acima" ? `${plural(c.mesesAcima, "mês", "meses")} acima do teto` : c.situacao === "dentro" ? "dentro do teto" : "sem gastos";
	const titulo = subtitulo(`Cota parlamentar (CEAP) · ${c.ano}`, detalhe.toUpperCase());
	if (c.situacao === "sem-gasto") {
		return [titulo, paragrafo([texto(`Nenhuma despesa de cota consta na base da Câmara para ${c.ano}. Pode ser mandato recente, cota não utilizada ou notas ainda não publicadas.`)])];
	}
	return [
		titulo,
		paragrafo([texto(resumoCota(c))]),
		graficoCota(c),
		paragrafo(
			[
				texto(
					"O teto mensal varia por estado. Pelas regras da CEAP, o saldo não usado em um mês pode ser gasto nos meses seguintes " +
						"do mesmo ano; passar do valor mensal, sozinho, não indica irregularidade.",
					{ size: 17, color: COR.SUAVE, italics: true },
				),
			],
			{ after: 120 },
		),
	];
}

/* ---- votos ---- */

/** "PLP 230/2025 · ementa" e, embaixo, o que foi votado; sem a proposição conhecida, só a votação. */
function celulaProposicao(v: PerfilDossie["votos"]["lista"][number]): ParagraphChild[] {
	if (!v.proposicao) return [texto(v.votado, { size: 18 })];
	const linha1: ParagraphChild[] = [texto(v.proposicao, { size: 18, bold: true })];
	if (v.ementa) linha1.push(texto(` · ${v.ementa}`, { size: 17 }));
	return [...linha1, texto(`Votação: ${v.votado}`, { size: 16, color: COR.SUAVE, break: 1 })];
}

function linhaVoto(v: PerfilDossie["votos"]["lista"][number]): ParagraphChild[][] {
	const projeto = celulaProposicao(v);
	return [
		[mono(v.data, { size: 16 })],
		projeto,
		[seloVoto(v.sentido, v.voto)],
		v.url ? [link(v.url, v.integra ? "Inteiro teor" : "Ficha na Câmara", 16)] : [texto("—", { size: 16, color: COR.SUAVE })],
	];
}

function votos(p: PerfilDossie): Bloco[] {
	const v = p.votos;
	const titulo = subtitulo("Votações em plenário", plural(v.total, "voto", "votos").toUpperCase());
	if (v.total === 0) return [titulo, paragrafo([texto("Nenhum voto nominal em plenário consta na base para este mandato.")])];
	const corte =
		v.total > v.lista.length
			? ` A tabela mostra os ${v.lista.length} mais recentes; a lista completa está no perfil do deputado na Câmara.`
			: "";
	return [
		titulo,
		paragrafo([
			texto(
				`${plural(v.total, "voto nominal", "votos nominais")} na base do Polígrafo: ${v.sim} Sim, ${v.nao} Não e ${v.outros} outros ` +
					`(abstenção, obstrução, artigo 17…).${corte} A base pode não ter o histórico completo; o registro oficial é o da Câmara.`,
			),
		]),
		tabelaDados(
			[
				{ titulo: "Data", largura: 1200 },
				{ titulo: "Proposição", largura: 5338 },
				{ titulo: "Voto", largura: 1300 },
				{ titulo: "Projeto na íntegra", largura: 1800 },
			],
			v.lista.map(linhaVoto),
		),
	];
}

/* ---- seção ---- */

function abertura(idCamara: string): Paragraph {
	return new Paragraph({
		spacing: { after: 120 },
		children: [
			texto("Dados públicos da Câmara dos Deputados sobre o mandato: gabinete, uso da cota parlamentar e votos nominais em plenário. Perfil oficial: ", {
				color: COR.SUAVE,
			}),
			link(urlPerfilCamara(idCamara), urlPerfilCamara(idCamara).replace(/^https:\/\/www\./, ""), 20),
			texto(".", { color: COR.SUAVE }),
		],
	});
}

export function secaoPerfil(m: ModeloDossie, numero: number): Bloco[] | null {
	if (!m.perfil || !m.idCamara) return null;
	const inicio = [...tituloSecao(numero, "Atuação parlamentar", true), abertura(m.idCamara)];
	if (m.perfil === PERFIL_INDISPONIVEL) {
		return [...inicio, paragrafo([texto("Não foi possível consultar a base da Câmara durante a geração deste documento. Consulte o perfil oficial no endereço acima.")])];
	}
	return [...inicio, ...gabinete(m.perfil), ...cota(m.perfil), ...votos(m.perfil)];
}
