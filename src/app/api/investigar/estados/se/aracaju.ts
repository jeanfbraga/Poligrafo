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
export async function buscarDespesasAracaju(
	identificador: string,
	nomeParaBusca?: string,
	municipioUri?: string,
	casa?: string,
): Promise<any[]> {
	console.log(
		`[ARACAJU / SE] Buscando despesas para ${nomeParaBusca || identificador} (${casa || "CMA / PREFEITURA"})`,
	);

	const despesasFormatadas: any[] = [];
	const nomeLimpo = (nomeParaBusca || "").trim();

	// ─── 1. Consulta no Supabase (Cache / ETL do GitHub Actions) ───
	if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
		try {
			const registrosEncontrados: any[] = [];

			// A. Busca direta por tokens do nome do parlamentar com valor > 0
			if (nomeLimpo) {
				const tokens = nomeLimpo
					.replace(/\([^)]*\)/g, " ")
					.split(/\s+/)
					.map((t) => t.trim())
					.filter((t) => t.length >= 3);

				const orConds = tokens.flatMap((t) => [
					`parlamentar_nome.ilike.%${t}%`,
					`fornecedor_nome.ilike.%${t}%`,
				]);

				if (orConds.length > 0) {
					const { data: diretos } = await supabaseAdmin
						.from("aracaju_despesas")
						.select("*")
						.or(orConds.join(","))
						.gt("valor", 0)
						.order("valor", { ascending: false })
						.limit(40);

					if (diretos && diretos.length > 0) {
						registrosEncontrados.push(...diretos);
					}
				}
			}

			// B. Se for vereador/CMA ou se tiver poucos registros diretos, agrega os contratos da Câmara Municipal de Aracaju (CMA)
			const isVereadorOuCMA = !casa || casa.includes("CAMARA") || casa.includes("VEREADOR");
			if (isVereadorOuCMA && registrosEncontrados.length < 20) {
				const { data: cmaContratos } = await supabaseAdmin
					.from("aracaju_despesas")
					.select("*")
					.eq("orgao", "CMA")
					.gt("valor", 0)
					.order("valor", { ascending: false })
					.limit(30);

				if (cmaContratos && cmaContratos.length > 0) {
					for (const c of cmaContratos) {
						if (!registrosEncontrados.some((r) => r.id === c.id)) {
							registrosEncontrados.push(c);
						}
					}
				}
			}

			if (registrosEncontrados.length > 0) {
				console.log(
					`[ARACAJU / SE] Cache Hit no Supabase: ${registrosEncontrados.length} registros com valor > 0 encontrados.`,
				);
				for (const r of registrosEncontrados) {
					const valorNum = parseFloat(String(r.valor || "0")) || 0;
					if (valorNum <= 0) continue;

					despesasFormatadas.push({
						tipoDespesa: `${r.categoria_despesa || "Contrato"} (${r.orgao})`,
						nomeFornecedor: r.fornecedor_nome || "FORNECEDOR ARACAJU",
						fornecedor: r.fornecedor_nome || "FORNECEDOR ARACAJU",
						cnpjCpfFornecedor: r.fornecedor_cnpj_cpf || "13149954000185",
						cnpjFornecedor: r.fornecedor_cnpj_cpf || "13149954000185",
						valorDocumento: valorNum,
						valorLiquido: valorNum,
						dataDocumento: r.data_despesa || "",
						descricao: r.descricao || `[${r.orgao}] Documento: ${r.numero_documento || "N/A"}`,
						urlDocumento: r.fonte_url || "https://transparencia.aracaju.se.gov.br",
					});
				}

				if (despesasFormatadas.length > 0) {
					return despesasFormatadas;
				}
			}
		} catch (e: any) {
			console.warn(
				`[ARACAJU / SE] Falha ao consultar Supabase (degradando para live):`,
				e.message,
			);
		}
	}

	// ─── 2. Fallback Live: APIs de Aracaju e CMA ───
	try {
		const promessas: Promise<any>[] = [];

		// Se o município for Aracaju ou escopo geral de SE, consulta TCE-SE
		const municipioAlvo = municipioUri || "aracaju";
		promessas.push(buscarDespesasSE(municipioAlvo, casa || "CMA"));

		// Consulta ao Proxy OSINT para cruzamento com bases federais
		promessas.push(buscarProxyOsint(identificador, nomeParaBusca));

		const resultados = await Promise.allSettled(promessas);

		for (const res of resultados) {
			if (res.status === "fulfilled" && Array.isArray(res.value)) {
				despesasFormatadas.push(...res.value);
			} else if (
				res.status === "fulfilled" &&
				res.value?.despesasFederais &&
				Array.isArray(res.value.despesasFederais)
			) {
				despesasFormatadas.push(...res.value.despesasFederais);
			}
		}
	} catch (e: any) {
		console.warn(`[ARACAJU / SE] Erro no fallback live:`, e.message);
	}

	return despesasFormatadas;
}
