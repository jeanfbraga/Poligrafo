/**
 * Dossiê guardado nas últimas 24 h (tabela `pesquisas`): restaura e encerra sem consultar
 * as fontes de novo. Chave e leitura em lib/cache-pesquisas.ts.
 */
import { chaveCachePesquisa, lerCachePesquisa, podeLerCachePesquisas } from "@/lib/cache-pesquisas";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { reemitirEtapasDoCache } from "@/services/core/etapas-ao-vivo";
import { type Execucao, status } from "./contexto";
import { isNodeBemLegado, reidratarPessoaCacheSeNecessario } from "./reidratacao-cache";

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function dossieCompleto(grafo: any): boolean {
	return Boolean(grafo && Array.isArray(grafo.nodes) && grafo.nodes.length > 0 && grafo.partial !== true);
}

function separarLegados(nodes: any[]): { nos: any[]; ignorados: Set<string> } {
	const ignorados = new Set<string>();
	const nos = nodes.filter((node: any) => {
		if (!isNodeBemLegado(node)) return true;
		ignorados.add(node.id);
		return false;
	});
	return { nos, ignorados };
}

function emitirArestas(e: Execucao, edges: any[] | undefined, ignorados: Set<string>): void {
	for (const edge of edges ?? []) {
		if (!ignorados.has(edge.source) && !ignorados.has(edge.target)) e.sendEvent("EDGE_NOVA", edge);
	}
}

async function restaurar(e: Execucao, grafo: any, chave: string): Promise<void> {
	status(e, "[CACHE] Restaurando investigação completa do banco de dados (Bypass de 24h)...");
	const { nos, ignorados } = separarLegados(grafo.nodes || []);
	await reidratarPessoaCacheSeNecessario(nos, chave);
	for (const node of nos) e.sendEvent("NODE_NOVO", node);
	emitirArestas(e, grafo.edges, ignorados);
	// De quando é o dossiê e o que cada fonte respondeu naquela investigação.
	reemitirEtapasDoCache(grafo, e.sendEvent);
	e.sendEvent("DONE", { msg: "Dossiê finalizado (restaurado do cache)." });
	// Encerramos a investigação instantaneamente economizando APIs
	e.p.safeClose();
}

/** true = restaurado do cache e stream encerrado. */
export async function restaurarDoCache(e: Execucao): Promise<boolean> {
	const ref = e.p.refParam || e.p.forceRef;
	const chave = chaveCachePesquisa(e.p.nomeParaBusca, ref);
	try {
		if (!podeLerCachePesquisas()) return false;
		const desde = new Date(Date.now() - UM_DIA_MS).toISOString();
		const cacheData = await lerCachePesquisa(supabaseAdmin as never, chave, ref, desde);
		if (!dossieCompleto(cacheData?.grafo_dados)) return false;
		await restaurar(e, cacheData!.grafo_dados, chave);
		return true;
	} catch (err) {
		console.warn("[Supabase Cache Miss]", err);
		return false;
	}
}
