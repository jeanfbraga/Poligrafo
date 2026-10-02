/* ==========================================================================
   Exportação e compartilhamento do Dossiê — montagem pura dos payloads.
   Extraído do antigo page.tsx (handleExportDossie / handleShareClick).
   ========================================================================== */
import type { ShareData } from "@/components/shared/ShareDialog";
import type { DossieNode } from "./dossie-state";
import { scoreDoNo } from "./risco";

type Dados = Record<string, any>;

const LIMITE_RISCO = 60;

export interface PayloadExportacao {
	nomePolitico: string;
	despesasCriticas: Dados[];
	urlsNotasFiscais: string[];
}

function ehRelevante(n: DossieNode): boolean {
	return scoreDoNo(n.data) >= LIMITE_RISCO || n.type === "CONTRATO";
}

function linksDe(d: Dados): string[] {
	const links: string[] = [];
	if (d?.urlDocumento) links.push(d.urlDocumento);
	if (d?.link) links.push(d.link);
	if (d?.numeroControlePNCP) {
		links.push(`https://pncp.gov.br/app/contratos?q=${encodeURIComponent(d.numeroControlePNCP)}`);
	}
	return links;
}

/** Entidades de risco (score ≥ 60) + todos os contratos, ordenadas por score. */
export function montarPayloadExportacao(
	nodes: DossieNode[],
	evidencias: DossieNode[],
	nomeBusca: string,
): PayloadExportacao {
	const entidades = [...nodes.filter(ehRelevante), ...evidencias.filter(ehRelevante)]
		.map((n) => ({ ...n.data, type: n.type }) as Dados)
		.sort((a, b) => (b?.score_letalidade || 0) - (a?.score_letalidade || 0));
	const urls = entidades.flatMap(linksDe).filter((u) => String(u).startsWith("http"));
	const pessoa = nodes.find((n) => n.type === "PESSOA");
	return {
		nomePolitico: String(pessoa?.data?.label || nomeBusca || "Desconhecido"),
		despesasCriticas: entidades,
		urlsNotasFiscais: urls,
	};
}

export function nomeArquivoDossie(nomePolitico: string): string {
	return `dossie-${nomePolitico.replace(/\s+/g, "_")}.docx`;
}

function valorDoAchado(d: Dados): number | undefined {
	if (d.valor !== undefined) return Number(d.valor);
	if (d._empenhado !== undefined) return Number(d._empenhado);
	return undefined;
}

const primeiroTexto = (...vs: unknown[]): string | undefined => {
	const v = vs.find((x) => x !== undefined && x !== null && x !== "");
	return v === undefined ? undefined : String(v);
};

function identificacaoDaPessoa(pessoa: DossieNode | undefined) {
	const p = (pessoa?.data ?? {}) as Dados;
	return {
		politicoNome: String(p.label || "Desconhecido"),
		politicoCargo: String(p.cargo || "Político"),
		politicoUf: String(p.uf || "BR"),
		politicoFoto: p.urlFoto || undefined,
	};
}

/** Dados do card de compartilhamento (imagem 9:16) a partir de um achado. */
export function montarShareData(
	pessoa: DossieNode | undefined,
	achado: Dados,
	tipo: string,
): ShareData {
	return {
		...identificacaoDaPessoa(pessoa),
		achadoTipo: tipo,
		achadoValor: valorDoAchado(achado),
		achadoTitulo: primeiroTexto(achado.label, achado.objeto) ?? "Registro encontrado",
		achadoScore: achado.score_letalidade || undefined,
		achadoData: achado.dataDocumento || undefined,
		achadoMotivo: achado.motivo_ia || undefined,
		achadoFonteUrl: primeiroTexto(achado.urlDocumento, achado.url_documento, achado.link_documento),
	};
}
