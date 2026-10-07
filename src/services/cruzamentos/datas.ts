/**
 * Datas das fontes em ISO (yyyy-mm-dd) para comparar períodos: o Portal da
 * Transparência usa "05/01/2026" e o PNCP "2025-06-23" ou "2025-06-23T00:00:00".
 */
export function dataIso(valor: unknown): string | null {
	const s = String(valor ?? "").trim();
	const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	if (br) return `${br[3]}-${br[2]}-${br[1]}`;
	const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** A data cai dentro do período [inicio, fim]? Sem fim = em vigor. */
export function dentroDoPeriodo(data: string, inicio: string | null, fim: string | null): boolean {
	if (!inicio || data < inicio) return false;
	return !fim || data <= fim;
}
