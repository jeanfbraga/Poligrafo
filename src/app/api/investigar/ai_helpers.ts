import { AiOrchestrator } from "../../../services/ai/llm-orchestrator";
import { GroqProvider } from "../../../services/ai/providers/groq-provider";
import { OpenRouterProvider } from "../../../services/ai/providers/openrouter-provider";
import { GeminiProvider } from "../../../services/ai/providers/gemini-provider";
import { 
	construirPromptDespesas, 
	construirPromptEmendas, 
	construirPromptOSINT 
} from "../../../services/ai/prompt-builder";
import { 
	fallbackL4HeuristicaMatematica, 
	fallbackL4Emendas, 
	fallbackL4OSINT,
	aplicarSafetyNetOSINT 
} from "../../../services/ai/heuristics-engine";
import {
	type AvaliacaoIA,
	criarValidadorAvaliacoes,
	idsDoLote,
	ROTULO_NAO_AVALIADO,
	validarAvaliacoes,
} from "../../../services/ai/contratos/avaliacoes";
import { documentoParaPrompt, soDigitos } from "@/lib/documento";

function getOrchestrator(isDev: boolean) {
	const providers = [];
	
	if (process.env.GROQ_API_KEY && !isDev) {
		providers.push(new GroqProvider(process.env.GROQ_API_KEY));
	}
	
	if (process.env.OPENROUTER_API_KEY && !isDev) {
		providers.push(new OpenRouterProvider(process.env.OPENROUTER_API_KEY));
	}
	
	if (process.env.GEMINI_API_KEY && !isDev) {
		providers.push(new GeminiProvider(process.env.GEMINI_API_KEY));
	}
	
	return new AiOrchestrator(providers);
}

/**
 * Notas por chamada de IA. O prompt de 60 notas tem ~7 mil tokens de entrada (+ ~6 mil de resposta),
 * acima do limite por pedido do plano gratuito da Groq (HTTP 413) e lento demais para o timeout do Gemini.
 * Com 20 notas o pedido fica em ~4,5 mil tokens de entrada.
 */
export const TAMANHO_LOTE_IA = 20;

export function dividirEmLotes<T>(itens: T[], tamanho: number = TAMANHO_LOTE_IA): T[][] {
	const lotes: T[][] = [];
	for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
	return lotes;
}

/** Analisa as despesas em lotes pequenos; um lote que falha cai na heurística local só para ele. */
export async function analisarLoteComInteligencia(
	despesas: any[],
	ufPolitico: string,
	listaDoadores: string[],
	esferaPolitico: string,
	casaLegislativa?: string,
	normaLocal?: string,
) {
	if (!despesas || despesas.length === 0) return [];
	const resultado: any[] = [];
	for (const lote of dividirEmLotes(despesas)) {
		resultado.push(
			...(await analisarLoteUnico(lote, ufPolitico, listaDoadores, esferaPolitico, casaLegislativa, normaLocal)),
		);
	}
	return resultado;
}

function iaDesligadaNoDev(): boolean {
	return process.env.NODE_ENV === "development" && process.env.POLIGRAFO_AI_IN_DEV !== "true";
}

/** Avaliações válidas da resposta (o provedor já conferiu a cobertura mínima). */
function avaliacoesDaResposta(
	response: { parsedJson?: unknown } | null,
	chave: string,
	ids: string[],
): Map<string, AvaliacaoIA> | null {
	if (!response?.parsedJson) return null;
	const r = validarAvaliacoes(response.parsedJson, chave, ids, 0);
	return r.success ? r.data : null;
}

function marcarNaoAvaliado(item: any): any {
	return {
		...item,
		avaliado_por_ia: false,
		motivo_ia: `[${ROTULO_NAO_AVALIADO} — regra local] ${item?.motivo_ia ?? ""}`.trim(),
	};
}

/**
 * Junta as avaliações da IA aos itens originais pelo id. Item que a IA não
 * devolveu recebe a regra local (calculada sobre o lote inteiro, para as
 * medianas não mudarem) e a marca "não avaliado pela IA" — nunca "seguro".
 */
function mesclarComRegraLocal(
	itens: any[],
	ids: string[],
	avaliacoes: Map<string, AvaliacaoIA>,
	aplicar: (item: any, a: AvaliacaoIA) => any,
	regraLocal: (todos: any[]) => any[],
): any[] {
	const faltam = ids.some((id) => !avaliacoes.has(id));
	const locais = faltam ? regraLocal(itens) : [];
	return itens.map((item, idx) => {
		const a = avaliacoes.get(ids[idx]);
		return a ? aplicar(item, a) : marcarNaoAvaliado(locais[idx]);
	});
}

function aplicarAvaliacaoItem(original: any, a: AvaliacaoIA, semApontamento: string): any {
	return {
		...original,
		avaliado_por_ia: true,
		score_letalidade: a.score_letalidade,
		classificacao: a.classificacao,
		enquadramento_normativo: a.enquadramento_normativo ?? "-",
		fundamentacao_tecnica: a.fundamentacao_tecnica ?? semApontamento,
		motivo_ia: `[IA] ${a.motivo_ia}`,
	};
}

async function analisarLoteUnico(
	despesas: any[],
	ufPolitico: string,
	listaDoadores: string[],
	esferaPolitico: string,
	casaLegislativa?: string,
	normaLocal?: string,
) {
	const ids = idsDoLote(despesas.length, "d");
	const doadores = new Set((listaDoadores ?? []).map(soDigitos));
	const loteOtimizado = despesas.map((d: any, i: number) => ({
		id: ids[i],
		// LGPD: CPF de fornecedor pessoa física vai mascarado; a lista de doadores não vai.
		cnpj: documentoParaPrompt(d.cnpjCpfFornecedor),
		fornecedorEhDoador: doadores.has(soDigitos(d.cnpjCpfFornecedor)),
		fornecedor: d.nomeFornecedor,
		tipo: d.tipoDespesa,
		valor: d.valorDocumento,
		data: d.dataDocumento,
	}));

	const promptText = construirPromptDespesas(
		esferaPolitico,
		ufPolitico,
		listaDoadores,
		loteOtimizado,
		casaLegislativa,
		normaLocal,
	);

	const response = await getOrchestrator(iaDesligadaNoDev()).processPipeline(
		"You MUST reply ONLY with a valid JSON OBJECT, never raw text. The JSON object must contain the root key 'despesas_avaliadas' pointing to the array. You MUST include ALL items from the input, each with its original 'id'.",
		promptText,
		"despesas_avaliadas",
		12000, // 12s inicial
		criarValidadorAvaliacoes("despesas_avaliadas", ids),
	);

	const regraLocal = (todas: any[]) =>
		fallbackL4HeuristicaMatematica(todas, listaDoadores, esferaPolitico, casaLegislativa);
	const avaliacoes = avaliacoesDaResposta(response, "despesas_avaliadas", ids);
	if (!avaliacoes) return regraLocal(despesas);

	return mesclarComRegraLocal(despesas, ids, avaliacoes,
		(o, a) => aplicarAvaliacaoItem(o, a, "Sem maiores apontamentos da IA."), regraLocal);
}


export async function analisarEmendasComInteligencia(
	emendas: any[],
	ufPolitico: string,
	esferaPolitico: string,
	casaLegislativa?: string,
	normaLocal?: string,
) {
	if (!emendas || emendas.length === 0) return [];

	const ids = idsDoLote(emendas.length, "e");
	const loteOtimizado = emendas.map((e: any, i: number) => ({
		id: ids[i],
		codigo: e.codigoEmenda,
		tipo: e._riscoTipo?.label || "Emenda Individual",
		funcao: e.funcao || e.subfuncao,
		localidade: e.localidadeDoGasto,
		valorEmpenhado: e._empenhado,
		valorPago: e._totalEfetivamentePago,
		percentualExecucao: e._percentualExecucao,
	}));

	const promptText = construirPromptEmendas(esferaPolitico, ufPolitico, loteOtimizado, casaLegislativa, normaLocal);

	const response = await getOrchestrator(iaDesligadaNoDev()).processPipeline(
		"You MUST reply ONLY with a valid JSON OBJECT. Root must be 'emendas_avaliadas' containing the array. You MUST include ALL items from the input, each with its original 'id'.",
		promptText,
		"emendas_avaliadas",
		12000,
		criarValidadorAvaliacoes("emendas_avaliadas", ids),
	);

	const avaliacoes = avaliacoesDaResposta(response, "emendas_avaliadas", ids);
	if (!avaliacoes) return fallbackL4Emendas(emendas);

	return mesclarComRegraLocal(emendas, ids, avaliacoes,
		(o, a) => aplicarAvaliacaoItem(o, a, "Análise via IA sem achados."), fallbackL4Emendas);
}

function resumirNoParaIA(n: any): any {
	if (n.type === "PESSOA") return null;
	if (n._isContextOnly) return n;
	return {
		id: n.id,
		tipo_no: n.type,
		rotulo: n.data?.label,
		descricao: n.data?.objeto || n.data?.situacao,
		valor_monetario: n.data?.valor || n.data?.capitalSocial || 0,
		// LGPD: CPF de pessoa física (ex.: sócio) vai mascarado para o provedor de IA.
		cpf_cnpj: documentoParaPrompt(n.data?.codigo || n.data?.cnpj || "N/A"),
	};
}

/** Nó da malha com a avaliação da IA, ou intacto e marcado quando a IA não avaliou. */
function aplicarAvaliacaoNo(orig: any, a: AvaliacaoIA | undefined): any {
	if (!a) {
		return {
			...orig,
			data: {
				...orig.data,
				avaliado_por_ia: false,
				fundamentacao_tecnica: orig.data?.fundamentacao_tecnica ?? `${ROTULO_NAO_AVALIADO}.`,
			},
		};
	}
	return {
		...orig,
		data: {
			...orig.data,
			avaliado_por_ia: true,
			score_letalidade: a.score_letalidade,
			classificacao: a.classificacao,
			enquadramento_normativo: a.enquadramento_normativo ?? "-",
			fundamentacao_tecnica: a.fundamentacao_tecnica ?? "Sem achados da IA.",
			motivo_ia: a.motivo_ia || orig.data?.motivo_ia,
		},
	};
}

export async function analisarMalhaOsintComInteligencia(
	malhaOsint: any[],
	ufPolitico: string,
	esferaPolitico: string = "FEDERAL",
	casaLegislativa?: string,
	normaLocal?: string,
) {
	if (!malhaOsint || malhaOsint.length === 0) return [];

	const loteOtimizado = malhaOsint.map(resumirNoParaIA).filter(Boolean);
	if (loteOtimizado.length === 0) return [];

	const avaliaveis = malhaOsint.filter((n: any) => !n._isContextOnly && n.type !== "PESSOA");
	const ids = avaliaveis.map((n: any) => String(n.id));
	const promptText = construirPromptOSINT(ufPolitico, loteOtimizado, esferaPolitico, casaLegislativa, normaLocal);

	const response = await getOrchestrator(iaDesligadaNoDev()).processPipeline(
		"You MUST reply ONLY with a valid JSON OBJECT. Root must be 'avaliacoes' containing the array, one item per node 'id'.",
		promptText,
		"avaliacoes",
		12000,
		criarValidadorAvaliacoes("avaliacoes", ids),
	);

	const avaliacoes = avaliacoesDaResposta(response, "avaliacoes", ids);
	if (!avaliacoes) return fallbackL4OSINT(malhaOsint);

	const resultado = malhaOsint
		.filter((n: any) => !n._isContextOnly)
		.map((orig: any) => aplicarAvaliacaoNo(orig, avaliacoes.get(String(orig.id))));
	return aplicarSafetyNetOSINT(resultado, malhaOsint);
}

/** A tradução de sanções precisa ao menos do resumo; gravidade fica entre 0 e 100. */
function validarTraducaoSancao(json: unknown): { success: true } | { success: false; error: string } {
	const r = json as Record<string, unknown> | null;
	if (typeof r?.resumo_improbidade !== "string" || !r.resumo_improbidade.trim()) {
		return { success: false, error: "sem resumo_improbidade" };
	}
	const gravidade = Number(r.gravidade);
	if (!Number.isFinite(gravidade) || gravidade < 0 || gravidade > 100) {
		return { success: false, error: "gravidade fora de 0-100" };
	}
	return { success: true };
}

export async function traduzirJuridiquesSancoes(sancoes: any[]) {
	try {
		const textosBrutos = sancoes
			.slice(0, 3)
			.map((s: any) => s.fundamentacaoLegal || s.descricaoFundamentacao || s.texto || JSON.stringify(s));

		const promptTexto = [
			"Você atua como Perito Criminal e Analista Jurídico de sanções públicas.",
			"Sua tarefa é converter despachos, decisões e fundamentações em linguagem leiga, precisa e juridicamente responsável.",
			"",
			"RETORNE APENAS JSON VÁLIDO NO FORMATO:",
			'{"tipo_sancao":"TCU | JUDICIARIO | CGU | TSE | OUTRO","tipo_crime":"...","dispositivo_legal":"...","status_juridico":"INVESTIGADO | CONDENADO | ABSOLVIDO | ACORDO | PRESCRITO","resumo_improbidade":"...","gravidade":0}',
			"",
			"DESPACHOS PARA ANÁLISE:",
			JSON.stringify(textosBrutos),
		].join("\n");

		const response = await getOrchestrator(iaDesligadaNoDev()).processPipeline(
			"You MUST reply ONLY with a valid JSON OBJECT.",
			promptTexto,
			"resumo_improbidade",
			8000,
			validarTraducaoSancao,
		);

		if (response?.parsedJson) {
			return response.parsedJson;
		}
	} catch (e) {
		console.error("[TRADUTOR JURIDICO IA] Erro:", e);
	}
	return null;
}
