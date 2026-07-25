import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "@/lib/api-rate-limit";

function makeRequest(ip?: string): Request {
	const headers = new Headers();
	if (ip) headers.set("x-forwarded-for", ip);
	return new Request("http://localhost:3000/api/test", { headers });
}

describe("api-rate-limit", () => {
	afterEach(() => resetRateLimits());

	it("permite requisições dentro do limite", () => {
		for (let i = 0; i < 5; i++) {
			expect(checkRateLimit(makeRequest("1.1.1.1"), { limit: 5 })).toBeNull();
		}
	});

	it("bloqueia com 429 e Retry-After ao exceder o limite", async () => {
		for (let i = 0; i < 3; i++) {
			checkRateLimit(makeRequest("2.2.2.2"), { limit: 3 });
		}
		const res = checkRateLimit(makeRequest("2.2.2.2"), { limit: 3 });
		expect(res).not.toBeNull();
		expect(res!.status).toBe(429);
		expect(res!.headers.get("Retry-After")).toBeTruthy();
		const body = await res!.json();
		expect(body.error).toBeTruthy();
	});

	it("isola contadores por IP e por escopo", () => {
		for (let i = 0; i < 2; i++) {
			checkRateLimit(makeRequest("3.3.3.3"), { limit: 2, scope: "a" });
		}
		// mesmo IP, escopo diferente → permitido
		expect(
			checkRateLimit(makeRequest("3.3.3.3"), { limit: 2, scope: "b" }),
		).toBeNull();
		// IP diferente, mesmo escopo → permitido
		expect(
			checkRateLimit(makeRequest("4.4.4.4"), { limit: 2, scope: "a" }),
		).toBeNull();
		// estourou o escopo "a" → bloqueado
		expect(
			checkRateLimit(makeRequest("3.3.3.3"), { limit: 2, scope: "a" }),
		).not.toBeNull();
	});

	it("usa o primeiro IP do x-forwarded-for", () => {
		const headers = new Headers({ "x-forwarded-for": "5.5.5.5, 6.6.6.6" });
		const req = new Request("http://localhost:3000/api/test", { headers });
		checkRateLimit(req, { limit: 1, scope: "fwd" });
		// Segunda requisição do mesmo IP de origem deve bloquear
		expect(checkRateLimit(req, { limit: 1, scope: "fwd" })).not.toBeNull();
	});

	it("reseta a janela após windowMs", async () => {
		const windowMs = 50;
		checkRateLimit(makeRequest("7.7.7.7"), { limit: 1, windowMs });
		expect(
			checkRateLimit(makeRequest("7.7.7.7"), { limit: 1, windowMs }),
		).not.toBeNull();
		await new Promise((r) => setTimeout(r, windowMs + 20));
		expect(
			checkRateLimit(makeRequest("7.7.7.7"), { limit: 1, windowMs }),
		).toBeNull();
	});
});
