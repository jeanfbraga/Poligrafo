/* Helpers do extrato do cartão corporativo (CPGF) do Presidente. */

export interface LancamentoCpgf {
	data?: string;
	nomeFornecedor?: string | null;
	cnpj?: string;
	valor: number;
}

export type AgrupadoPorAnoMes = Record<string, Record<string, LancamentoCpgf[]>>;

/** Agrupa lançamentos "dd/mm/aaaa" por ano e mês. Datas inválidas são ignoradas. */
export function agruparDespesasPorAnoMes(itens?: LancamentoCpgf[]): AgrupadoPorAnoMes {
	const grupos: AgrupadoPorAnoMes = {};
	for (const item of itens ?? []) {
		const partes = item?.data?.split("/") ?? [];
		if (partes.length !== 3) continue;
		const [, mes, ano] = partes;
		((grupos[ano] ??= {})[mes] ??= []).push(item);
	}
	return grupos;
}

export const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function rotuloMes(mes: string): string {
	return MESES_ABREV[parseInt(mes, 10) - 1] ?? mes;
}

/** Percentual de valor sigiloso (0 quando não há lançamentos). */
export function percentualSigiloso(countSigiloso: number, countTotal: number): number {
	return countTotal > 0 ? Math.round((countSigiloso / countTotal) * 1000) / 10 : 0;
}

export function cpfParcial(cpf?: string): string {
	if (!cpf) return "RESTRITO";
	return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-**");
}
