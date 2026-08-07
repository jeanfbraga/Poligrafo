import { LlmProviderError } from "./types";

export function extractAndParseJson(textResponse: string, expectedRootKeys?: string[]): any {
	let cleanText = textResponse
		.replace(/```json/g, "")
		.replace(/```/g, "")
		.trim();

	const startIdx = cleanText.indexOf("{");
	const endIdx = cleanText.lastIndexOf("}") + 1;
	
	if (startIdx !== -1 && endIdx !== -1) {
		cleanText = cleanText.substring(startIdx, endIdx);
	}

	try {
		const parsedObj = JSON.parse(cleanText);
		
		// Se foram passadas chaves esperadas, buscamos na raiz
		if (expectedRootKeys && expectedRootKeys.length > 0) {
			for (const key of expectedRootKeys) {
				if (parsedObj[key]) {
					return parsedObj;
				}
			}
			throw new Error(`JSON parsed mas nenhuma chave raiz esperada encontrada: ${expectedRootKeys.join(", ")}`);
		}
		
		return parsedObj;
	} catch (e: any) {
		throw new Error(`Falha ao fazer parse do JSON retornado pelo LLM: ${e.message}`);
	}
}

export function handleFetchError(resStatus: number, errText: string, model: string): never {
	// Classifica o erro baseado no status HTTP para implementar o Fail-Fast
	if (resStatus === 401 || resStatus === 403 || resStatus === 402) {
		// 401 Unauthorized / 402 Payment Required / 403 Forbidden
		// Erro fatal de auth/saldo. Abortar provedor.
		throw new LlmProviderError(`Erro de Autenticação/Saldo HTTP ${resStatus}: ${errText}`, "AUTH_ERROR", model);
	}
	if (resStatus === 429) {
		// Rate limit. Normalmente abortaríamos o modelo e talvez o provedor se for rate limit global.
		throw new LlmProviderError(`Rate Limit Atingido HTTP ${resStatus}: ${errText}`, "RATE_LIMIT", model);
	}
	if (resStatus === 413) {
		throw new LlmProviderError(`Payload muito grande HTTP ${resStatus}`, "PAYLOAD_TOO_LARGE", model);
	}
	if (resStatus === 400) {
		throw new LlmProviderError(`Erro de Validação/Bad Request HTTP ${resStatus}: ${errText}`, "VALIDATION_ERROR", model);
	}
	throw new LlmProviderError(`Erro HTTP ${resStatus}: ${errText}`, "UNKNOWN", model);
}
