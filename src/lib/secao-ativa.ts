/** Posição (em px, relativa ao topo da área visível) do início de cada seção. */
export interface PosicaoSecao {
	id: string;
	topo: number;
}

/**
 * Seção "atual" na rolagem: a última cujo topo já passou da linha de leitura.
 * Antes de qualquer seção chegar à linha, vale a primeira; no fim da página, a última.
 */
export function secaoAtiva(posicoes: PosicaoSecao[], linha: number, fimDaPagina = false): string | null {
	if (posicoes.length === 0) return null;
	if (fimDaPagina) return posicoes[posicoes.length - 1].id;
	let atual = posicoes[0].id;
	for (const p of posicoes) {
		if (p.topo <= linha) atual = p.id;
	}
	return atual;
}
