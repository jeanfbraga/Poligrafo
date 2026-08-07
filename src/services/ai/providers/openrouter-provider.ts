import { LlmProvider, ProviderResponse, LlmProviderError } from "../types";
import { extractAndParseJson, handleFetchError } from "../utils";

export class OpenRouterProvider implements LlmProvider {
	readonly name = "OPENROUTER";

	private readonly models = [
		"google/gemma-4-31b-it:free",
		"google/gemma-4-26b-a4b-it:free",
		"nvidia/nemotron-3-super-120b-a12b:free",
		"openai/gpt-oss-20b:free",
		"nvidia/nemotron-nano-9b-v2:free",
	];

	constructor(private readonly apiKey: string | undefined) {}

	async generate(
		systemPrompt: string,
		userPrompt: string,
		expectedRootKey: string,
		timeoutMs: number = 10000,
	): Promise<ProviderResponse> {
		if (!this.apiKey) {
			throw new LlmProviderError("OPENROUTER_API_KEY ausente", "AUTH_ERROR", "nenhum");
		}

		for (const model of this.models) {
			try {
				const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${this.apiKey}`,
						"HTTP-Referer": "https://poligrafo.app.br",
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
					if (!textResponse) throw new Error("Retorno vazio do OpenRouter");

					const parsedJson = extractAndParseJson(textResponse, [expectedRootKey, "despesas_suspeitas", "emendas_suspeitas", "avaliacoes"]);
					return { modelUsed: model, parsedJson, rawText: textResponse };
				} else {
					const errText = await res.text();
					handleFetchError(res.status, errText, model);
				}
			} catch (e: any) {
				if (e instanceof LlmProviderError && e.type === "AUTH_ERROR") {
					throw e;
				}
				
				if (e.name === "TimeoutError") {
					console.warn(`[${this.name} ${model}] Timeout após ${timeoutMs}ms`);
					continue;
				}

				console.warn(`[${this.name} ${model}] Falhou:`, e.message || e);
			}
		}

		throw new LlmProviderError(`Todos os modelos falharam no provedor ${this.name}`, "UNKNOWN", "varios");
	}
}
