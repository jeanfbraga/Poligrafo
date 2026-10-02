/* ==========================================================================
   Cota parlamentar (CEAP) por mês: dados do gráfico e situação em relação ao teto.
   ========================================================================== */
type Registro = Record<string, any>;

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export interface MesDaCota {
	name: string;
	gasto: number;
	teto: number;
	mesNum: number;
}

export type SituacaoCota = "sem-gasto" | "acima" | "dentro";

export interface ResumoDaCota {
	ano: number;
	teto: number;
	dados: MesDaCota[];
	totalGasto: number;
	/** Meses com algum gasto (> 0). */
	mesesComGasto: number;
	/** Meses em que o gasto superou o teto mensal. */
	mesesAcima: number;
	situacao: SituacaoCota;
}

/** Ano mais recente presente nos registros (o banco os devolve do mais antigo ao mais novo). */
function anoMaisRecente(cota: Registro[]): number {
	const anos = cota.map((c) => Number(c.ano_referencia)).filter((a) => a > 0);
	return anos.length > 0 ? Math.max(...anos) : new Date().getFullYear();
}

export function montarDadosGrafico(cota: Registro[], teto: number): MesDaCota[] {
	return MESES.map((name, i) => {
		const reg = cota.find((c) => c.mes_referencia === i + 1);
		return { name, gasto: reg ? Number(reg.valor_gasto) || 0 : 0, teto, mesNum: i + 1 };
	});
}

/** Meses em que o gasto superou o teto mensal da CEAP. */
export function mesesAcimaDoTeto(dados: { gasto: number }[], teto: number): number {
	return teto > 0 ? dados.filter((d) => d.gasto > teto).length : 0;
}

function situacaoDaCota(totalGasto: number, mesesAcima: number): SituacaoCota {
	if (totalGasto <= 0) return "sem-gasto";
	return mesesAcima > 0 ? "acima" : "dentro";
}

/**
 * Resume a cota do ano mais recente. "Dentro do teto" só vale quando há gasto: um deputado sem nenhuma
 * despesa registrada (ex.: suplente que acabou de assumir) é "sem gasto", não "dentro do teto".
 */
export function resumirCotaMensal(cota: Registro[]): ResumoDaCota {
	const ano = anoMaisRecente(cota);
	const doAno = cota.filter((c) => Number(c.ano_referencia) === ano);
	const teto = Number(doAno[0]?.valor_teto) || 0;
	const dados = montarDadosGrafico(doAno, teto);
	const totalGasto = dados.reduce((s, d) => s + d.gasto, 0);
	const mesesAcima = mesesAcimaDoTeto(dados, teto);
	return {
		ano,
		teto,
		dados,
		totalGasto,
		mesesComGasto: dados.filter((d) => d.gasto > 0).length,
		mesesAcima,
		situacao: situacaoDaCota(totalGasto, mesesAcima),
	};
}
