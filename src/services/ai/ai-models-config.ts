/**
 * AI MODELS CONFIGURATION — SINGLE SOURCE OF TRUTH (SSOT)
 * Projeto Polígrafo — Auditoria Cidadã & OSINT
 *
 * Este arquivo centraliza todos os identificadores de modelos de Inteligência Artificial
 * utilizados no projeto. Todos os modelos configurados operam sob políticas de CUSTO ZERO ($0,00)
 * nos planos gratuitos (Free Tier / Developer Tier) dos respectivos fornecedores.
 *
 * PARA DESENVOLVEDORES OPEN SOURCE:
 * Se um provedor descontinuar um modelo ou lançar uma versão mais recente, adicione ou
 * altere o identificador APENAS neste arquivo. Todo o sistema herdará a alteração automaticamente.
 */

// ─── NÍVEL 1: GROQ CLOUD (Developer Free Tier) ───────────────────────────────
// Documentação: https://console.groq.com/docs/models
// Verificado em 02/10/2026 com a chave do projeto (GET /openai/v1/models + chamada real, 0,3–0,5 s).
// Removidos: groq/compound e groq/compound-mini (404 — não existem mais na conta),
// openai/gpt-oss-safeguard-20b (classificador de segurança, não faz triagem JSON e estoura limite),
// allam-2-7b (contexto de 4k tokens: o lote de 60 notas não cabe) e qwen3.6 (substituído pelo 3.8).
export const GROQ_MODELS = [
	"openai/gpt-oss-120b",
	"openai/gpt-oss-20b",
	"qwen/qwen3.8-27b",
] as const;

// ─── NÍVEL 2: OPENROUTER (Free Tier / :free Router) ──────────────────────────
// Documentação: https://openrouter.ai/models?q=free
// O modelo 'openrouter/free' roteia dinamicamente para qualquer modelo gratuito com cota.
// Verificado em 06/10/2026 (`npm run ia:verificar-modelos`): 6 dos 7 :free anteriores
// SUMIRAM do catálogo (llama-3.3-70b, gemini-2.0-flash-exp, deepseek-r1, gpt-oss-20b,
// qwen-2.5-coder, llama-3.1-8b). O limite :free é da CONTA (429 pausa o provedor todo).
export const OPENROUTER_MODELS = [
	"openrouter/free",
	"google/gemma-4-26b-a4b-it:free",
] as const;

// ─── NÍVEL 3: GOOGLE GEMINI & GEMMA (Google AI Studio Free Tier) ─────────────
// Documentação: https://ai.google.dev/pricing
// Franquia gratuita: 15 RPM / 1.500 RPD por chave gratuita de API no Google AI Studio.
// A ORDEM IMPORTA: o provedor tenta em sequência com timeout. Os "lite" respondem em ~0,5–1,3 s;
// os "flash" com raciocínio levam 16–24 s e estouram o timeout, então ficam por último.
// Verificado em 02/10/2026. Removidos: gemini-2.0-flash e -2.0-flash-lite (404, descontinuados),
// gemma-3-27b-it (não listado mais) e gemini-3.8-flash (503 intermitente na verificação).
// 06/10/2026: lites ok; gemma-4-31b-it deu HTTP 500 e os "flash" passaram de 25 s (ficam no fim).
// `gemini-flash-lite-latest` é o apelido estável da Google para o lite mais novo.
export const GEMINI_MODELS = [
	"gemini-2.5-flash-lite",
	"gemini-flash-lite-latest",
	"gemini-3.5-flash-lite",
	"gemini-3.1-flash-lite",
	"gemini-3.6-flash",
	"gemma-4-31b-it",
	"gemini-2.5-flash",
	"gemini-3.5-flash",
] as const;

// ─── MODELOS DE VISÃO COMPUTACIONAL / OCR (ETL CMRJ & Documentos Escaneados) ───
// Usados exclusivamente em scripts batch offline quando não há camada de texto nativa.
export const VISION_MODELS = {
	gemini: [
		"gemini-2.5-flash-lite",
		"gemini-3.5-flash-lite",
		"gemini-2.5-flash",
	],
	openrouter: ["openrouter/free"],
	// O Groq não oferece mais modelo de visão na conta (06/10/2026): `llama-3.2-11b-vision-preview`
	// foi descontinuado. O OCR pula esta etapa quando o valor é null.
	groq: null as string | null,
} as const;

export type GroqModel = (typeof GROQ_MODELS)[number];
export type OpenRouterModel = (typeof OPENROUTER_MODELS)[number];
export type GeminiModel = (typeof GEMINI_MODELS)[number];
