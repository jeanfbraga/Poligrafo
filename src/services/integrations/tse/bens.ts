/**
 * Bens declarados ao TSE pela base `tse_bens` (BANCO DE PERFIL), carregada dos arquivos oficiais
 * por scripts/etl/tse-bens-sync.ts: só quem está na janela de mandato e os presidentes.
 *
 * Desde 12/10/2026: sem a tabela antiga do Banco Principal (tse_bens_historico, todos os
 * candidatos, chave só pelo CPF), sem procurar bens pelo nome (juntava homônimos) e sem gravar
 * nada a partir da investigação. Prefeito ou vereador sem CPF público: pelo número do candidato.
 */
import { cpfValido, soDigitos } from "@/lib/documento";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export interface TseBensHistorico {
	sq_candidato?: string;
	cpf_candidato: string | null;
	nome_candidato?: string;
	ano_eleicao: number;
	valor_total: number;
	descricao_bens: any;
}

interface LinhaTseBens {
	sq_candidato: string;
	ano_eleicao: number;
	cpf: string | null;
	nome: string;
	valor_total: number | string;
	bens: { t: string; d: string; v: number }[] | null;
}

type ClienteSupabase = Pick<typeof supabasePerfilAdmin, "from">;

/** Linha gravada (chaves curtas) → formato que o dossiê usa ({ tipoBem, descricao, valor }). */
export function paraHistorico(l: LinhaTseBens): TseBensHistorico {
	return {
		sq_candidato: l.sq_candidato,
		cpf_candidato: l.cpf,
		nome_candidato: l.nome,
		ano_eleicao: l.ano_eleicao,
		valor_total: Number(l.valor_total) || 0,
		descricao_bens: (l.bens ?? []).map((b) => ({ tipoBem: b.t, descricao: b.d, valor: b.v })),
	};
}

async function lerBens(coluna: "cpf" | "sq_candidato", valor: string, cliente: ClienteSupabase): Promise<TseBensHistorico[]> {
	try {
		const { data, error } = await cliente
			.from("tse_bens")
			.select("sq_candidato,ano_eleicao,cpf,nome,valor_total,bens")
			.eq(coluna, valor)
			.order("ano_eleicao", { ascending: false });
		if (error) throw error;
		return ((data ?? []) as LinhaTseBens[]).map(paraHistorico);
	} catch (e: any) {
		console.warn("[TSE] Erro ao buscar bens declarados na base:", e.message || e);
		return [];
	}
}

/** Todas as declarações da pessoa (da mais recente para a mais antiga), pelo CPF. */
export async function buscarBensHistoricoTSE(cpf: string, cliente: ClienteSupabase = supabasePerfilAdmin): Promise<TseBensHistorico[]> {
	const doc = soDigitos(cpf);
	return cpfValido(doc) ? lerBens("cpf", doc, cliente) : [];
}

/** Declaração da candidatura pelo número do candidato (eleito sem CPF público, como em 2024). */
export async function buscarBensPorSqTSE(sq: string | null | undefined, cliente: ClienteSupabase = supabasePerfilAdmin): Promise<TseBensHistorico[]> {
	return sq ? lerBens("sq_candidato", String(sq), cliente) : [];
}

function formatarMoeda(valor: number): string {
	return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function adicionarAlertaPatrimonioDeclarado(
	alertas: string[],
	ano: number,
	ptFmt: string
): void {
	const jaExiste = alertas.some((a) => a.includes("[TSE] Patrimônio"));
	if (!jaExiste) {
		alertas.push(`[TSE] Patrimônio Declarado (${ano}): R$ ${ptFmt}`);
	}
}

function adicionarAlertaEvolucaoPatrimonial(
	alertas: string[],
	tseData: any,
	ptFmt: string
): void {
	const pct = tseData.variacaoPatrimonioPercentual;
	const anoAnt = tseData.anoPatrimonioAnterior;
	const antVal = tseData.patrimonioAnterior;
	if (pct === undefined || anoAnt === undefined || antVal === undefined) return;

	const delta = Math.abs(tseData.variacaoPatrimonio || 0);
	if (Math.abs(pct) <= 50 && delta < 500000) return;

	const antFmt = formatarMoeda(antVal);
	const sinal = pct > 0 ? "+" : "";
	const pctFmt = pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
	const ano = tseData.anoEleicao || 2026;
	alertas.push(
		`[TSE] Evolução Patrimonial: R$ ${antFmt} (${anoAnt}) ➔ R$ ${ptFmt} (${ano}) [${sinal}${pctFmt}%]`
	);
}

function aplicarDadosTseNaFicha(fichaPolitico: any, tseData: any): void {
	fichaPolitico.patrimonioTotal = tseData.patrimonioTotal;
	fichaPolitico.anoPatrimonio = tseData.anoEleicao || 2026;
	if (tseData.bensDeclarados) fichaPolitico.bensDeclarados = tseData.bensDeclarados;
	fichaPolitico.historicoPatrimonio = tseData.historicoPatrimonio || [];
	fichaPolitico.patrimonioAnterior = tseData.patrimonioAnterior;
	fichaPolitico.anoPatrimonioAnterior = tseData.anoPatrimonioAnterior;
	fichaPolitico.variacaoPatrimonio = tseData.variacaoPatrimonio;
	fichaPolitico.variacaoPatrimonioPercentual = tseData.variacaoPatrimonioPercentual;

	if (!fichaPolitico.alertasPessoais) fichaPolitico.alertasPessoais = [];
	const ptFmt = formatarMoeda(tseData.patrimonioTotal);
	adicionarAlertaPatrimonioDeclarado(fichaPolitico.alertasPessoais, fichaPolitico.anoPatrimonio, ptFmt);
	adicionarAlertaEvolucaoPatrimonial(fichaPolitico.alertasPessoais, tseData, ptFmt);
}

function aplicarBensCacheNaFicha(
	fichaPolitico: any,
	bens: TseBensHistorico[],
	sendEvent?: (tipo: string, payload: any) => void
): void {
	if (!bens || bens.length === 0) return;
	const maisRecente = bens[0];

	fichaPolitico.patrimonioTotal = Number(maisRecente.valor_total) || 0;
	fichaPolitico.anoPatrimonio = maisRecente.ano_eleicao;
	fichaPolitico.bensDeclarados = maisRecente.descricao_bens || [];
	fichaPolitico.historicoPatrimonio = bens.map((b) => ({
		ano: b.ano_eleicao,
		idEleicao: String(b.ano_eleicao),
		cargo: "Candidato",
		patrimonioTotal: Number(b.valor_total) || 0,
		bensDeclarados: b.descricao_bens || [],
	}));

	if (bens.length >= 2) {
		const anterior = bens[1];
		fichaPolitico.patrimonioAnterior = Number(anterior.valor_total) || 0;
		fichaPolitico.anoPatrimonioAnterior = anterior.ano_eleicao;
		const variacao = fichaPolitico.patrimonioTotal - fichaPolitico.patrimonioAnterior;
		fichaPolitico.variacaoPatrimonio = variacao;
		if (fichaPolitico.patrimonioAnterior > 0) {
			fichaPolitico.variacaoPatrimonioPercentual =
				(variacao / fichaPolitico.patrimonioAnterior) * 100;
		}
	}

	if (!fichaPolitico.alertasPessoais) fichaPolitico.alertasPessoais = [];
	const ptFmt = formatarMoeda(fichaPolitico.patrimonioTotal);
	fichaPolitico.alertasPessoais.push(
		`[TSE] Patrimônio Declarado (${maisRecente.ano_eleicao}): R$ ${ptFmt} (Base Histórica)`
	);

	sendEvent?.("STATUS", {
		msg: `[TSE] Patrimônio de R$ ${ptFmt} recuperado do banco histórico (${maisRecente.ano_eleicao}).`,
	});
}

/**
 * Patrimônio da ficha: o do resultado do TSE (base de eleitos + bens, com a variação) ou, sem
 * ele, as declarações na base pelo CPF confirmado ou pelo número do candidato confirmado.
 */
export async function resolverPatrimonioTSE(
	fichaPolitico: any,
	tseData: any,
	cpfLimpo: string,
	sqCandidato?: string | null,
	sendEvent?: (tipo: string, payload: any) => void,
): Promise<void> {
	if (tseData?.patrimonioTotal !== undefined && tseData.patrimonioTotal > 0) {
		aplicarDadosTseNaFicha(fichaPolitico, tseData);
		return;
	}
	const bens = cpfValido(cpfLimpo) ? await buscarBensHistoricoTSE(cpfLimpo) : await buscarBensPorSqTSE(sqCandidato);
	if (bens.length > 0) aplicarBensCacheNaFicha(fichaPolitico, bens, sendEvent);
}
