import { LlmProvider, ProviderResponse, LlmProviderError } from "../types";
import { extractAndParseJson, handleFetchError } from "../utils";
import { GROQ_MODELS } from "../ai-models-config";

export class GroqProvider implements LlmProvider {
	readonly name = "GROQ";

	private readonly models = GROQ_MODELS;

	constructor(private readonly apiKey: string | undefined) {}

	async generate(
		systemPrompt: string,
		userPrompt: string,
		expectedRootKey: string,
		timeoutMs: number = 15000,
	): Promise<ProviderResponse> {
		if (!this.apiKey) {
			throw new LlmProviderError("GROQ_API_KEY ausente", "AUTH_ERROR", "nenhum");
		}

		for (const model of this.models) {
			try {
				const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model: model,
						messages: [
							{ role: "system", content: systemPrompt },
							{ role: "user", content: userPrompt },
						],
						temperature: 0.1,
						response_format: { type: "json_object" },
					}),
					signal: AbortSignal.timeout(timeoutMs),
				});

				if (res.ok) {
					const data = await res.json();
					const textResponse = data.choices[0]?.message?.content;
					if (!textResponse) throw new Error("Retorno vazio do Groq");

					const parsedJson = extractAndParseJson(textResponse, [expectedRootKey, "despesas_suspeitas", "emendas_suspeitas", "avaliacoes"]);
					return { modelUsed: model, parsedJson, rawText: textResponse };
				} else {
					const errText = await res.text();
					handleFetchError(res.status, errText, model);
				}
			} catch (e: any) {
				// Re-throw se for um erro fatal de provedor (Auth)
				if (e instanceof LlmProviderError && e.type === "AUTH_ERROR") {
					throw e;
				}
				
				if (e.name === "TimeoutError") {
					console.warn(`[${this.name} ${model}] Timeout após ${timeoutMs}ms`);
					continue;
				}

				console.warn(`[${this.name} ${model}] Falhou:`, e.message || e);
				// Tenta o próximo modelo
			}
		}

		throw new LlmProviderError(`Todos os modelos falharam no provedor ${this.name}`, "UNKNOWN", "varios");
	}
}
