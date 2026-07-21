/**
 * Rate Limiter simples baseado em janela deslizante.
 * Controla o ritmo de chamadas a APIs externas.
 */
export class RateLimiter {
	private requests: number = 0;
	private readonly limit: number;
	private readonly intervalMs: number;
	private lastReset: number;

	constructor(limit: number, intervalMs: number) {
		this.limit = limit;
		this.intervalMs = intervalMs;
		this.lastReset = Date.now();
	}

	async acquire(): Promise<void> {
		const now = Date.now();
		if (now - this.lastReset > this.intervalMs) {
			this.requests = 0;
			this.lastReset = now;
		}

		if (this.requests >= this.limit) {
			const timeToWait = this.intervalMs - (now - this.lastReset);
			await new Promise((resolve) => setTimeout(resolve, timeToWait));
			this.requests = 0;
			this.lastReset = Date.now();
		}

		this.requests++;
	}

	/** Retorna quantas requisições restam na janela atual */
	get remaining(): number {
		const now = Date.now();
		if (now - this.lastReset > this.intervalMs) return this.limit;
		return Math.max(0, this.limit - this.requests);
	}
}

// ==========================================
// Singletons pré-configurados
// ==========================================

/**
 * Rate Limiter para o Portal da Transparência.
 * Limite conservativo: 80 req/min (oficial: 90 req/min).
 */
export const transparenciaLimiter = new RateLimiter(80, 60_000);
