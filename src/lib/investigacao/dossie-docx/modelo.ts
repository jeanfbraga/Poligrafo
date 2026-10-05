/* ==========================================================================
   Dossiê exportado — modelo puro (payload → o que o documento mostra).
   Cada achado passa pelo mesmo construirCard do canvas/inspetor, então
   título, valor-chave, campos, fonte e nível de risco batem com o app.
   ========================================================================== */
import { construirCard, type ModeloCard } from "@/components/nodes/card-model";
import { tipoDoNo } from "@/components/nodes/node-types";
import { numeroSeguro } from "@/lib/format";
import { fontesDoAchado, type IdentificacaoPolitico, type PayloadExportacao } from "../exportacao";
import type { Risco } from "../risco";

type Dados = Record<string, any>;

export interface Achado {
	/** Identificador estável dentro do documento: A-01, A-02… */
	id: string;
	categoria: string;
	card: ModeloCard;
	/** Texto da análise automatizada (o card troca o da emenda fantasma por um resumo; no dossiê vale o texto completo). */
	analise: string;
	/** Valor monetário do registro (só tipos financeiros atômicos; resumos não somam). */
	valor: number | null;
	fundamentacao: string;
	enquadramento: string;
	fontes: string[];
}

export interface Categoria {
	nome: string;
	achados: Achado[];
	criticos: number;
	atencao: number;
	valor: number;
}

export interface ModeloDossie {
	politico: IdentificacaoPolitico;
	geradoEm: string;
	categorias: Categoria[];
	/** Na ordem em que aparecem no documento. */
	achados: Achado[];
	destaques: Achado[];
	totais: { achados: number; criticos: number; atencao: number; contexto: number; valor: number; documentos: number };
	bases: string[];
	outrasFontes: string[];
}

const CATEGORIAS: Record<string, string> = {
	EMENDA: "Emendas parlamentares",
	EMENDA_RESUMO: "Emendas parlamentares",
	CONTRATO: "Contratos e convênios",
	DESPESA: "Despesas",
	DESPESA_PUBLICA: "Despesas",
	EMPRESA: "Empresas",
	ORGAO: "Órgãos públicos",
	SOCIO: "Pessoas relacionadas",
	SERVIDOR: "Pessoas relacionadas",
	PROCESSO_JUDICIAL: "Processos e sanções",
	DIARIO_OFICIAL_NODE: "Atos em diário oficial",
};

/** Tipos cujo valor entra no total; EMENDA_RESUMO fica fora para não somar duas vezes as emendas. */
const TIPOS_MONETARIOS = new Set(["DESPESA", "DESPESA_PUBLICA", "CONTRATO", "EMENDA", "DIARIO_OFICIAL_NODE"]);

const PESO_RISCO: Record<Risco, number> = { crit: 2, warn: 1, ok: 0 };

export const MAX_DESTAQUES = 5;

function categoriaDe(type: string): string {
	if (CATEGORIAS[type]) return CATEGORIAS[type];
	return type ? tipoDoNo(type).tag : "Outros registros";
}

function valorDe(type: string, d: Dados): number | null {
	return TIPOS_MONETARIOS.has(type) ? numeroSeguro(d._empenhado ?? d.valor) : null;
}

const textoDe = (...vs: unknown[]): string => {
	const v = vs.find((x) => typeof x === "string" && x.trim() !== "");
	return v ? String(v).trim() : "";
};

function achadoDe(d: Dados): Omit<Achado, "id"> {
	const type = String(d.type ?? "");
	const card = construirCard(type, d);
	return {
		categoria: categoriaDe(type),
		card,
		analise: type === "EMENDA" ? textoDe(d.motivo_ia, card.motivo) : card.motivo,
		valor: valorDe(type, d),
		fundamentacao: textoDe(d.fundamentacao_tecnica, d.risco?.fundamentacao_tecnica),
		enquadramento: textoDe(d.enquadramento_normativo, d.risco?.enquadramento_normativo),
		fontes: fontesDoAchado(d),
	};
}

/** Mais grave primeiro; empate pela nota e depois pelo valor. */
export function compararAchados(a: Omit<Achado, "id">, b: Omit<Achado, "id">): number {
	return (
		PESO_RISCO[b.card.risco] - PESO_RISCO[a.card.risco] ||
		(b.card.score ?? -1) - (a.card.score ?? -1) ||
		(b.valor ?? 0) - (a.valor ?? 0)
	);
}

const contar = (as: Omit<Achado, "id">[], r: Risco) => as.filter((a) => a.card.risco === r).length;
const somar = (as: Omit<Achado, "id">[]) => as.reduce((t, a) => t + (a.valor ?? 0), 0);

function agruparPorCategoria(base: Omit<Achado, "id">[]): Omit<Achado, "id">[][] {
	const grupos = new Map<string, Omit<Achado, "id">[]>();
	for (const a of base) grupos.set(a.categoria, [...(grupos.get(a.categoria) ?? []), a]);
	return [...grupos.values()]
		.map((g) => [...g].sort(compararAchados))
		.sort(
			(a, b) =>
				contar(b, "crit") - contar(a, "crit") || contar(b, "warn") - contar(a, "warn") || b.length - a.length || somar(b) - somar(a),
		);
}

/** Numera os achados na ordem do documento (categoria a categoria). */
function numerar(grupos: Omit<Achado, "id">[][]): Categoria[] {
	let n = 0;
	return grupos.map((g) => {
		const achados = g.map((a) => ({ ...a, id: `A-${String(++n).padStart(2, "0")}` }));
		return { nome: g[0].categoria, achados, criticos: contar(g, "crit"), atencao: contar(g, "warn"), valor: somar(g) };
	});
}

/** "05/10/2026 às 14:32" no horário de Brasília (o servidor roda em UTC). */
export function dataHoraBrasilia(agora: Date): string {
	const tz = { timeZone: "America/Sao_Paulo" } as const;
	const dia = agora.toLocaleDateString("pt-BR", tz);
	const hora = agora.toLocaleTimeString("pt-BR", { ...tz, hour: "2-digit", minute: "2-digit" });
	return `${dia} às ${hora}`;
}

const ehObjeto = (v: unknown): v is Dados => typeof v === "object" && v !== null && !Array.isArray(v);

function urlsAvulsas(payload: PayloadExportacao, achados: Achado[]): string[] {
	const vinculadas = new Set(achados.flatMap((a) => a.fontes));
	const todas = Array.isArray(payload.urlsNotasFiscais) ? payload.urlsNotasFiscais : [];
	return [...new Set(todas.filter((u) => typeof u === "string" && /^https?:\/\//.test(u) && !vinculadas.has(u)))];
}

/** A identificação vem do corpo da requisição: só aceita texto. */
function identificacao(payload: PayloadExportacao): IdentificacaoPolitico {
	const p: Dados = ehObjeto(payload.politico) ? payload.politico : {};
	const opcional = (v: unknown) => textoDe(v) || undefined;
	return { nome: textoDe(p.nome, payload.nomePolitico), cargo: opcional(p.cargo), partido: opcional(p.partido), uf: opcional(p.uf) };
}

export function montarModeloDossie(payload: PayloadExportacao, agora: Date): ModeloDossie {
	const entidades = Array.isArray(payload.despesasCriticas) ? payload.despesasCriticas.filter(ehObjeto) : [];
	const categorias = numerar(agruparPorCategoria(entidades.map(achadoDe)));
	const achados = categorias.flatMap((c) => c.achados);
	return {
		politico: identificacao(payload),
		geradoEm: dataHoraBrasilia(agora),
		categorias,
		achados,
		destaques: achados.filter((a) => a.card.risco !== "ok").sort(compararAchados).slice(0, MAX_DESTAQUES),
		totais: {
			achados: achados.length,
			criticos: contar(achados, "crit"),
			atencao: contar(achados, "warn"),
			contexto: contar(achados, "ok"),
			valor: somar(achados),
			documentos: achados.reduce((t, a) => t + a.fontes.length, 0),
		},
		bases: [...new Set(achados.map((a) => a.card.fonte).filter(Boolean))].sort(),
		outrasFontes: urlsAvulsas(payload, achados),
	};
}
