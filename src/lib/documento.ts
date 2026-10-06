/**
 * Documentos (CPF/CNPJ): validação de verdade e máscara LGPD.
 *
 * Substitui as comparações com sentinelas ("00000000000", "00000000000000")
 * e os documentos fixos de preenchimento que existiam no pipe. Documento
 * ausente é `null` — nunca um valor inventado.
 *
 * A máscara mantém os 6 dígitos do meio do CPF, no mesmo formato que a
 * Receita usa no QSA (`***.456.789-**`), o que permite conferir um sócio
 * contra um CPF conhecido sem expor o documento inteiro (ideia do
 * `_shared/datasets/lgpd.py` do mcp-brasil).
 */

export function soDigitos(valor: unknown): string {
	return String(valor ?? "").replace(/\D/g, "");
}

/** Texto com asterisco/x no lugar de dígitos (CPF mascarado pela fonte). */
export function ehMascarado(valor: unknown): boolean {
	return /[*xX•]/.test(String(valor ?? ""));
}

function todosIguais(d: string): boolean {
	return /^(\d)\1+$/.test(d);
}

function digitoCpf(base: string): number {
	let soma = 0;
	for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
	const resto = (soma * 10) % 11;
	return resto === 10 ? 0 : resto;
}

export function cpfValido(valor: unknown): boolean {
	if (ehMascarado(valor)) return false;
	const d = soDigitos(valor);
	if (d.length !== 11 || todosIguais(d)) return false;
	return digitoCpf(d.slice(0, 9)) === Number(d[9]) && digitoCpf(d.slice(0, 10)) === Number(d[10]);
}

function digitoCnpj(base: string): number {
	const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
	const soma = pesos.reduce((acc, p, i) => acc + p * Number(base[i]), 0);
	const resto = soma % 11;
	return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: unknown): boolean {
	if (ehMascarado(valor)) return false;
	const d = soDigitos(valor);
	if (d.length !== 14 || todosIguais(d)) return false;
	return digitoCnpj(d.slice(0, 12)) === Number(d[12]) && digitoCnpj(d.slice(0, 13)) === Number(d[13]);
}

/** CPF ou CNPJ com dígitos verificadores corretos. */
export function documentoValido(valor: unknown): boolean {
	return cpfValido(valor) || cnpjValido(valor);
}

/** Só dígitos se o documento for válido; senão `null` (nunca uma sentinela). */
export function documentoOuNulo(valor: unknown): string | null {
	return documentoValido(valor) ? soDigitos(valor) : null;
}

/** CPF no formato do QSA da Receita: `***.456.789-**` (6 dígitos do meio). */
export function mascararCpf(valor: unknown): string {
	const d = soDigitos(valor);
	if (d.length !== 11) return "***.***.***-**";
	return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/**
 * Documento como vai para um prompt de IA (LGPD): CPF de pessoa física sai
 * mascarado (`***.456.789-**`); CNPJ e textos não numéricos passam como estão.
 */
export function documentoParaPrompt(valor: unknown): string {
	const d = soDigitos(valor);
	if (d.length === 11) return mascararCpf(d);
	return d || String(valor ?? "");
}

/** Os 6 dígitos do meio de um CPF (inteiro ou mascarado pela Receita). */
export function mioloCpf(valor: unknown): string | null {
	const texto = String(valor ?? "");
	const mascarado = texto.match(/\*{3}\.?(\d{3})\.?(\d{3})-?\*{2}/);
	if (mascarado) return mascarado[1] + mascarado[2];
	const d = soDigitos(texto);
	return d.length === 11 ? d.slice(3, 9) : null;
}
