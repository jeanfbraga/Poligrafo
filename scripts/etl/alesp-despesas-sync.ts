/**
 * ETL despesas de gabinete da ALESP → alesp_despesas no BANCO DE PERFIL (Fase 4, nota 29).
 *
 * Lê o XML oficial em fluxo (sem guardar o arquivo), fica com a legislatura
 * atual e grava agregado. Upsert pela chave (matrícula, ano, mês, tipo,
 * documento): rodar de novo não duplica.
 *
 * Uso:
 *   npm run sync:alesp -- --seco     (lê e mede, não grava)
 *   npm run sync:alesp               (grava no Banco de Perfil)
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { credenciaisBancoPerfil } from "./banco-perfil";
import { AgregadorAlesp, type DespesaAlesp, lerDespesa, separarBlocos } from "./alesp-despesas";

dotenv.config({ path: ".env.local" });

const URL_XML = "https://www.al.sp.gov.br/repositorioDados/deputados/despesas_gabinetes.xml";
const LOTE = 1000;
/** Abaixo disso o arquivo veio incompleto: não grava pela metade. */
const MINIMO_LINHAS = 5_000;

async function lerXml(): Promise<{ linhas: DespesaAlesp[]; blocos: number; mb: number }> {
	const res = await fetch(URL_XML, { signal: AbortSignal.timeout(15 * 60_000) });
	if (!res.ok || !res.body) throw new Error(`[ALESP] HTTP ${res.status} ao baixar o XML`);
	const leitor = res.body.getReader();
	const decoder = new TextDecoder("utf-8");
	const ag = new AgregadorAlesp();
	let buffer = "";
	let blocos = 0;
	let bytes = 0;
	for (;;) {
		const { value, done } = await leitor.read();
		if (done) break;
		bytes += value.length;
		const { blocos: lidos, resto } = separarBlocos(buffer + decoder.decode(value, { stream: true }));
		buffer = resto;
		blocos += lidos.length;
		for (const b of lidos) ag.adicionar(lerDespesa(b));
	}
	return { linhas: ag.linhas(), blocos, mb: Math.round(bytes / 1024 / 1024) };
}

async function gravar(linhas: DespesaAlesp[]) {
	const { url, key } = credenciaisBancoPerfil();
	const banco = createClient(url, key, { auth: { persistSession: false } });
	for (let i = 0; i < linhas.length; i += LOTE) {
		const { error } = await banco
			.from("alesp_despesas")
			.upsert(linhas.slice(i, i + LOTE), { onConflict: "matricula,ano,mes,tipo,documento" });
		if (error) throw new Error(`[ALESP] upsert falhou: ${error.message} — a migração scripts/sql/migracao_perfil_alesp_despesas.sql foi rodada?`);
	}
}

async function main() {
	const seco = process.argv.includes("--seco");
	const { linhas, blocos, mb } = await lerXml();
	const deputados = new Set(linhas.map((l) => l.matricula)).size;
	const anos = [...new Set(linhas.map((l) => l.ano))].sort().join(", ");
	console.log(`[ALESP] ${mb} MB lidos, ${blocos} lançamentos no arquivo → ${linhas.length} linhas agregadas (${deputados} deputados; anos ${anos}).`);
	if (linhas.length < MINIMO_LINHAS) throw new Error(`[ALESP] Só ${linhas.length} linhas: arquivo incompleto, nada gravado.`);
	if (seco) {
		console.log("[ALESP] modo seco: nada gravado.");
		return;
	}
	await gravar(linhas);
	console.log(`[ALESP] ${linhas.length} linhas gravadas no Banco de Perfil.`);
}

main().catch((e) => {
	console.error(e?.message || e);
	process.exit(1);
});
