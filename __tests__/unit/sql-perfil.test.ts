import { afterEach, describe, expect, it, vi } from "vitest";
import { executarSqlPerfil, refDoProjeto } from "../../scripts/utils/sql-perfil";

describe("SQL no Banco de Perfil (API de gestão do Supabase)", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("o ref do projeto sai do subdomínio da URL", () => {
		expect(refDoProjeto("https://abcdef123.supabase.co")).toBe("abcdef123");
		expect(() => refDoProjeto(undefined)).toThrow("NEXT_PUBLIC_SUPABASE_PERFIL_URL");
	});

	it("manda a query com o token no cabeçalho (nunca na URL) e devolve as linhas", async () => {
		vi.stubEnv("SUPABASE_PERFIL_ACCESS_TOKEN", "token-de-teste");
		vi.stubEnv("NEXT_PUBLIC_SUPABASE_PERFIL_URL", "https://abcdef123.supabase.co");
		const fetchFn = vi.fn(async () => new Response(JSON.stringify([{ n: 1 }]), { status: 200 }));
		expect(await executarSqlPerfil("select 1 as n", fetchFn as unknown as typeof fetch)).toEqual([{ n: 1 }]);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.supabase.com/v1/projects/abcdef123/database/query");
		expect(url).not.toContain("token-de-teste");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-de-teste");
		expect(JSON.parse(String(init.body))).toEqual({ query: "select 1 as n" });
	});

	it("erro do banco vira mensagem com o status; sem token nem tenta", async () => {
		vi.stubEnv("SUPABASE_PERFIL_ACCESS_TOKEN", "token-de-teste");
		vi.stubEnv("NEXT_PUBLIC_SUPABASE_PERFIL_URL", "https://abcdef123.supabase.co");
		const falha = vi.fn(async () => new Response('{"message":"syntax error"}', { status: 400 }));
		await expect(executarSqlPerfil("selec", falha as unknown as typeof fetch)).rejects.toThrow('[SQL PERFIL] HTTP 400: {"message":"syntax error"}');
		vi.stubEnv("SUPABASE_PERFIL_ACCESS_TOKEN", "");
		const nunca = vi.fn();
		await expect(executarSqlPerfil("select 1", nunca as unknown as typeof fetch)).rejects.toThrow("SUPABASE_PERFIL_ACCESS_TOKEN ausente");
		expect(nunca).not.toHaveBeenCalled();
	});
});
