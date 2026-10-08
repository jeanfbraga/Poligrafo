/**
 * Roda SQL nos bancos do Polígrafo pela API de gestão do Supabase
 * (POST /v1/projects/{ref}/database/query). Sem CLI, sem `supabase init`.
 *
 * Precisa no .env.local (nunca em commit):
 *   Banco de Perfil:  NEXT_PUBLIC_SUPABASE_PERFIL_URL + SUPABASE_PERFIL_ACCESS_TOKEN
 *   Banco Principal:  NEXT_PUBLIC_SUPABASE_URL        + SUPABASE_PRINCIPAL_ACCESS_TOKEN
 * (o ref sai do subdomínio da URL; cada token é da conta dona do projeto: o do Perfil
 * não enxerga o Principal — HTTP 403 "database_read" em 08/10/2026).
 *
 * Uso:
 *   npm run sql:perfil -- --sql "select count(*) from tse_eleitos"
 *   npm run sql:perfil -- --arquivo scripts/sql/migracao_perfil_tse_eleitos.sql
 *   npm run sql:principal -- --arquivo scripts/sql/migracao_principal_indices_redundantes.sql
 */
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export type BancoSql = "perfil" | "principal";

const VARIAVEIS: Record<BancoSql, { url: string; token: string; rotulo: string }> = {
	perfil: { url: "NEXT_PUBLIC_SUPABASE_PERFIL_URL", token: "SUPABASE_PERFIL_ACCESS_TOKEN", rotulo: "SQL PERFIL" },
	principal: { url: "NEXT_PUBLIC_SUPABASE_URL", token: "SUPABASE_PRINCIPAL_ACCESS_TOKEN", rotulo: "SQL PRINCIPAL" },
};

export function refDoProjeto(url: string | undefined, variavel = "NEXT_PUBLIC_SUPABASE_PERFIL_URL"): string {
	const ref = String(url ?? "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
	if (!ref) throw new Error(`${variavel} ausente ou fora do formato https://{ref}.supabase.co`);
	return ref;
}

export async function executarSql(sql: string, banco: BancoSql, fetchFn: typeof fetch = fetch): Promise<unknown> {
	const v = VARIAVEIS[banco];
	const token = process.env[v.token];
	if (!token) throw new Error(`${v.token} ausente no .env.local`);
	const ref = refDoProjeto(process.env[v.url], v.url);
	const res = await fetchFn(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ query: sql }),
		signal: AbortSignal.timeout(120_000),
	});
	const corpo = await res.text();
	if (!res.ok) throw new Error(`[${v.rotulo}] HTTP ${res.status}: ${corpo.slice(0, 500)}`);
	return corpo ? JSON.parse(corpo) : null;
}

/** Compatível com o uso anterior (só Banco de Perfil). */
export function executarSqlPerfil(sql: string, fetchFn: typeof fetch = fetch): Promise<unknown> {
	return executarSql(sql, "perfil", fetchFn);
}

function valorDe(argv: string[], flag: string): string | undefined {
	const i = argv.indexOf(flag);
	return i >= 0 ? argv[i + 1] : undefined;
}

/** Arquivo salvo pelo PowerShell vem com BOM, e o Postgres recusa o "﻿select". */
export function lerSql(argv: string[]): string {
	const arquivo = valorDe(argv, "--arquivo");
	const sql = arquivo ? fs.readFileSync(arquivo, "utf8") : valorDe(argv, "--sql");
	if (!sql) throw new Error('Use --sql "..." ou --arquivo caminho.sql');
	return sql.replace(/^﻿/, "");
}

export function bancoDosArgumentos(argv: string[]): BancoSql {
	return valorDe(argv, "--banco") === "principal" ? "principal" : "perfil";
}

async function main() {
	const argv = process.argv.slice(2);
	const resultado = await executarSql(lerSql(argv), bancoDosArgumentos(argv));
	console.log(JSON.stringify(resultado, null, 2));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/utils/sql-perfil.ts")) {
	main().catch((e) => {
		console.error(e?.message || e);
		process.exit(1);
	});
}
