/**
 * ETL despesas de gabinete da ALERJ (DOCIGP) → alerj_despesas no BANCO DE PERFIL (Fase 4, nota 29).
 *
 * O DOCIGP é lento (4–24 s por chamada): poucos deputados por vez e uma pausa
 * entre chamadas. Upsert pelo id do lançamento: rodar de novo não duplica.
 *
 * Uso:
 *   npm run sync:alerj -- --seco          (lê e mede, não grava)
 *   npm run sync:alerj                    (grava no Banco de Perfil)
 *   npm run sync:alerj -- --limite 3      (só os 3 primeiros deputados: teste)
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { credenciaisBancoPerfil } from "./banco-perfil";
import { type DespesaAlerj, LEGISLATURA_ATUAL, lancamentosDosOrcamentos, nomeDoDeputado } from "./alerj-docigp";

dotenv.config({ path: ".env.local" });

const BASE = "https://docigp.alerj.rj.gov.br/api/v1";
const POR_VEZ = 3;
const PAUSA_MS = 1_000;
const LOTE = 1000;
const MINIMO_LINHAS = 3_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function obter(caminho: string, tentativas = 3): Promise<any> {
	for (let i = 1; i <= tentativas; i++) {
		try {
			const r = await fetch(`${BASE}/${caminho}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(120_000) });
			if (r.ok) return await r.json();
			if (r.status < 500) throw new Error(`HTTP ${r.status}`);
		} catch (e) {
			if (i === tentativas) throw new Error(`[ALERJ] ${caminho}: ${(e as Error).message}`);
		}
		await dormir(PAUSA_MS * 5 * i);
	}
	return null;
}

async function paginas(caminho: string): Promise<any[]> {
	const primeira = await obter(`${caminho}${caminho.includes("?") ? "&" : "?"}page=1`);
	const ultima = Number(primeira?.links?.pagination?.last_page ?? 1);
	const linhas = [...(primeira?.rows ?? [])];
	for (let p = 2; p <= ultima; p++) {
		await dormir(PAUSA_MS);
		linhas.push(...((await obter(`${caminho}${caminho.includes("?") ? "&" : "?"}page=${p}`))?.rows ?? []));
	}
	return linhas;
}

async function despesasDoDeputado(c: any): Promise<DespesaAlerj[]> {
	const deputado = { id: Number(c.id), nome: nomeDoDeputado(c) };
	const orcamentos = await paginas(`congressmen/${c.id}/legislatures/${LEGISLATURA_ATUAL}/budgets`);
	return lancamentosDosOrcamentos(orcamentos, deputado);
}

async function gravar(linhas: DespesaAlerj[]) {
	const { url, key } = credenciaisBancoPerfil();
	const banco = createClient(url, key, { auth: { persistSession: false } });
	for (let i = 0; i < linhas.length; i += LOTE) {
		const { error } = await banco.from("alerj_despesas").upsert(linhas.slice(i, i + LOTE), { onConflict: "lancamento_id" });
		if (error) throw new Error(`[ALERJ] upsert falhou: ${error.message} — a migração scripts/sql/migracao_perfil_alerj_despesas.sql foi rodada?`);
	}
}

function argumento(nome: string): number | null {
	const i = process.argv.indexOf(nome);
	return i >= 0 ? Number(process.argv[i + 1]) : null;
}

async function main() {
	const seco = process.argv.includes("--seco");
	const limite = argumento("--limite");
	const todos = await paginas("congressmen");
	const comMandato = todos.filter((c) => c.has_mandate).slice(0, limite ?? undefined);
	console.log(`[ALERJ] ${todos.length} deputados no DOCIGP, ${comMandato.length} com mandato a processar.`);
	const linhas: DespesaAlerj[] = [];
	const falhas: string[] = [];
	for (let i = 0; i < comMandato.length; i += POR_VEZ) {
		const grupo = comMandato.slice(i, i + POR_VEZ);
		const res = await Promise.allSettled(grupo.map(despesasDoDeputado));
		res.forEach((r, k) => (r.status === "fulfilled" ? linhas.push(...r.value) : falhas.push(`${grupo[k].nickname}: ${r.reason?.message}`)));
		console.log(`[ALERJ] ${Math.min(i + POR_VEZ, comMandato.length)}/${comMandato.length} deputados, ${linhas.length} lançamentos.`);
	}
	if (falhas.length) console.warn(`[ALERJ] ${falhas.length} deputado(s) com falha: ${falhas.slice(0, 5).join(" | ")}`);
	const anos = [...new Set(linhas.map((l) => l.ano))].sort().join(", ");
	console.log(`[ALERJ] ${linhas.length} lançamentos de gasto (anos ${anos}).`);
	if (seco) return console.log("[ALERJ] modo seco: nada gravado.");
	if (!limite && linhas.length < MINIMO_LINHAS) throw new Error(`[ALERJ] Só ${linhas.length} lançamentos: leitura incompleta, nada gravado.`);
	await gravar(linhas);
	console.log(`[ALERJ] ${linhas.length} lançamentos gravados no Banco de Perfil.`);
}

main().catch((e) => {
	console.error(e?.message || e);
	process.exit(1);
});
