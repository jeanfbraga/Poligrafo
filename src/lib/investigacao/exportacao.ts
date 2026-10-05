/* ==========================================================================
   Exportação e compartilhamento do Dossiê — montagem pura dos payloads.
   Extraído do antigo page.tsx (handleExportDossie / handleShareClick).
   ========================================================================== */
import type { ShareData } from "@/components/shared/ShareDialog";
import type { DossieNode } from "./dossie-state";
import { riscoDoNo, scoreDoNo } from "./risco";

type Dados = Record<string, any>;

/** Identificação da pessoa analisada (capa e cabeçalho do documento). */
export interface IdentificacaoPolitico {
	nome: string;
	cargo?: string;
	partido?: string;
	uf?: string;
}

export interface PayloadExportacao {
	nomePolitico: string;
	politico?: IdentificacaoPolitico;
	despesasCriticas: Dados[];
	urlsNotasFiscais: string[];
}

/** Mesma régua do app (atenção/crítico, inclusive por regra) + todo contrato, como contexto. */
function ehRelevante(n: DossieNode): boolean {
	if (n.type === "PESSOA") return false;
	return n.type === "CONTRATO" || riscoDoNo(String(n.type), n.data) !== "ok";
}

/** URLs http(s) de documento comprobatório de um achado, sem repetição. */
export function fontesDoAchado(d: Dados): string[] {
	const links = [d?.urlDocumento, d?.url_documento, d?.link_documento, d?.link];
	if (d?.numeroControlePNCP) {
		links.push(`https://pncp.gov.br/app/contratos?q=${encodeURIComponent(d.numeroControlePNCP)}`);
	}
	const validas = links.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u));
	return [...new Set(validas)];
}

const textoOuNada = (v: unknown): string | undefined => (v ? String(v) : undefined);

function identificacaoDoDossie(pessoa: DossieNode | undefined, nome: string): IdentificacaoPolitico {
	const p = (pessoa?.data ?? {}) as Dados;
	return {
		nome,
		cargo: textoOuNada(p.cargo),
		partido: textoOuNada(p.partido ?? p.siglaPartido),
		uf: textoOuNada(p.uf),
	};
}

/** Achados de atenção/crítico + todos os contratos, ordenados por score. */
export function montarPayloadExportacao(
	nodes: DossieNode[],
	evidencias: DossieNode[],
	nomeBusca: string,
): PayloadExportacao {
	const entidades = [...nodes.filter(ehRelevante), ...evidencias.filter(ehRelevante)]
		.map((n) => ({ ...n.data, type: n.type }) as Dados)
		.sort((a, b) => scoreDoNo(b) - scoreDoNo(a));
	const pessoa = nodes.find((n) => n.type === "PESSOA");
	const nome = String(pessoa?.data?.label || nomeBusca || "Desconhecido");
	return {
		nomePolitico: nome,
		politico: identificacaoDoDossie(pessoa, nome),
		despesasCriticas: entidades,
		urlsNotasFiscais: [...new Set(entidades.flatMap(fontesDoAchado))],
	};
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** "dossie-Joao_da_Silva-2026-10-05.docx" — só ASCII, seguro para header e sistema de arquivos. */
export function nomeArquivoDossie(nomePolitico: string, data: Date = new Date()): string {
	const slug =
		nomePolitico
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.trim()
			.replace(/\s+/g, "_")
			.replace(/[^\w-]/g, "") || "sem_nome";
	const dia = `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
	return `dossie-${slug}-${dia}.docx`;
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
