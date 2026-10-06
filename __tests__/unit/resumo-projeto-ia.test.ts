import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/perfil/projeto/[id]/resumo/route";

describe("API /api/perfil/projeto/[id]/resumo", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		// Sem chaves: o gateway não chama provedores de verdade e o resumo cai na reserva local.
		for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY", "MISTRAL_API_KEY", "GITHUB_MODELS_TOKEN", "CLOUDFLARE_API_TOKEN"]) {
			vi.stubEnv(k, "");
		}
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("gera resumo com IA em cascata (L1 a L4) a partir dos dados informados", async () => {
		const req = new Request("http://localhost:3000/api/perfil/projeto/2418858/resumo", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				titulo: "PL 2418/2024",
				ementa: "Dispõe sobre o uso ético e transparente de algoritmos no serviço público.",
			}),
		});

		const res = await POST(req, { params: Promise.resolve({ id: "2418858" }) });
		expect(res.status).toBe(200);

		const json = await res.json();
		expect(json.resumo).toBeDefined();
		expect(json.resumo.length).toBeGreaterThan(50);
		expect(json.motor).toBeDefined();
		expect(json.titulo).toBe("PL 2418/2024");
		expect(json.motor).toBe("HEURÍSTICA:LOCAL_L4");
	});

	it("retorna 400 se ID do projeto não for informado", async () => {
		const req = new Request("http://localhost:3000/api/perfil/projeto//resumo", {
			method: "POST",
		});

		const res = await POST(req, { params: Promise.resolve({ id: "" }) });
		expect(res.status).toBe(400);

		const json = await res.json();
		expect(json.error).toContain("obrigatório");
	});
});
