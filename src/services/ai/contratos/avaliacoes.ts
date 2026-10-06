/**
 * Contrato de resposta da IA para as triagens em lote (despesas, emendas,
 * malha OSINT).
 *
 * Problema que resolve (ver nota 9 do Obsidian): o validador antigo só
 * conferia se a chave existia. `{"despesas_avaliadas": []}` passava, e todo
 * item sem avaliação virava score 20 "Gasto validado pela IA como seguro".
 * O merge usava cnpj + valor, mas o schema nunca pedia o valor de volta.
 *
 * Agora:
 *  - cada item do lote recebe um id nosso (d0, d1… / e0… / o id do nó);
 *  - a resposta só vale se usar a chave da tarefa e cobrir uma fração
 *    mínima dos ids enviados (senão o orquestrador tenta outro modelo);
 *  - item que a IA não avaliou NUNCA vira "seguro": quem chama aplica a
 *    regra local e marca "não avaliado pela IA".
 *
 * O formato `{ success, data, error }` é o mesmo do zod, para trocar depois
 * sem mexer em quem chama.
 */

export type ResultadoValidacao<T> =
	| { success: true; data: T }
	| { success: false; error: string };

export type Validador<T = unknown> = (json: unknown) => ResultadoValidacao<T>;

export interface AvaliacaoIA {
	id: string;
	score_letalidade: number;
	classificacao: string;
	motivo_ia: string;
	enquadramento_normativo?: string;
	fundamentacao_tecnica?: string;
}

export const ROTULO_NAO_AVALIADO = "Não avaliado pela IA";

/** Cobertura mínima padrão: 80% dos itens do lote precisam voltar avaliados. */
export const COBERTURA_MINIMA = 0.8;

function texto(v: unknown): string | undefined {
	return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function lerAvaliacao(bruto: unknown, idsEsperados: Set<string>): AvaliacaoIA | null {
	if (!bruto || typeof bruto !== "object") return null;
	const item = bruto as Record<string, unknown>;
	const id = String(item.id ?? "");
	const score = Number(item.score_letalidade);
	if (!idsEsperados.has(id) || !Number.isFinite(score)) return null;
	return {
		id,
		score_letalidade: Math.max(0, Math.min(100, Math.round(score))),
		classificacao: texto(item.classificacao) ?? "SEM_CLASSIFICACAO",
		motivo_ia: texto(item.motivo_ia) ?? "",
		enquadramento_normativo: texto(item.enquadramento_normativo),
		fundamentacao_tecnica: texto(item.fundamentacao_tecnica),
	};
}

/**
 * Valida uma resposta `{ [chave]: [{ id, score_letalidade, ... }] }`.
 * Devolve um Map id → avaliação (ids desconhecidos e itens malformados
 * são descartados; o primeiro id repetido vence).
 */
export function validarAvaliacoes(
	json: unknown,
	chave: string,
	idsEsperados: string[],
	coberturaMinima: number = COBERTURA_MINIMA,
): ResultadoValidacao<Map<string, AvaliacaoIA>> {
	const lista = (json as Record<string, unknown> | null)?.[chave];
	if (!Array.isArray(lista)) return { success: false, error: `chave "${chave}" ausente ou não é lista` };
	const esperados = new Set(idsEsperados);
	const avaliacoes = new Map<string, AvaliacaoIA>();
	for (const bruto of lista) {
		const a = lerAvaliacao(bruto, esperados);
		if (a && !avaliacoes.has(a.id)) avaliacoes.set(a.id, a);
	}
	const cobertura = esperados.size ? avaliacoes.size / esperados.size : 1;
	if (avaliacoes.size === 0 || cobertura < coberturaMinima) {
		return {
			success: false,
			error: `cobertura ${avaliacoes.size}/${esperados.size} abaixo do mínimo (${Math.round(coberturaMinima * 100)}%)`,
		};
	}
	return { success: true, data: avaliacoes };
}

/** Validador pronto para o orquestrador (reaproveitado pelo gateway da Fase 2). */
export function criarValidadorAvaliacoes(
	chave: string,
	idsEsperados: string[],
	coberturaMinima: number = COBERTURA_MINIMA,
): Validador<Map<string, AvaliacaoIA>> {
	return (json) => validarAvaliacoes(json, chave, idsEsperados, coberturaMinima);
}

/** Ids do lote: prefixo + posição (d0, d1… para despesas; e0… para emendas). */
export function idsDoLote(tamanho: number, prefixo: string): string[] {
	return Array.from({ length: tamanho }, (_v, i) => `${prefixo}${i}`);
}
