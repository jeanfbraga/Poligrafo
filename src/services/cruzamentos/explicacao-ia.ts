/**
 * A IA explica os cruzamentos — e só isso (Fase 3, nota 31).
 *
 * Contrato: a resposta só vale com `achado_id` existente e fatos citados que
 * pertençam ao próprio achado; itens fora disso são descartados (se nenhum
 * sobrar, o gateway tenta outro modelo). A gravidade da regra nunca muda.
 * Sem IA (dev, sem chave, cota esgotada) fica o resumo da regra.
 */
import { gerar, iaDesligada, type ResultadoValidacaoIA } from "@/services/ai/gateway";
import { type AchadoParaIA, construirPromptAchados } from "@/services/ai/prompt-builder";

export interface ExplicacaoAchado {
	achado_id: string;
	prioridade: number;
	texto: string;
	fatos_citados: string[];
}

/** Até quantos cruzamentos vão num pedido (os mais graves; os demais ficam com o resumo da regra). */
export const MAX_ACHADOS_IA = 12;

interface NoAchado {
	id: string;
	data: { label: string; severidade: string; motivo_ia: string; fatos: { papel: string; fonte: string; detalhe: string | null; valor: number | null; data: string | null }[] };
}

/** Nós ACHADO → itens do prompt, com refs F1, F2… únicos no pedido. */
export function paraIA(nos: NoAchado[]): AchadoParaIA[] {
	let n = 0;
	return nos.slice(0, MAX_ACHADOS_IA).map((no) => ({
		id: no.id,
		titulo: no.data.label,
		severidade: no.data.severidade,
		resumo: no.data.motivo_ia,
		fatos: no.data.fatos.map((f) => ({ ref: `F${++n}`, papel: f.papel, fonte: f.fonte, detalhe: f.detalhe, valor: f.valor, data: f.data })),
	}));
}

function lerExplicacao(bruto: unknown, refsPorAchado: Map<string, Set<string>>): ExplicacaoAchado | null {
	const item = (bruto ?? {}) as Record<string, unknown>;
	const id = String(item.achado_id ?? "");
	const refs = refsPorAchado.get(id);
	const texto = typeof item.texto === "string" ? item.texto.trim() : "";
	const citados = Array.isArray(item.fatos_citados) ? item.fatos_citados.map(String) : [];
	if (!refs || !texto || citados.length === 0 || citados.some((r) => !refs.has(r))) return null;
	const prioridade = Math.min(5, Math.max(1, Math.round(Number(item.prioridade)) || 3));
	return { achado_id: id, prioridade, texto, fatos_citados: citados };
}

/** Valida a resposta: ids conhecidos, fatos do próprio achado, ao menos uma explicação. */
export function validarExplicacoes(json: unknown, itens: AchadoParaIA[]): { success: true; data: ExplicacaoAchado[] } | { success: false; error: string } {
	const lista = (json as Record<string, unknown> | null)?.explicacoes;
	if (!Array.isArray(lista)) return { success: false, error: 'chave "explicacoes" ausente' };
	const refsPorAchado = new Map(itens.map((a) => [a.id, new Set(a.fatos.map((f) => f.ref))]));
	const validas = new Map<string, ExplicacaoAchado>();
	for (const bruto of lista) {
		const e = lerExplicacao(bruto, refsPorAchado);
		if (e && !validas.has(e.achado_id)) validas.set(e.achado_id, e);
	}
	if (validas.size === 0) return { success: false, error: "nenhuma explicação com achado e fatos válidos" };
	return { success: true, data: [...validas.values()] };
}

type Gerar = typeof gerar;

export async function explicarAchados(nos: NoAchado[], gerarFn: Gerar = gerar): Promise<ExplicacaoAchado[]> {
	if (nos.length === 0 || iaDesligada()) return [];
	const itens = paraIA(nos);
	const { sistema, usuario } = construirPromptAchados(itens);
	const r = await gerarFn({
		tarefa: "triagem-json",
		sistema,
		usuario,
		formato: "json",
		chaveRaiz: "explicacoes",
		validar: (json): ResultadoValidacaoIA => validarExplicacoes(json, itens),
	});
	if (!r.ok) return [];
	const v = validarExplicacoes(r.dados, itens);
	return v.success ? v.data : [];
}
