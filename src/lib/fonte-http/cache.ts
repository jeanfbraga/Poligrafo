/**
 * Cache em memória das respostas das fontes governamentais.
 *
 * Ideia portada do `_shared/cache.py` do mcp-brasil (ttl_cache com
 * cache negativo): uma resposta "não encontrado" também é guardada,
 * por menos tempo, para não repetir a mesma consulta vazia na mesma
 * investigação.
 *
 * A chave nunca inclui cabeçalhos (onde ficam as chaves de API).
 */

export interface RespostaGuardada {
	status: number;
	statusText: string;
	headers: [string, string][];
	corpo: string;
}

interface Entrada {
	resposta: RespostaGuardada;
	expiraEm: number;
}

export class CacheRespostas {
	private readonly entradas = new Map<string, Entrada>();

	constructor(
		private readonly maxEntradas = 500,
		private readonly agora: () => number = () => Date.now(),
	) {}

	ler(chave: string): RespostaGuardada | null {
		const entrada = this.entradas.get(chave);
		if (!entrada) return null;
		if (entrada.expiraEm <= this.agora()) {
			this.entradas.delete(chave);
			return null;
		}
		// Reinsere para manter a ordem de uso recente (LRU simples).
		this.entradas.delete(chave);
		this.entradas.set(chave, entrada);
		return entrada.resposta;
	}

	guardar(chave: string, resposta: RespostaGuardada, ttlMs: number): void {
		if (ttlMs <= 0) return;
		this.entradas.delete(chave);
		this.entradas.set(chave, { resposta, expiraEm: this.agora() + ttlMs });
		while (this.entradas.size > this.maxEntradas) {
			const maisAntiga = this.entradas.keys().next().value;
			if (maisAntiga === undefined) break;
			this.entradas.delete(maisAntiga);
		}
	}

	limpar(): void {
		this.entradas.clear();
	}

	get tamanho(): number {
		return this.entradas.size;
	}
}

export async function guardarResposta(res: Response): Promise<RespostaGuardada> {
	return {
		status: res.status,
		statusText: res.statusText,
		headers: Array.from(res.headers.entries()),
		corpo: await res.text(),
	};
}

export function recriarResposta(guardada: RespostaGuardada): Response {
	// Status sem corpo (204/304) não aceitam body no construtor.
	const semCorpo = guardada.status === 204 || guardada.status === 304;
	return new Response(semCorpo ? null : guardada.corpo, {
		status: guardada.status,
		statusText: guardada.statusText,
		headers: guardada.headers,
	});
}
