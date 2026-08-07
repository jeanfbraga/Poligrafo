import { LlmProvider, ProviderResponse, LlmProviderError } from "./types";

export class AiOrchestrator {
	constructor(private readonly providers: LlmProvider[]) {}

	/**
	 * Executa o pipeline em cascata iterando sobre a lista de provedores.
	 * Utiliza lógica de Fail-Fast (Circuit Breaker) para pular provedores 
	 * caso retornem erros fatais de autenticação ou quota.
	 */
	async processPipeline(
		systemPrompt: string,
		userPrompt: string,
		expectedRootKey: string,
		initialTimeoutMs: number = 15000,
	): Promise<ProviderResponse | null> {
		let currentTimeout = initialTimeoutMs;

		for (const provider of this.providers) {
			console.log(`[AI ORQUESTRADOR] Tentando provedor: ${provider.name}...`);
			
			try {
				const response = await provider.generate(
					systemPrompt, 
					userPrompt, 
					expectedRootKey, 
					currentTimeout
				);
				console.log(`[AI ORQUESTRADOR] Sucesso usando ${provider.name} (${response.modelUsed})`);
				return response;
			} catch (error: any) {
				// Verifica se o erro é fatal para o provedor (Fail-Fast)
				if (error instanceof LlmProviderError) {
					if (error.type === "AUTH_ERROR") {
						console.error(`[AI ORQUESTRADOR] FAIL-FAST: Erro de credenciais/saldo no provedor ${provider.name}. Pulando provedor inteiro.`, error.message);
					} else if (error.type === "RATE_LIMIT") {
						console.error(`[AI ORQUESTRADOR] FAIL-FAST: Rate limit atingido no provedor ${provider.name}. Pulando provedor.`, error.message);
					} else {
						console.error(`[AI ORQUESTRADOR] Provedor ${provider.name} esgotou os modelos ou falhou:`, error.message);
					}
				} else {
					console.error(`[AI ORQUESTRADOR] Erro não mapeado no provedor ${provider.name}:`, error);
				}

				// Reduz o timeout para provedores de fallback subsequentes para evitar prender a thread
				if (currentTimeout > 8000) {
					currentTimeout = 8000; 
				}
			}
		}

		console.warn("[AI ORQUESTRADOR] Todas as LLMs falharam em todos os provedores.");
		return null;
	}
}
