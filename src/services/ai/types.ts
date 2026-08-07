export type LlmProviderErrorType = "AUTH_ERROR" | "RATE_LIMIT" | "PAYLOAD_TOO_LARGE" | "TIMEOUT" | "VALIDATION_ERROR" | "UNKNOWN";

export class LlmProviderError extends Error {
	constructor(
		message: string,
		public type: LlmProviderErrorType,
		public model: string,
	) {
		super(message);
		this.name = "LlmProviderError";
	}
}

export interface ProviderResponse {
	modelUsed: string;
	parsedJson: any;
	rawText?: string;
}

export interface LlmProvider {
	/**
	 * Nome do provedor (ex: GROQ, OPENROUTER, GEMINI)
	 */
	readonly name: string;

	/**
	 * Tenta gerar uma resposta estruturada em JSON usando os modelos do provedor em cascata.
	 * O provedor deve iterar internamente pelos seus modelos. Se um erro fatal for encontrado
	 * (ex: falta de saldo, autenticação), ele deve lançar um LlmProviderError(AUTH_ERROR)
	 * para que o orquestrador aborte este provedor imediatamente.
	 * 
	 * @param systemPrompt O prompt de sistema instruindo o output em JSON
	 * @param userPrompt O prompt contendo o contexto e os dados
	 * @param expectedRootKey A chave raiz que deve ser buscada no JSON retornado
	 * @param timeoutMs Timeout dinâmico por chamada a cada modelo
	 */
	generate(
		systemPrompt: string,
		userPrompt: string,
		expectedRootKey: string,
		timeoutMs?: number,
	): Promise<ProviderResponse>;
}
