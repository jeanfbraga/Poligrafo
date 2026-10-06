/**
 * Gateway de IA — porta única para todas as chamadas a LLM do Polígrafo.
 *
 * `gerar()` percorre os modelos em rodízio (registro.ts), pula os pausados
 * (saude.ts), respeita um prazo total, classifica cada falha (falhas.ts) e só
 * devolve resposta que passou no contrato da tarefa (`validar`). Nunca lança
 * exceção: devolve `{ ok: false, motivo }` para quem chama aplicar a regra
 * local. Ver nota 30 do Obsidian.
 */
import { Prazo } from "@/lib/prazo";
import { classificarFalha, type Falha } from "./falhas";
import { chaveDoProvedor, type ModeloIA, modelosEmRodizio, PROVEDORES, type TarefaIA } from "./registro";
import { SaudeIA, saudeIA } from "./saude";
import { chamarModelo } from "./transportes";

export type ResultadoValidacaoIA = { success: true; data?: unknown } | { success: false; error: string };

export interface PedidoIA {
	tarefa: TarefaIA;
	sistema: string;
	usuario: string;
	formato: "json" | "texto";
	/** JSON: chave raiz obrigatória. */
	chaveRaiz?: string;
	/** Contrato da tarefa (ex.: cobertura dos ids do lote). */
	validar?: (json: unknown) => ResultadoValidacaoIA;
	/** Prazo total (padrão 25 s). */
	prazo?: Prazo;
	timeoutPorModeloMs?: number;
	maxTentativas?: number;
	maxTokens?: number;
	fetchFn?: typeof fetch;
	saude?: SaudeIA;
	env?: NodeJS.ProcessEnv;
}

export interface Tentativa {
	provedor: string;
	modelo: string;
	resultado: "OK" | "INVALIDO" | Falha["tipo"];
	ms: number;
}

export type RespostaIA =
	| { ok: true; dados: unknown; texto: string; provedor: string; modelo: string; tentativas: Tentativa[] }
	| { ok: false; motivo: "SEM_PROVEDOR" | "PRAZO" | "ESGOTADO"; tentativas: Tentativa[] };

/** Remove <think>…</think> e cercas de código; devolve o texto limpo. */
export function limparTextoIA(texto: string): string {
	return texto.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
}

/** JSON do texto (do primeiro "{" ao último "}"); null se não houver/for inválido. */
export function lerJsonIA(texto: string): unknown {
	const limpo = limparTextoIA(texto);
	const ini = limpo.indexOf("{");
	const fim = limpo.lastIndexOf("}");
	if (ini < 0 || fim <= ini) return null;
	try {
		return JSON.parse(limpo.slice(ini, fim + 1));
	} catch {
		return null;
	}
}

function aprovar(pedido: PedidoIA, texto: string): { ok: boolean; dados: unknown } {
	if (pedido.formato === "texto") {
		const limpo = limparTextoIA(texto);
		return { ok: limpo.length > 0, dados: limpo };
	}
	const json = lerJsonIA(texto) as Record<string, unknown> | null;
	if (!json || (pedido.chaveRaiz && !(pedido.chaveRaiz in json))) return { ok: false, dados: null };
	if (pedido.validar && !pedido.validar(json).success) return { ok: false, dados: null };
	return { ok: true, dados: json };
}

interface Estado {
	pedido: PedidoIA;
	prazo: Prazo;
	saude: SaudeIA;
	fetchFn: typeof fetch;
	env: NodeJS.ProcessEnv;
	tentativas: Tentativa[];
}

async function tentarModelo(m: ModeloIA, st: Estado): Promise<RespostaIA | null> {
	const provedor = PROVEDORES[m.provedor];
	const inicio = Date.now();
	const timeoutMs = st.prazo.limitar(st.pedido.timeoutPorModeloMs ?? 12_000);
	const r = await chamarModelo(
		{ provedor, modelo: m, chave: chaveDoProvedor(provedor, st.env) ?? "", baseUrl: provedor.baseUrl(st.env) ?? "", fetchFn: st.fetchFn },
		{ sistema: st.pedido.sistema, usuario: st.pedido.usuario, formato: st.pedido.formato, timeoutMs, maxTokens: st.pedido.maxTokens },
	);
	const registro = (resultado: Tentativa["resultado"]) =>
		st.tentativas.push({ provedor: m.provedor, modelo: m.id, resultado, ms: Date.now() - inicio });
	if (!r.ok) {
		const falha = classificarFalha({ ...r, limiteDaConta: provedor.limiteDaConta });
		st.saude.registrarFalha(m.provedor, m.id, falha);
		registro(falha.tipo);
		return null;
	}
	const aprovado = aprovar(st.pedido, r.texto);
	if (!aprovado.ok) {
		registro("INVALIDO");
		return null;
	}
	st.saude.registrarSucesso(m.provedor, m.id);
	registro("OK");
	return { ok: true, dados: aprovado.dados, texto: r.texto, provedor: m.provedor, modelo: m.id, tentativas: st.tentativas };
}

function criarEstado(pedido: PedidoIA): Estado {
	return {
		pedido,
		prazo: pedido.prazo ?? new Prazo(25_000),
		saude: pedido.saude ?? saudeIA,
		fetchFn: pedido.fetchFn ?? ((i, o) => globalThis.fetch(i, o)),
		env: pedido.env ?? process.env,
		tentativas: [],
	};
}

async function percorrer(fila: ModeloIA[], st: Estado): Promise<RespostaIA> {
	const maxTentativas = st.pedido.maxTentativas ?? 6;
	for (const m of fila) {
		if (st.prazo.restanteMs() < 1_000) return { ok: false, motivo: "PRAZO", tentativas: st.tentativas };
		if (st.tentativas.length >= maxTentativas) break;
		if (!st.saude.disponivel(m.provedor, m.id)) continue;
		const resposta = await tentarModelo(m, st);
		if (resposta) return resposta;
	}
	return { ok: false, motivo: "ESGOTADO", tentativas: st.tentativas };
}

export async function gerar(pedido: PedidoIA): Promise<RespostaIA> {
	const st = criarEstado(pedido);
	const fila = modelosEmRodizio(pedido.tarefa, st.env);
	if (fila.length === 0) return { ok: false, motivo: "SEM_PROVEDOR", tentativas: [] };
	return percorrer(fila, st);
}
