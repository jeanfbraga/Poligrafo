/**
 * Primeiro valor preenchido (nem undefined, nem null, nem string vazia), como
 * texto. Substitui cadeias `a || b || c || ""` nos tradutores de respostas
 * das fontes — que estouravam a regra de complexidade (≤ 10).
 */
export function primeiroValor(...valores: unknown[]): string {
	const v = valores.find((x) => x !== undefined && x !== null && x !== "");
	return v === undefined ? "" : String(v);
}

/** Primeiro valor numérico válido; 0 quando nenhum é número. */
export function primeiroNumero(...valores: unknown[]): number {
	for (const v of valores) {
		const n = Number(v);
		if (v !== undefined && v !== null && v !== "" && Number.isFinite(n)) return n;
	}
	return 0;
}
