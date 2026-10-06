/**
 * Prazo — orçamento de tempo compartilhado por uma operação longa
 * (uma investigação inteira, uma chamada de IA com várias tentativas).
 *
 * Quem consulta uma fonte pergunta ao prazo quanto tempo ainda resta
 * e nunca espera mais do que isso. Assim o pipeline termina a tempo
 * de salvar o que já coletou, em vez de estourar o limite da Vercel.
 */
export class Prazo {
	private readonly limiteEm: number;

	constructor(
		duracaoMs: number,
		private readonly agora: () => number = () => Date.now(),
	) {
		this.limiteEm = this.agora() + Math.max(0, duracaoMs);
	}

	/** Milissegundos que ainda restam (nunca negativo). */
	restanteMs(): number {
		return Math.max(0, this.limiteEm - this.agora());
	}

	expirou(): boolean {
		return this.restanteMs() <= 0;
	}

	/** Limita um tempo desejado ao que ainda resta do prazo. */
	limitar(ms: number): number {
		return Math.min(ms, this.restanteMs());
	}

	/**
	 * Cria um prazo menor dentro deste, reservando `reservaMs` no fim
	 * (ex.: guardar 15 s para salvar o cache antes do limite da rota).
	 */
	reservar(reservaMs: number): Prazo {
		return new Prazo(Math.max(0, this.restanteMs() - reservaMs), this.agora);
	}
}

export function criarPrazo(duracaoMs: number, agora?: () => number): Prazo {
	return new Prazo(duracaoMs, agora);
}
