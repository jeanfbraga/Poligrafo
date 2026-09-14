import { supabaseAdmin } from "@/lib/supabase-admin";

export interface TseBensHistorico {
	id?: number;
	cpf_candidato: string;
	nome_candidato?: string;
	ano_eleicao: number;
	valor_total: number;
	descricao_bens: any;
}

const STOPWORDS_NOME = new Set(["de", "da", "do", "dos", "das", "e"]);

function extrairTokensBusca(nome: string): string[] {
	if (!nome || typeof nome !== "string") return [];
	return nome
		.trim()
		.split(/\s+/)
		.map((t) => t.trim())
		.filter((t) => t.length >= 2 && !STOPWORDS_NOME.has(t.toLowerCase()))
		.slice(0, 3);
}

export async function buscarBensHistoricoTSE(
	cpf: string,
): Promise<TseBensHistorico[]> {
	try {
		const docLimpo = cpf.replace(/\D/g, "");
		if (!docLimpo || docLimpo.length !== 11) return [];

		const { data, error } = await supabaseAdmin
			.from("tse_bens_historico")
			.select("*")
			.eq("cpf_candidato", docLimpo)
			.order("ano_eleicao", { ascending: false });

		if (error) throw error;
		return data || [];
	} catch (e: any) {
		console.warn(
			"[TSE] Erro ao buscar bens históricos no Supabase:",
			e.message || e,
		);
		return [];
	}
}

export async function buscarBensPorNomeTSE(
	nome: string,
): Promise<TseBensHistorico[]> {
	try {
		const tokens = extrairTokensBusca(nome);
		if (tokens.length === 0) return [];

		let query = supabaseAdmin.from("tse_bens_historico").select("*");
		for (const token of tokens) {
			query = query.ilike("nome_candidato", `%${token}%`);
		}

		const { data, error } = await query
			.order("ano_eleicao", { ascending: false })
			.limit(10);

		if (error) throw error;
		return data || [];
	} catch (e: any) {
		console.warn(
			"[TSE] Erro ao buscar bens por nome no Supabase:",
			e.message || e,
		);
		return [];
	}
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

function isCpfValidoParaPersistencia(cpf: string): boolean {
	const limpo = cpf.replace(/\D/g, "");
	return Boolean(limpo && limpo.length === 11 && limpo !== "00000000000");
}

function montarRegistroPrincipal(docLimpo: string, nomePolitico: string, tseData: any) {
	if (!tseData?.patrimonioTotal || tseData.patrimonioTotal <= 0) return null;
	return {
		cpf_candidato: docLimpo,
		nome_candidato: nomePolitico,
		ano_eleicao: tseData.anoEleicao || 2026,
		valor_total: tseData.patrimonioTotal,
		descricao_bens: tseData.bensDeclarados || [],
	};
}

function montarRegistrosHistoricos(docLimpo: string, nomePolitico: string, tseData: any) {
	if (!Array.isArray(tseData?.historicoPatrimonio)) return [];
	return tseData.historicoPatrimonio
		.filter((h: any) => h?.patrimonioTotal > 0 && h.ano !== tseData.anoEleicao)
		.map((h: any) => ({
			cpf_candidato: docLimpo,
			nome_candidato: h.nomeCompleto || nomePolitico,
			ano_eleicao: h.ano,
			valor_total: h.patrimonioTotal,
			descricao_bens: h.bensDeclarados || [],
		}));
}

export async function persistirBensHistoricosTSE(
	cpfLimpo: string,
	nomePolitico: string,
	tseData: any,
): Promise<void> {
	if (!isCpfValidoParaPersistencia(cpfLimpo)) return;
	const docLimpo = cpfLimpo.replace(/\D/g, "");

	try {
		const regPrincipal = montarRegistroPrincipal(docLimpo, nomePolitico, tseData);
		const regHistoricos = montarRegistrosHistoricos(docLimpo, nomePolitico, tseData);
		const registros = regPrincipal ? [regPrincipal, ...regHistoricos] : regHistoricos;

		if (registros.length === 0) return;

		const { error } = await supabaseAdmin
			.from("tse_bens_historico")
			.upsert(registros, { onConflict: "cpf_candidato,ano_eleicao" });
		if (error) console.warn("[TSE] Erro ao persistir bens históricos no Supabase:", error.message);
	} catch (e: any) {
		console.warn("[TSE] Falha ao persistir bens históricos:", e?.message || e);
	}
}

export async function resolverPatrimonioTSE(
	fichaPolitico: any,
	tseData: any,
	cpfLimpo: string,
	nomePolitico: string,
	sendEvent?: (tipo: string, payload: any) => void,
	nomeCivil?: string,
): Promise<void> {
	if (tseData?.patrimonioTotal !== undefined && tseData.patrimonioTotal > 0) {
		aplicarDadosTseNaFicha(fichaPolitico, tseData);
		void persistirBensHistoricosTSE(cpfLimpo, nomePolitico, tseData);
		return;
	}

	let bens =
		cpfLimpo && cpfLimpo !== "00000000000"
			? await buscarBensHistoricoTSE(cpfLimpo)
			: [];

	if (bens.length === 0 && nomeCivil) {
		bens = await buscarBensPorNomeTSE(nomeCivil);
	}

	if (bens.length === 0 && nomePolitico) {
		bens = await buscarBensPorNomeTSE(nomePolitico);
	}

	if (bens.length > 0) {
		aplicarBensCacheNaFicha(fichaPolitico, bens, sendEvent);
	}
}

