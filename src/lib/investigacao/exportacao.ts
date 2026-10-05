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

/** Nós que só abrem painéis (pessoa, Raio-X, atividade): não têm registro próprio para documentar. */
const SO_NAVEGACAO = new Set(["PESSOA", "RESUMO_GASTOS", "ATIVIDADE_PARLAMENTAR"]);

/** Mesma régua do app (atenção/crítico, inclusive por regra); contrato sempre conta, como contexto. */
function temAlerta(n: DossieNode): boolean {
	return n.type === "CONTRATO" || riscoDoNo(String(n.type), n.data) !== "ok";
}

/**
 * Canvas = curadoria de quem investiga: o que está visível entra sempre (ex.: despesa de nota baixa
 * arrastada do rail). Oculto (emendas recolhidas no hub) só entra com alerta, para não despejar centenas.
 */
function entraDoCanvas(n: DossieNode): boolean {
	if (SO_NAVEGACAO.has(String(n.type))) return false;
	return !n.hidden || temAlerta(n);
}

/** Rail (fora do canvas): só o que tem alerta. */
function entraDoRail(n: DossieNode): boolean {
	return !SO_NAVEGACAO.has(String(n.type)) && temAlerta(n);
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

/** Tudo o que está visível no canvas + o que tem alerta (oculto ou no rail), ordenado por score. */
export function montarPayloadExportacao(
	nodes: DossieNode[],
	evidencias: DossieNode[],
	nomeBusca: string,
): PayloadExportacao {
	const entidades = [...nodes.filter(entraDoCanvas), ...evidencias.filter(entraDoRail)]
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
