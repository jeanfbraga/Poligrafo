/**
 * Roda SQL no BANCO DE PERFIL pela API de gestão do Supabase
 * (POST /v1/projects/{ref}/database/query). Sem CLI, sem `supabase init`.
 *
 * Precisa no .env.local (nunca em commit):
 *   NEXT_PUBLIC_SUPABASE_PERFIL_URL   → o ref sai do subdomínio
 *   SUPABASE_PERFIL_ACCESS_TOKEN      → token de gestão da conta do Banco de Perfil
 *
 * Uso:
 *   npm run sql:perfil -- --sql "select count(*) from tse_eleitos"
 *   npm run sql:perfil -- --arquivo scripts/sql/migracao_perfil_tse_eleitos.sql
 */
import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export function refDoProjeto(url: string | undefined): string {
	const ref = String(url ?? "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
	if (!ref) throw new Error("NEXT_PUBLIC_SUPABASE_PERFIL_URL ausente ou fora do formato https://{ref}.supabase.co");
	return ref;
}

export async function executarSqlPerfil(sql: string, fetchFn: typeof fetch = fetch): Promise<unknown> {
	const token = process.env.SUPABASE_PERFIL_ACCESS_TOKEN;
	if (!token) throw new Error("SUPABASE_PERFIL_ACCESS_TOKEN ausente no .env.local");
	const ref = refDoProjeto(process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL);
	const res = await fetchFn(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ query: sql }),
		signal: AbortSignal.timeout(120_000),
	});
	const corpo = await res.text();
	if (!res.ok) throw new Error(`[SQL PERFIL] HTTP ${res.status}: ${corpo.slice(0, 500)}`);
	return corpo ? JSON.parse(corpo) : null;
}

/** Arquivo salvo pelo PowerShell vem com BOM, e o Postgres recusa o "﻿select". */
export function lerSql(argv: string[]): string {
	const valor = (flag: string) => {
		const i = argv.indexOf(flag);
		return i >= 0 ? argv[i + 1] : undefined;
	};
	const arquivo = valor("--arquivo");
	const sql = arquivo ? fs.readFileSync(arquivo, "utf8") : valor("--sql");
	if (!sql) throw new Error('Use --sql "..." ou --arquivo caminho.sql');
	return sql.replace(/^﻿/, "");
}

async function main() {
	const resultado = await executarSqlPerfil(lerSql(process.argv.slice(2)));
	console.log(JSON.stringify(resultado, null, 2));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/utils/sql-perfil.ts")) {
	main().catch((e) => {
		console.error(e?.message || e);
		process.exit(1);
	});
}
