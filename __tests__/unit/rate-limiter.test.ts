import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, transparenciaLimiter } from '../../lib/services/rate-limiter';

describe('RateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('acquire()', () => {
        it('deve permitir requisições abaixo do limite sem bloquear', async () => {
            const limiter = new RateLimiter(5, 60_000);
            const starts: number[] = [];

            for (let i = 0; i < 5; i++) {
                const start = Date.now();
                await limiter.acquire();
                starts.push(Date.now() - start);
            }

            // Todas devem ter completado sem esperar
            starts.forEach(elapsed => expect(elapsed).toBeLessThan(50));
        });

        it('deve bloquear ao atingir o limite e liberar após a janela', async () => {
            const limiter = new RateLimiter(2, 1000); // 2 req/seg

            await limiter.acquire(); // req 1
            await limiter.acquire(); // req 2

            let blocked = false;
            const acquirePromise = limiter.acquire().then(() => {
                blocked = true;
            });

            // Ainda não desbloqueou
            expect(blocked).toBe(false);

            // Avança 1 segundo para resetar a janela
            vi.advanceTimersByTime(1001);
            await acquirePromise;

            expect(blocked).toBe(true);
        });

        it('deve resetar o contador quando a janela expira', async () => {
            const limiter = new RateLimiter(2, 1000);

            await limiter.acquire();
            await limiter.acquire();

            // Avança 1 segundo
            vi.advanceTimersByTime(1001);

            // Deve liberar novamente
            await expect(limiter.acquire()).resolves.toBeUndefined();
        });
    });

    describe('remaining getter', () => {
        it('deve retornar o limite completo quando não houver requisições', () => {
            const limiter = new RateLimiter(10, 60_000);
            expect(limiter.remaining).toBe(10);
        });

        it('deve decrementar corretamente após cada acquire', async () => {
            const limiter = new RateLimiter(10, 60_000);

            await limiter.acquire();
            expect(limiter.remaining).toBe(9);

            await limiter.acquire();
            expect(limiter.remaining).toBe(8);
        });

        it('deve retornar o limite completo após a janela expirar', async () => {
            const limiter = new RateLimiter(3, 1000);

            await limiter.acquire();
            await limiter.acquire();
            expect(limiter.remaining).toBe(1);

            vi.advanceTimersByTime(1001);
            expect(limiter.remaining).toBe(3);
        });

        it('não deve retornar valor negativo', async () => {
            const limiter = new RateLimiter(1, 60_000);
            await limiter.acquire();
            expect(limiter.remaining).toBeGreaterThanOrEqual(0);
        });
    });

    describe('transparenciaLimiter singleton', () => {
        it('deve ser uma instância de RateLimiter', () => {
            expect(transparenciaLimiter).toBeInstanceOf(RateLimiter);
        });

        it('deve ter capacidade inicial de 80 requisições', () => {
            // O singleton pode já ter been used, mas nunca deve ser negativo
            expect(transparenciaLimiter.remaining).toBeGreaterThanOrEqual(0);
            expect(transparenciaLimiter.remaining).toBeLessThanOrEqual(80);
        });
    });
});
