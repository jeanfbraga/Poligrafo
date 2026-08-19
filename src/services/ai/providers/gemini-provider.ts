import { LlmProvider, ProviderResponse, LlmProviderError } from "../types";
import { extractAndParseJson, handleFetchError } from "../utils";
import { GEMINI_MODELS } from "../ai-models-config";

export class GeminiProvider implements LlmProvider {
	readonly name = "GEMINI";

	private readonly models = GEMINI_MODELS;

	constructor(private readonly apiKey: string | undefined) {}

	async generate(
		systemPrompt: string,
		userPrompt: string,
		expectedRootKey: string,
		timeoutMs: number = 10000,
	): Promise<ProviderResponse> {
		if (!this.apiKey) {
			throw new LlmProviderError("GEMINI_API_KEY ausente", "AUTH_ERROR", "nenhum");
		}

		for (const model of this.models) {
			try {
				const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
				const res = await fetch(endpoint, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						contents: [
							{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
						],
						generationConfig: {
							responseMimeType: "application/json",
							temperature: 0.1,
						},
					}),
					signal: AbortSignal.timeout(timeoutMs),
				});

				if (res.ok) {
					const data = await res.json();
					const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
					if (!textResponse) throw new Error("Retorno vazio do Gemini");

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
