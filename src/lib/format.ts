/* ==========================================================================
   Formatadores pt-BR do produto. Puros e testados.
   ========================================================================== */

export function numeroSeguro(v: unknown): number | null {
	if (v === null || v === undefined || v === "") return null;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}

/** R$ 1.482.300,00 */
export function brl(v: unknown): string {
	const n = numeroSeguro(v);
	if (n === null) return "—";
	return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const dec = (n: number, max: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: max });

/** Forma curta para chips e linhas compactas: R$ 800 · R$ 1,2 mil · R$ 48 mil · R$ 1,19 mi · R$ 2,1 bi. */
export function brlCurto(v: unknown): string {
	const n = numeroSeguro(v);
	if (n === null) return "—";
	const abs = Math.abs(n);
	if (abs >= 1e9) return `R$ ${dec(n / 1e9, 1)} bi`;
	if (abs >= 1e6) return `R$ ${dec(n / 1e6, 2)} mi`;
	if (abs >= 1e4) return `R$ ${dec(n / 1e3, 0)} mil`;
	if (abs >= 1e3) return `R$ ${dec(n / 1e3, 1)} mil`;
	return `R$ ${dec(n, 0)}`;
}

/** Só dígitos. */
export function soDigitos(v: unknown): string {
	return String(v ?? "").replace(/\D/g, "");
}

/** CPF 000.000.000-00 ou CNPJ 00.000.000/0000-00; outros tamanhos voltam como vieram. */
export function documentoFormatado(v: unknown): string {
	const d = soDigitos(v);
	if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
	if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
	return String(v ?? "");
}

/** Mascara o CPF: ***.482.119-** (mantém o miolo). */
export function cpfMascarado(v: unknown): string {
	const d = soDigitos(v);
	if (d.length !== 11) return "";
	return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Data ISO, "dd/mm/aaaa" ou timestamp → "dd/mm/aaaa". Texto não reconhecido volta como veio. */
export function dataBR(v: unknown): string {
	const s = String(v ?? "").trim();
	if (!s) return "";
	if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
	const parte = s.includes("T") ? s.split("T")[0] : s.split(" ")[0];
	const m = parte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** 12,5% — recebe o número já em pontos percentuais. */
export function percentual(v: unknown, casas = 1): string {
	const n = numeroSeguro(v);
	if (n === null) return "—";
	return `${n.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
}

/** "Alice Ribeiro Monteiro" → "AM" (iniciais do primeiro e do último nome). */
export function iniciais(nome: string): string {
	const partes = nome.trim().split(/\s+/).filter(Boolean);
	if (partes.length === 0) return "";
	const a = partes[0][0];
	const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
	return `${a}${b}`.toUpperCase();
}
