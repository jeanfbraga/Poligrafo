/**
 * Rate Limiter de janela deslizante: no máximo `limit` chamadas em
 * qualquer intervalo de `intervalMs`. Guarda o horário de cada chamada
 * recente (como o `_shared/rate_limiter.py` do mcp-brasil), em vez de
 * zerar a contagem de tempos em tempos — a janela fixa deixava passar
 * o dobro do limite na virada da janela.
 */
export class RateLimiter {
	private readonly horarios: number[] = [];
	private fila: Promise<void> = Promise.resolve();

	constructor(
		private readonly limit: number,
		private readonly intervalMs: number,
		private readonly agora: () => number = () => Date.now(),
		private readonly dormir: (ms: number) => Promise<void> = (ms) =>
			new Promise((resolve) => setTimeout(resolve, ms)),
	) {}

	private descartarAntigos(): void {
		const limite = this.agora() - this.intervalMs;
		while (this.horarios.length > 0 && this.horarios[0] <= limite) {
			this.horarios.shift();
		}
	}

	private async reservar(): Promise<void> {
		this.descartarAntigos();
		while (this.horarios.length >= this.limit) {
			const espera = this.horarios[0] + this.intervalMs - this.agora();
			await this.dormir(Math.max(1, espera));
			this.descartarAntigos();
		}
		this.horarios.push(this.agora());
	}

	/** Aguarda até haver vaga na janela. Chamadas concorrentes entram em fila. */
	acquire(): Promise<void> {
		const vez = this.fila.then(() => this.reservar());
		this.fila = vez.catch(() => undefined);
		return vez;
	}

	/** Quantas chamadas ainda cabem na janela atual. */
	get remaining(): number {
		this.descartarAntigos();
		return Math.max(0, this.limit - this.horarios.length);
	}
}

// ==========================================
// Singletons pré-configurados
// ==========================================

/**
 * Rate Limiter para o Portal da Transparência.
 * Limite conservativo: 80 req/min (oficial: 90 req/min de dia).
 */
export const transparenciaLimiter = new RateLimiter(80, 60_000);
