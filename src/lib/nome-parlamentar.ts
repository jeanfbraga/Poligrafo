/**
 * Casar o nome civil (TSE) com o nome usado pela assembleia (ALESP, DOCIGP da
 * ALERJ): nome contido, ou todas as palavras do nome menor dentro do maior.
 * Nome ambíguo não escolhe ninguém.
 */
export function normalizaNomeParlamentar(s: string): string {
	return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function nomesBatem(nomeCasa: string, alvo: string): boolean {
	const n = normalizaNomeParlamentar(nomeCasa);
	const a = normalizaNomeParlamentar(alvo);
	if (!n || !a) return false;
	if (n === a || a.includes(n) || n.includes(a)) return true;
	const [menor, maior] = [n.split(" "), a.split(" ")].sort((x, y) => x.length - y.length);
	return menor.every((t) => maior.includes(t));
}

/** "NOME CIVIL (APELIDO)" → as duas formas, para casar por qualquer uma. */
function formas(nome: string): string[] {
	const apelido = nome.match(/\(([^)]+)\)/)?.[1];
	return [nome.replace(/\s*\([^)]*\)\s*/g, " ").trim(), apelido].filter((x): x is string => Boolean(x));
}

/** Um só: o nome exato, ou o único que bate; ambíguo = nenhum. */
export function escolherPorNome<T>(lista: T[], nome: string, nomeDe: (item: T) => string): T | null {
	const alvos = formas(nome);
	const batem = lista.filter((d) => formas(nomeDe(d)).some((f) => alvos.some((a) => nomesBatem(f, a))));
	const exato = batem.filter((d) => formas(nomeDe(d)).some((f) => alvos.some((a) => normalizaNomeParlamentar(f) === normalizaNomeParlamentar(a))));
	if (exato.length === 1) return exato[0];
	return batem.length === 1 ? batem[0] : null;
}
