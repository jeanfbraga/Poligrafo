/* ==========================================================================
   Cota parlamentar (CEAP) no Dossiê — recorte e resumo.
   O backend entrega as N maiores notas (por valor) do cache, de 2024 até hoje.
   O resumo é calculado no front a partir das despesas que já estão no dossiê
   (as de atenção no grafo + as de baixo risco na lista), sem nó "aglutinador".
   ========================================================================== */
import type { DossieNode } from "./dossie-state";

/** Máximo de notas por parlamentar que o backend envia ao Dossiê (maiores por valor). */
export const LIMITE_NOTAS_CEAP = 60;
/** Primeiro ano coberto pelo cache do ETL (`ceap_despesas_cache`). */
export const ANO_INICIO_CEAP = 2024;

const TIPOS_DESPESA = new Set(["DESPESA", "DESPESA_PUBLICA"]);

export interface ResumoCota {
	notas: number;
	total: number;
	de: Date | null;
	ate: Date | null;
	/** true quando atingiu o limite: pode haver notas menores fora do recorte. */
	limitado: boolean;
}

/** Aceita ISO (2026-07-31T00:00:00) e BR (31/07/2026). */
export function lerData(v: unknown): Date | null {
	const s = String(v ?? "").trim();
	if (!s) return null;
	const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	const d = br ? new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])) : new Date(s.length === 10 ? `${s}T00:00:00` : s);
	return Number.isNaN(d.getTime()) ? null : d;
}

function valorDe(n: DossieNode): number {
	return Number(n.data?.valor ?? 0) || 0;
}

function extremos(datas: Date[]): { de: Date | null; ate: Date | null } {
	if (datas.length === 0) return { de: null, ate: null };
	const ms = datas.map((d) => d.getTime());
	return { de: new Date(Math.min(...ms)), ate: new Date(Math.max(...ms)) };
}

/** Resume as despesas do dossiê (grafo + lista). `null` quando não há nenhuma. */
export function resumirCota(nodes: DossieNode[], evidencias: DossieNode[]): ResumoCota | null {
	const despesas = [...nodes, ...evidencias].filter((n) => TIPOS_DESPESA.has(n.type ?? ""));
	if (despesas.length === 0) return null;
	const datas = despesas.map((n) => lerData(n.data?.dataDocumento)).filter((d): d is Date => d !== null);
	return {
		notas: despesas.length,
		total: despesas.reduce((acc, n) => acc + valorDe(n), 0),
		...extremos(datas),
		limitado: despesas.length >= LIMITE_NOTAS_CEAP,
	};
}

export function textoRecorte(r: ResumoCota): string {
	return r.limitado
		? `As ${r.notas} maiores notas (por valor) desde ${ANO_INICIO_CEAP}. Notas menores não entram no recorte.`
		: `Todas as ${r.notas} notas desde ${ANO_INICIO_CEAP}.`;
}
