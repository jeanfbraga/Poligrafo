import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bancoDosArgumentos, executarSql, executarSqlPerfil, lerSql, refDoProjeto } from "../../scripts/utils/sql-perfil";

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

	it("Banco Principal: ref da URL principal e token próprio (o do Perfil não enxerga o Principal)", async () => {
		vi.stubEnv("SUPABASE_PRINCIPAL_ACCESS_TOKEN", "token-principal");
		vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://principal123.supabase.co");
		const fetchFn = vi.fn(async () => new Response("[]", { status: 200 }));
		await executarSql("select 1", "principal", fetchFn as unknown as typeof fetch);
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.supabase.com/v1/projects/principal123/database/query");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-principal");
		vi.stubEnv("SUPABASE_PRINCIPAL_ACCESS_TOKEN", "");
		await expect(executarSql("select 1", "principal", fetchFn as unknown as typeof fetch)).rejects.toThrow("SUPABASE_PRINCIPAL_ACCESS_TOKEN ausente no .env.local");
		expect(bancoDosArgumentos(["--banco", "principal", "--sql", "x"])).toBe("principal");
		expect(bancoDosArgumentos(["--sql", "x"])).toBe("perfil");
	});

	it("arquivo salvo com BOM (PowerShell) chega ao banco sem o BOM", () => {
		const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "sql-perfil-"));
		const arquivo = path.join(pasta, "consulta.sql");
		fs.writeFileSync(arquivo, "﻿select 1;", "utf8");
		expect(lerSql(["--arquivo", arquivo])).toBe("select 1;");
		expect(lerSql(["--sql", "select 2"])).toBe("select 2");
		fs.rmSync(pasta, { recursive: true, force: true });
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
