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
// Os modelos com sufixo ':free' garantem custo $0,00 permanente na chamada de API.
export const OPENROUTER_MODELS = [
	"openrouter/free",
	"meta-llama/llama-3.3-70b-instruct:free",
	"google/gemini-2.0-flash-exp:free",
	"deepseek/deepseek-r1:free",
	"openai/gpt-oss-20b:free",
	"qwen/qwen-2.5-coder-32b-instruct:free",
	"meta-llama/llama-3.1-8b-instruct:free",
] as const;

// ─── NÍVEL 3: GOOGLE GEMINI & GEMMA (Google AI Studio Free Tier) ─────────────
// Documentação: https://ai.google.dev/pricing
// Franquia gratuita: 15 RPM / 1.500 RPD por chave gratuita de API no Google AI Studio.
// A ORDEM IMPORTA: o provedor tenta em sequência com timeout. Os "lite" respondem em ~0,5–1,3 s;
// os "flash" com raciocínio levam 16–24 s e estouram o timeout, então ficam por último.
// Verificado em 02/10/2026. Removidos: gemini-2.0-flash e -2.0-flash-lite (404, descontinuados),
// gemma-3-27b-it (não listado mais) e gemini-3.8-flash (503 intermitente na verificação).
export const GEMINI_MODELS = [
	"gemini-2.5-flash-lite",
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
	openrouter: [
		"openrouter/free",
		"qwen/qwen2.5-vl-72b-instruct:free",
	],
	groq: "llama-3.2-11b-vision-preview",
} as const;

export type GroqModel = (typeof GROQ_MODELS)[number];
export type OpenRouterModel = (typeof OPENROUTER_MODELS)[number];
export type GeminiModel = (typeof GEMINI_MODELS)[number];
