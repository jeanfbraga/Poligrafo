/* ==========================================================================
   Frequência em sessões deliberativas.
   A taxa de presença só considera as sessões ocorridas depois que o deputado
   assumiu (posse/retorno); quem entrou há pouco não é cobrado por sessões
   anteriores. O ranking usa a taxa, não o número absoluto de presenças.
   ========================================================================== */

/** Abaixo disso a taxa é instável demais para entrar num ranking de "menos presentes". */
export const MIN_SESSOES_RANKING = 20;

export interface LinhaFrequencia {
	presencas?: number | null;
	ausencias_nao_justificadas?: number | null;
}

/** Sessões em que o deputado podia estar presente (presenças + ausências no período em exercício). */
export function sessoesDoDeputado(l: LinhaFrequencia): number {
	return (Number(l.presencas) || 0) + (Number(l.ausencias_nao_justificadas) || 0);
}

/** Taxa de presença de 0 a 1; `null` quando não houve sessão elegível. */
export function taxaDePresenca(l: LinhaFrequencia): number | null {
	const total = sessoesDoDeputado(l);
	return total > 0 ? (Number(l.presencas) || 0) / total : null;
}

/** Uma ausência só conta se a sessão foi no dia da entrada em exercício ou depois (sem data de entrada, conta). */
export function sessaoContaParaAusencia(dataSessao: string, inicioExercicio: string): boolean {
	const sessao = dataSessao.slice(0, 10);
	return !inicioExercicio || !sessao || sessao >= inicioExercicio;
}

export type ComTaxa<T> = T & { sessoes: number; taxa: number };

/** Os menos presentes por taxa (do menor para o maior); exige um mínimo de sessões elegíveis. */
export function rankingMenosPresentes<T extends LinhaFrequencia>(linhas: T[] | null | undefined, limite = 10, minimo = MIN_SESSOES_RANKING): ComTaxa<T>[] {
	const comTaxa: ComTaxa<T>[] = [];
	for (const l of linhas ?? []) {
		const taxa = taxaDePresenca(l);
		const sessoes = sessoesDoDeputado(l);
		if (taxa !== null && sessoes >= minimo) comTaxa.push({ ...l, sessoes, taxa });
	}
	comTaxa.sort((a, b) => a.taxa - b.taxa || b.sessoes - a.sessoes);
	return comTaxa.slice(0, limite);
}

export function textoDePresenca(presencas: number, sessoes: number, taxa: number): string {
	return `${presencas}/${sessoes} sess. · ${Math.round(taxa * 100)}%`;
}
