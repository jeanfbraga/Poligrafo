/**
 * Disjuntor por fonte: depois de algumas falhas seguidas (timeout, 5xx,
 * queda de rede), a fonte fica "desligada" por um tempo e as próximas
 * consultas falham na hora, sem esperar outro timeout.
 *
 * Fica em memória da instância (suficiente na Vercel com Fluid Compute:
 * redescobrir que uma fonte caiu custa uma única chamada).
 */
export class Disjuntor {
	private readonly falhas = new Map<string, number>();
	private readonly abertoAte = new Map<string, number>();

	constructor(
		private readonly limiteFalhas = 3,
		private readonly pausaMs = 60_000,
		private readonly agora: () => number = () => Date.now(),
	) {}

	/** true quando a fonte está pausada e não deve ser consultada agora. */
	aberto(fonte: string): boolean {
		const ate = this.abertoAte.get(fonte);
		if (ate === undefined) return false;
		if (ate > this.agora()) return true;
		// Pausa acabou: libera uma nova tentativa (meio-aberto).
		this.abertoAte.delete(fonte);
		this.falhas.set(fonte, this.limiteFalhas - 1);
		return false;
	}

	registrarSucesso(fonte: string): void {
		this.falhas.delete(fonte);
		this.abertoAte.delete(fonte);
	}

	registrarFalha(fonte: string): void {
		const total = (this.falhas.get(fonte) ?? 0) + 1;
		this.falhas.set(fonte, total);
		if (total >= this.limiteFalhas) {
			this.abertoAte.set(fonte, this.agora() + this.pausaMs);
		}
	}

	limpar(): void {
		this.falhas.clear();
		this.abertoAte.clear();
	}
}
