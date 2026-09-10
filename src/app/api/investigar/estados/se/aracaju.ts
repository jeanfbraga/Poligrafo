import { supabaseAdmin } from "@/lib/supabase-admin";
import { buscarProxyOsint } from "../../proxy_osint";
import { buscarCpfNoTSE, fetchWithTimeout } from "../../tse";
import { buscarDespesasSE } from "./tce";

// ==========================================
// Extrator NATIVO: Sergipe & Aracaju (CMA e Prefeitura)
// ==========================================

export interface CandidatoMunicipalSE {
	ref: string;
	id: string;
	nome: string;
	cargo: string;
	uf: string;
	isCnpj?: boolean;
	casa: "CAMARA_MUNICIPAL" | "PREFEITURA";
	uri?: string;
}

/**
 * Resolução de candidatos e vereadores no estado de Sergipe.
 * Prioriza busca de vereadores (cargo 13) e prefeitos (cargo 11) no TSE.
 */
export async function buscarMunicipalSE(
	nomeBuscado: string,
): Promise<CandidatoMunicipalSE[]> {
	const termo = nomeBuscado.toLowerCase().trim();
	console.log(`[>> MUNICIPAL SE ENTRY] buscarMunicipalSE chamado para: ${nomeBuscado}`);
	const resultados: CandidatoMunicipalSE[] = [];

	// 1. Tenta achar Vereador (13)
	let tseResult = await buscarCpfNoTSE(termo, "SE", "13");
	let tipoCargo: "CAMARA_MUNICIPAL" | "PREFEITURA" = "CAMARA_MUNICIPAL";
	let tituloCargo = "Vereador";

	// 2. Se não achar, tenta Prefeito (11)
	if (!tseResult) {
		tseResult = await buscarCpfNoTSE(termo, "SE", "11");
		if (tseResult) {
			tipoCargo = "PREFEITURA";
			tituloCargo = "Prefeito";
		}
	}

	if (tseResult) {
		const nomeCompleto = tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
		const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
		const nomeExibicao =
			nomeUrna && nomeUrna !== nomeCompleto
				? `${nomeCompleto} (${nomeUrna})`
				: nomeCompleto;

		resultados.push({
			ref: `SE:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
			id: tseResult.documentoPrincipal,
			nome: nomeExibicao,
			cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, " ").toUpperCase()}`,
			uf: "SE",
			isCnpj: tseResult.isCnpj,
			casa: tipoCargo,
			uri: tseResult.municipio,
		});
	}

	return resultados;
}

/**
 * Busca despesas, contratos e verbas de Aracaju (CMA & Prefeitura).
 * Estratégia Híbrida:
 * 1. Consulta o Supabase (tabela aracaju_despesas populada pelo GitHub Actions ETL)
 * 2. Se não houver dados no banco, faz fallback para extração live
 * 3. Se necessário, consolida com TCE-SE e Proxy OSINT
 */
function montarCondicoesBuscaNome(nomeLimpo: string): string[] {
	if (!nomeLimpo) return [];
	const tokens = nomeLimpo
		.replace(/\([^)]*\)/g, " ")
		.split(/\s+/)
		.map((t) => t.trim())
		.filter((t) => t.length >= 3);
	return tokens.flatMap((t) => [
		`parlamentar_nome.ilike.%${t}%`,
		`fornecedor_nome.ilike.%${t}%`,
	]);
}

async function buscarRegistrosDiretos(nomeLimpo: string): Promise<any[]> {
	const orConds = montarCondicoesBuscaNome(nomeLimpo);
	if (orConds.length === 0) return [];
	const { data } = await supabaseAdmin
		.from("aracaju_despesas")
		.select("*")
		.or(orConds.join(","))
		.gt("valor", 0)
		.order("valor", { ascending: false })
		.limit(40);
	return data || [];
}

async function buscarContratosCma(): Promise<any[]> {
	const { data } = await supabaseAdmin
		.from("aracaju_despesas")
		.select("*")
		.eq("orgao", "CMA")
		.gt("valor", 0)
		.order("valor", { ascending: false })
		.limit(30);
	return data || [];
}

function fallbackString(val: any, def: string): string {
	return val ? String(val) : def;
}

function extrairFonteUrl(fonteUrl: any): string | null {
	if (!fonteUrl || typeof fonteUrl !== "string") return null;
	return fonteUrl.includes("/api/api/") ? null : fonteUrl;
}

function formatarRegistroAracaju(r: any): any | null {
	const valorNum = Number(r.valor) || 0;
	if (valorNum <= 0) return null;
	const cat = fallbackString(r.categoria_despesa, "Contrato");
	const org = fallbackString(r.orgao, "CMA");
	const forn = fallbackString(r.fornecedor_nome, "FORNECEDOR ARACAJU");
	const doc = fallbackString(r.fornecedor_cnpj_cpf, "13149954000185");
	const num = r.numero_documento || null;
	const desc = r.descricao || `[${org}] Documento: ${num || "N/A"}`;
	return {
		tipoDespesa: `${cat} (${org})`,
		nomeFornecedor: forn,
		fornecedor: forn,
		cnpjCpfFornecedor: doc,
		cnpjFornecedor: doc,
		valorDocumento: valorNum,
		valorLiquido: valorNum,
		dataDocumento: r.data_despesa || "",
		numeroDocumento: num,
		orgao: org,
		modalidade: cat,
		descricao: desc,
		urlDocumento: extrairFonteUrl(r.fonte_url),
	};
}

async function buscarDespesasSupabaseAracaju(nomeLimpo: string, casa?: string): Promise<any[]> {
	if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
	try {
		const registros = await buscarRegistrosDiretos(nomeLimpo);
		const isVereadorOuCMA = !casa || casa.includes("CAMARA") || casa.includes("VEREADOR");
		if (isVereadorOuCMA && registros.length < 20) {
			const cmaContratos = await buscarContratosCma();
			for (const c of cmaContratos) {
				if (!registros.some((r) => r.id === c.id)) registros.push(c);
			}
		}
		return registros.map(formatarRegistroAracaju).filter((item): item is NonNullable<typeof item> => item !== null);
	} catch (e: any) {
		console.warn(`[ARACAJU / SE] Falha ao consultar Supabase (degradando para live):`, e.message);
		return [];
	}
}

async function buscarFallbackLiveAracaju(identificador: string, nomeParaBusca?: string, municipioUri?: string, casa?: string): Promise<any[]> {
	try {
		const municipioAlvo = municipioUri || "aracaju";
		const resultados = await Promise.allSettled([
			buscarDespesasSE(municipioAlvo, casa || "CMA"),
			buscarProxyOsint(identificador, nomeParaBusca),
		]);
		const despesas: any[] = [];
		for (const res of resultados) {
			if (res.status !== "fulfilled") continue;
			if (Array.isArray(res.value)) {
				despesas.push(...res.value);
			} else if (Array.isArray(res.value?.despesasFederais)) {
				despesas.push(...res.value.despesasFederais);
			}
		}
		return despesas;
	} catch (e: any) {
		console.warn(`[ARACAJU / SE] Erro no fallback live:`, e.message);
		return [];
	}
}

export async function buscarDespesasAracaju(
	identificador: string,
	nomeParaBusca?: string,
	municipioUri?: string,
	casa?: string,
): Promise<any[]> {
	console.log(`[ARACAJU / SE] Buscando despesas para ${nomeParaBusca || identificador} (${casa || "CMA / PREFEITURA"})`);
	const nomeLimpo = (nomeParaBusca || "").trim();
	const cacheSupabase = await buscarDespesasSupabaseAracaju(nomeLimpo, casa);
	if (cacheSupabase.length > 0) {
		console.log(`[ARACAJU / SE] Cache Hit no Supabase: ${cacheSupabase.length} registros com valor > 0.`);
		return cacheSupabase;
	}
	return buscarFallbackLiveAracaju(identificador, nomeParaBusca, municipioUri, casa);
}
