/**
 * Catálogo de provedores e modelos de IA — fonte única da verdade.
 *
 * Regra de ouro (decisão de 06/10/2026): SÓ PLANOS GRATUITOS. A capacidade
 * vem de somar PROVEDORES diferentes (uma conta em cada); várias chaves da
 * mesma conta não somam cota e várias contas no mesmo provedor violam os
 * termos de uso. Provedor sem chave fica de fora sem erro. Ver nota 30.
 *
 * Para trocar um modelo: rode `npm run ia:verificar-modelos`, edite só este
 * arquivo e rode `npm run test:all`.
 */
import { GEMINI_MODELS, GROQ_MODELS, OPENROUTER_MODELS } from "../ai-models-config";

export type IdProvedor = "groq" | "openrouter" | "gemini" | "cerebras" | "mistral" | "github" | "cloudflare";
export type Transporte = "openai-compat" | "gemini";
/** Tarefas com exigências diferentes (JSON estruturado ou texto livre). */
export type TarefaIA = "triagem-json" | "texto";

export interface Provedor {
	id: IdProvedor;
	nome: string;
	transporte: Transporte;
	/** Variável(is) de ambiente com a chave; a primeira preenchida vale. */
	variaveisChave: string[];
	/** URL base (OpenAI-compatível: …/chat/completions e …/models). */
	baseUrl: (env: NodeJS.ProcessEnv) => string | null;
	cabecalhosExtras?: Record<string, string>;
	/** 429 neste provedor esgota a conta toda (ex.: OpenRouter :free). */
	limiteDaConta?: boolean;
}

export interface ModeloIA {
	provedor: IdProvedor;
	id: string;
	/** Aceita modo JSON nativo (response_format / responseMimeType). */
	jsonNativo: boolean;
	/** Modelo de raciocínio (pode emitir <think>…</think> antes da resposta). */
	raciocinio?: boolean;
	/** Tarefas para as quais o modelo serve (todas, se omitido). */
	tarefas?: TarefaIA[];
}

export const PROVEDORES: Record<IdProvedor, Provedor> = {
	groq: {
		id: "groq", nome: "Groq", transporte: "openai-compat", variaveisChave: ["GROQ_API_KEY"],
		baseUrl: () => "https://api.groq.com/openai/v1",
	},
	openrouter: {
		id: "openrouter", nome: "OpenRouter", transporte: "openai-compat", variaveisChave: ["OPENROUTER_API_KEY"],
		baseUrl: () => "https://openrouter.ai/api/v1",
		cabecalhosExtras: { "HTTP-Referer": "https://poligrafo.app.br", "X-Title": "Poligrafo OSINT" },
		limiteDaConta: true,
	},
	gemini: {
		id: "gemini", nome: "Google AI Studio", transporte: "gemini", variaveisChave: ["GEMINI_API_KEY"],
		baseUrl: () => "https://generativelanguage.googleapis.com/v1beta",
	},
	// Candidatos gratuitos (conferir termos e cota antes de cadastrar a chave — nota 30).
	cerebras: {
		id: "cerebras", nome: "Cerebras", transporte: "openai-compat", variaveisChave: ["CEREBRAS_API_KEY"],
		baseUrl: () => "https://api.cerebras.ai/v1",
	},
	mistral: {
		id: "mistral", nome: "Mistral", transporte: "openai-compat", variaveisChave: ["MISTRAL_API_KEY"],
		baseUrl: () => "https://api.mistral.ai/v1",
	},
	github: {
		id: "github", nome: "GitHub Models", transporte: "openai-compat", variaveisChave: ["GITHUB_MODELS_TOKEN"],
		baseUrl: (env) => env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference",
	},
	cloudflare: {
		id: "cloudflare", nome: "Cloudflare Workers AI", transporte: "openai-compat", variaveisChave: ["CLOUDFLARE_API_TOKEN"],
		baseUrl: (env) => (env.CLOUDFLARE_ACCOUNT_ID
			? `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`
			: null),
	},
};

/**
 * Ordem dos provedores no rodízio (o gateway alterna entre eles). Gemini primeiro (08/10/2026):
 * no lote de 20 notas foi o único que entregou o JSON completo em todas as rodadas; o modelo
 * principal da Groq devolvia resposta fora do contrato (7 s perdidos) e logo batia no limite.
 */
export const ORDEM_PROVEDORES: IdProvedor[] = ["gemini", "groq", "cerebras", "openrouter", "mistral", "github", "cloudflare"];

const RACIOCINIO = /(r1|gpt-oss|qwen3|thinking)/i;

function modelosDe(provedor: IdProvedor, ids: readonly string[], jsonNativo = true): ModeloIA[] {
	return ids.map((id) => ({ provedor, id, jsonNativo: jsonNativo && !id.startsWith("gemma"), raciocinio: RACIOCINIO.test(id) }));
}

/**
 * Catálogo. Groq/OpenRouter/Gemini vêm de ai-models-config.ts (verificado
 * pelo `ia:verificar-modelos`); os demais só entram com chave cadastrada.
 */
export const MODELOS: ModeloIA[] = [
	...modelosDe("groq", GROQ_MODELS),
	...modelosDe("gemini", GEMINI_MODELS),
	...modelosDe("openrouter", OPENROUTER_MODELS),
	...modelosDe("cerebras", ["gpt-oss-120b", "llama-3.3-70b"]),
	...modelosDe("mistral", ["mistral-small-latest"]),
	...modelosDe("github", ["openai/gpt-4.1-mini"]),
	...modelosDe("cloudflare", ["@cf/meta/llama-3.3-70b-instruct-fp8-fast"], false),
];

export function chaveDoProvedor(p: Provedor, env: NodeJS.ProcessEnv = process.env): string | null {
	for (const nome of p.variaveisChave) {
		const v = env[nome]?.trim();
		if (v) return v;
	}
	return null;
}

export function provedorAtivo(p: Provedor, env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(chaveDoProvedor(p, env) && p.baseUrl(env));
}

function serveParaTarefa(m: ModeloIA, tarefa: TarefaIA): boolean {
	return !m.tarefas || m.tarefas.includes(tarefa);
}

/**
 * Modelos na ordem do rodízio: o 1º de cada provedor ativo, depois o 2º de
 * cada um, e assim por diante — espalha a carga e evita esgotar um provedor.
 */
export function modelosEmRodizio(tarefa: TarefaIA, env: NodeJS.ProcessEnv = process.env): ModeloIA[] {
	const filas = ORDEM_PROVEDORES
		.filter((id) => provedorAtivo(PROVEDORES[id], env))
		.map((id) => MODELOS.filter((m) => m.provedor === id && serveParaTarefa(m, tarefa)));
	const ordem: ModeloIA[] = [];
	for (let rodada = 0; filas.some((f) => f.length > rodada); rodada++) {
		for (const fila of filas) if (fila[rodada]) ordem.push(fila[rodada]);
	}
	return ordem;
}
