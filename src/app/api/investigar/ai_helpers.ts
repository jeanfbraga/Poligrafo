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

export async function analisarLoteComInteligencia(
	despesas: any[],
	ufPolitico: string,
	listaDoadores: string[],
	esferaPolitico: string,
	casaLegislativa?: string,
	normaLocal?: string,
) {
	if (!despesas || despesas.length === 0) return [];

	const loteOtimizado = despesas.map((d: any) => ({
		cnpj: d.cnpjCpfFornecedor,
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

	const isDev = process.env.NODE_ENV === "development" && process.env.POLIGRAFO_AI_IN_DEV !== "true";
	const orchestrator = getOrchestrator(isDev);

	const response = await orchestrator.processPipeline(
		"You MUST reply ONLY with a valid JSON OBJECT, never raw text. The JSON object must contain the root key 'despesas_avaliadas' pointing to the array. You MUST include ALL items from the input, not just suspicious ones.",
		promptText,
		"despesas_avaliadas",
		12000 // 12s inicial
	);

	if (response?.parsedJson) {
		const suspeitasArray = response.parsedJson.despesas_avaliadas || response.parsedJson.despesas_suspeitas || [];
		
		return despesas.map((original: any, idx: number) => {
			const avaliacao =
				suspeitasArray.find(
					(a: any) =>
						a.cnpj === original.cnpjCpfFornecedor &&
						Number(a.valor || a.valor_original) === Number(original.valorDocumento),
				) ||
				(suspeitasArray.length === despesas.length ? suspeitasArray[idx] : undefined);
				
			return {
				...original,
				score_letalidade: avaliacao?.score_letalidade ?? 20,
				classificacao: avaliacao?.classificacao ?? "REGULAR_COM_RESSALVA",
				enquadramento_normativo: avaliacao?.enquadramento_normativo ?? "-",
				fundamentacao_tecnica: avaliacao?.fundamentacao_tecnica ?? "Sem maiores apontamentos da IA.",
				motivo_ia: avaliacao ? `[IA] ${avaliacao.motivo_ia}` : "Gasto validado pela IA como seguro.",
			};
		});
	}

	// Fallback L4
	return fallbackL4HeuristicaMatematica(despesas, listaDoadores, esferaPolitico, casaLegislativa);
}


export async function analisarEmendasComInteligencia(
	emendas: any[],
	ufPolitico: string,
	esferaPolitico: string,
	casaLegislativa?: string,
	normaLocal?: string,
) {
	if (!emendas || emendas.length === 0) return [];

	const loteOtimizado = emendas.map((e: any) => ({
		codigo: e.codigoEmenda,
		tipo: e._riscoTipo?.label || "Emenda Individual",
		funcao: e.funcao || e.subfuncao,
		localidade: e.localidadeDoGasto,
		valorEmpenhado: e._empenhado,
		valorPago: e._totalEfetivamentePago,
		percentualExecucao: e._percentualExecucao,
	}));

	const promptText = construirPromptEmendas(esferaPolitico, ufPolitico, loteOtimizado, casaLegislativa, normaLocal);

	const isDev = process.env.NODE_ENV === "development" && process.env.POLIGRAFO_AI_IN_DEV !== "true";
	const orchestrator = getOrchestrator(isDev);

	const response = await orchestrator.processPipeline(
		"You MUST reply ONLY with a valid JSON OBJECT. Root must be 'emendas_avaliadas' containing the array. You MUST include ALL items from the input, not just suspicious ones.",
		promptText,
		"emendas_avaliadas",
		12000
	);

	if (response?.parsedJson) {
		const suspeitasArray = response.parsedJson.emendas_avaliadas || response.parsedJson.emendas_suspeitas || [];
		
		return emendas.map((orig: any, idx: number) => {
			const avaliacao =
				suspeitasArray.find((a: any) => String(a.codigo) === String(orig.codigoEmenda)) ||
				(suspeitasArray.length === emendas.length ? suspeitasArray[idx] : undefined);
				
			return {
				...orig,
				score_letalidade: avaliacao?.score_letalidade ?? 20,
				classificacao: avaliacao?.classificacao ?? "REGULAR_COM_RESSALVA",
				enquadramento_normativo: avaliacao?.enquadramento_normativo ?? "-",
				fundamentacao_tecnica: avaliacao?.fundamentacao_tecnica ?? "Análise via IA sem achados.",
				motivo_ia: avaliacao ? `[IA] ${avaliacao.motivo_ia}` : "Baixo risco apontado pela IA.",
			};
		});
	}

	return fallbackL4Emendas(emendas);
}

export async function analisarMalhaOsintComInteligencia(
	malhaOsint: any[],
	ufPolitico: string,
	esferaPolitico: string = "FEDERAL",
	casaLegislativa?: string,
	normaLocal?: string,
) {
	if (!malhaOsint || malhaOsint.length === 0) return [];

	const loteOtimizado = malhaOsint
		.map((n: any) => {
			if (n.type === "PESSOA") return null;
			if (n._isContextOnly) return n;
			return {
				id: n.id,
				tipo_no: n.type,
				rotulo: n.data?.label,
				descricao: n.data?.objeto || n.data?.situacao,
				valor_monetario: n.data?.valor || n.data?.capitalSocial || 0,
				cpf_cnpj: n.data?.codigo || n.data?.cnpj || "N/A",
			};
		})
		.filter(Boolean);

	if (loteOtimizado.length === 0) return [];

	const promptText = construirPromptOSINT(ufPolitico, loteOtimizado, esferaPolitico, casaLegislativa, normaLocal);

	const isDev = process.env.NODE_ENV === "development" && process.env.POLIGRAFO_AI_IN_DEV !== "true";
	const orchestrator = getOrchestrator(isDev);

	const response = await orchestrator.processPipeline(
		"You MUST reply ONLY with a valid JSON OBJECT. Root must be 'avaliacoes' containing the array.",
		promptText,
		"avaliacoes",
		12000
	);

	if (response?.parsedJson) {
		const avaliacoes = response.parsedJson.avaliacoes || [];
		
		const successResult = malhaOsint
			.filter((n: any) => !n._isContextOnly)
			.map((orig: any) => {
				const avaliacao = avaliacoes.find((a: any) => String(a.id) === String(orig.id));
				return {
					...orig,
					data: {
						...orig.data,
						score_letalidade: avaliacao?.score_letalidade ?? (orig.data.score_letalidade || 20),
						classificacao: avaliacao?.classificacao ?? "SEM_INDICIO_RELEVANTE",
						enquadramento_normativo: avaliacao?.enquadramento_normativo ?? "-",
						fundamentacao_tecnica: avaliacao?.fundamentacao_tecnica ?? "Nó avaliado limpo pela IA.",
						motivo_ia: avaliacao ? avaliacao.motivo_ia : orig.data.motivo_ia,
					},
				};
			});
			
		return aplicarSafetyNetOSINT(successResult, malhaOsint);
	}

	return fallbackL4OSINT(malhaOsint);
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

		const isDev = process.env.NODE_ENV === "development" && process.env.POLIGRAFO_AI_IN_DEV !== "true";
		const orchestrator = getOrchestrator(isDev);

		const response = await orchestrator.processPipeline(
			"You MUST reply ONLY with a valid JSON OBJECT.",
			promptTexto,
			"tipo_sancao",
			8000
		);

		if (response?.parsedJson) {
			return response.parsedJson;
		}
	} catch (e) {
		console.error("[TRADUTOR JURIDICO IA] Erro:", e);
	}
	return null;
}
