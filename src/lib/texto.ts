/* ==========================================================================
   Texto de fontes oficiais: normalização para exibição.
   - As fontes (Câmara, TSE, Receita) entregam nomes e títulos TODOS EM CAIXA ALTA.
     Em listas e cartões isso cansa: aqui viram Title Case, preservando siglas,
     partículas ("de", "da"…) e algarismos romanos.
   - O TSE perdeu o travessão na codificação: "ANÁPOLIS ¿ GO" → "ANÁPOLIS – GO".
   ========================================================================== */

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "por", "com", "a", "o", "as", "os", "no", "na", "nos", "nas", "ao", "aos", "à", "às", "um", "uma"]);

/** Siglas empresariais/oficiais que ficam em caixa alta mesmo com vogal. */
const SIGLAS = new Set(["LTDA", "ME", "EPP", "EIRELI", "SA", "CNPJ", "CPF", "RG", "TSE", "STF", "STJ", "TCU", "CGU", "ONU", "SUS", "PF", "PM", "INSS", "IPTU", "ITR", "CIB", "RENAVAM", "ANAC", "UF", "ID"]);

/** Algarismos romanos curtos (II, III, IV…); palavras como "DI" ou "MIL" não contam. */
const ROMANO = /^(?=[IVX]+$)X{0,3}(IX|IV|V?I{0,3})$/;

/** Abreviações sem vogal que NÃO são siglas: "DR. João", "AV. Brasil". */
const ABREVIACOES = new Set(["DR", "DRA", "SR", "SRA", "AV", "ST", "LT", "QD", "KM"]);

const SO_LETRAS_MAIUSCULAS = /[A-ZÀ-ÖØ-Þ]/g;
const SO_LETRAS_MINUSCULAS = /[a-zß-öø-ÿ]/g;

/** Mais de 60% das letras são maiúsculas (e há pelo menos 4 letras)? */
export function estaEmCaixaAlta(texto: string): boolean {
	const altas = (texto.match(SO_LETRAS_MAIUSCULAS) ?? []).length;
	const baixas = (texto.match(SO_LETRAS_MINUSCULAS) ?? []).length;
	return altas >= 4 && altas / (altas + baixas) > 0.6;
}

function semVogal(palavra: string): boolean {
	return !/[AEIOUÁÀÂÃÉÊÍÓÔÕÚ]/i.test(palavra);
}

function siglaCurta(palavra: string): boolean {
	return palavra.length <= 3 && semVogal(palavra) && !ABREVIACOES.has(palavra);
}

function mantemMaiuscula(palavra: string): boolean {
	return SIGLAS.has(palavra) || ROMANO.test(palavra) || /\d/.test(palavra) || siglaCurta(palavra);
}

function capitalizar(palavra: string): string {
	return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}

function formatarPalavra(palavra: string, primeira: boolean): string {
	if (mantemMaiuscula(palavra)) return palavra;
	if (!primeira && PARTICULAS.has(palavra.toLowerCase())) return palavra.toLowerCase();
	return capitalizar(palavra);
}

/** "RADIO PRESS PRODUCOES LTDA" → "Radio Press Producoes LTDA". Texto que já está em caixa mista não é alterado. */
export function tituloCaso(texto: string | null | undefined): string {
	const t = String(texto ?? "");
	if (!estaEmCaixaAlta(t)) return t;
	let primeira = true;
	// 1ª alternativa: siglas pontuadas (S.A., S/S) ficam como estão; 2ª: palavras comuns.
	return t.replace(/(?:\p{Lu}[./])+\p{Lu}\.?|[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (palavra) => {
		const r = /[./]/.test(palavra) ? palavra : formatarPalavra(palavra, primeira);
		primeira = false;
		return r;
	});
}

/** Texto longo em caixa alta (ex.: descrição de bem): só a primeira letra de cada frase fica maiúscula. */
export function frasesEmCaixaBaixa(texto: string | null | undefined): string {
	const t = String(texto ?? "");
	if (!estaEmCaixaAlta(t)) return t;
	return t
		.replace(/[\p{L}\p{N}]+/gu, (p) => (SIGLAS.has(p) || (siglaCurta(p) && !/\d/.test(p)) ? p : p.toLowerCase()))
		.replace(/(^|[.!?]\s+)(\p{L})/gu, (_m, ini: string, letra: string) => ini + letra.toUpperCase());
}

/** O TSE trocou o travessão por "¿" na codificação: restaura o "–". */
export function corrigirTextoTse(texto: string | null | undefined): string {
	return String(texto ?? "").replace(/\s*¿\s*/g, (m) => (m.trim() === m ? "–" : " – "));
}

/** Descrição de bem do TSE pronta para exibir: travessão corrigido e sem caixa alta contínua. */
export function descricaoDeBem(texto: string | null | undefined): string {
	return frasesEmCaixaBaixa(corrigirTextoTse(texto));
}
