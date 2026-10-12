/**
 * ETL tse_eleitos → BANCO DE PERFIL (Fase 3 do plano do pipe por alçada).
 *
 * Baixa o CSV nacional de candidatos do TSE (cdn.tse.jus.br — outro host, que
 * não bloqueia como o DivulgaCand), guarda eleitos e suplentes das casas
 * legislativas e grava em `tse_eleitos` no Banco de Perfil. O Banco Principal
 * passou do limite de espaço e não recebe tabela nova (regra de 06/10/2026).
 *
 * Pré-requisito: rodar scripts/sql/migracao_perfil_tse_eleitos.sql no Banco de Perfil.
 *
 * Uso:
 *   npm run sync:tse-eleitos                 (2018 senadores, 2022 e 2024)
 *   npm run sync:tse-eleitos -- --ano 2024
 *   npm run sync:tse-eleitos -- --ano 2024 --seco   (lê e conta, sem gravar)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import dotenv from "dotenv";
import { credenciaisBancoPerfil } from "./banco-perfil";
import {
	type BancoGravacao,
	CICLOS,
	deduplicar,
	type EleitoNaBase,
	LIMITE_SAIDA,
	quemSaiu,
	gravarLinhas,
	type LinhaEleito,
	linhaParaEleito,
	montarMapaIbge,
} from "./tse-eleitos";
import { downloadZipComCurl, extrairArquivoZip } from "./tse-sync-real";

dotenv.config({ path: ".env.local" });

const TEMP_DIR = path.join(process.cwd(), ".tmp_tse");
const LOTE = 1000;
/** Mínimos por ciclo: abaixo disso algo deu errado no arquivo (não grava pela metade). */
const MINIMOS: Record<number, number> = { 2018: 40, 2022: 1_500, 2024: 50_000 };

async function mapaIbge(eleicaoMunicipal?: string): Promise<Map<string, string>> {
	if (!eleicaoMunicipal) return new Map();
	const padded = eleicaoMunicipal.padStart(6, "0");
	const url = `https://resultados.tse.jus.br/oficial/ele2024/${eleicaoMunicipal}/config/mun-e${padded}-cm.json`;
	const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
	if (!res.ok) throw new Error(`Mapa TSE↔IBGE: HTTP ${res.status}`);
	return montarMapaIbge(await res.json());
}

async function lerCsv(arquivo: string, ano: number, cargos: string[] | undefined, mapa: Map<string, string>) {
	const linhas: { linha: LinhaEleito; turno: number }[] = [];
	const parser = fs.createReadStream(arquivo, "latin1").pipe(
		parse({ columns: true, delimiter: ";", skip_empty_lines: true, relax_quotes: true, relax_column_count: true }),
	);
	try {
		for await (const r of parser) {
			if (cargos && !cargos.includes(String(r.CD_CARGO))) continue;
			const linha = linhaParaEleito(r, ano, mapa);
			if (linha) linhas.push({ linha, turno: Number(r.NR_TURNO) || 1 });
		}
	} finally {
		// O CSV extraído sai; fica só o ZIP em .tmp_tse/ (cache que pode ser apagado).
		fs.rmSync(arquivo, { force: true });
	}
	return deduplicar(linhas);
}

function bancoPerfil(): SupabaseClient {
	const { url, key } = credenciaisBancoPerfil();
	return createClient(url, key, { auth: { persistSession: false } });
}

async function lerCiclo(banco: SupabaseClient, ciclo: (typeof CICLOS)[number]): Promise<EleitoNaBase[]> {
	const todos: EleitoNaBase[] = [];
	for (let de = 0; ; de += LOTE) {
		let consulta = banco.from("tse_eleitos").select("sq_candidato,nm_candidato,ds_cargo,sg_uf").eq("ano_eleicao", ciclo.ano);
		if (ciclo.cargos) consulta = consulta.in("cd_cargo", ciclo.cargos);
		const { data, error } = await consulta.order("sq_candidato").range(de, de + LOTE - 1);
		if (error) throw new Error(`[TSE ELEITOS ${ciclo.ano}] Leitura da base: ${error.message}`);
		todos.push(...((data ?? []) as EleitoNaBase[]));
		if (!data || data.length < LOTE) return todos;
	}
}

/** Tira quem saiu do arquivo do TSE (cada nome vai ao log, que é a cópia do que sai). */
async function removerQuemSaiu(banco: SupabaseClient, ciclo: (typeof CICLOS)[number], naBase: EleitoNaBase[], linhas: LinhaEleito[]): Promise<void> {
	const sairam = quemSaiu(naBase, linhas);
	if (sairam === null) {
		console.warn(`[TSE ELEITOS ${ciclo.ano}] Mais de ${LIMITE_SAIDA * 100}% dos eleitos sumiriam do arquivo: nada apagado (confira o arquivo do TSE).`);
		return;
	}
	for (const e of sairam) console.log(`[TSE ELEITOS ${ciclo.ano}] Saiu do arquivo do TSE: ${e.nm_candidato} (${e.ds_cargo ?? "?"}, ${e.sg_uf}, sq ${e.sq_candidato})`);
	for (let i = 0; i < sairam.length; i += LOTE) {
		const lote = sairam.slice(i, i + LOTE).map((e) => e.sq_candidato);
		const { error } = await banco.from("tse_eleitos").delete().eq("ano_eleicao", ciclo.ano).in("sq_candidato", lote);
		if (error) throw new Error(`[TSE ELEITOS ${ciclo.ano}] Remoção falhou: ${error.message}`);
	}
	console.log(`[TSE ELEITOS ${ciclo.ano}] ${sairam.length} registro(s) que saíram do arquivo do TSE removido(s).`);
}

async function gravar(ciclo: (typeof CICLOS)[number], linhas: LinhaEleito[]) {
	const banco = bancoPerfil();
	const naBase = await lerCiclo(banco, ciclo);
	await gravarLinhas(banco as unknown as BancoGravacao, linhas, LOTE);
	await removerQuemSaiu(banco, ciclo, naBase, linhas);
}

async function sincronizarCiclo(ciclo: (typeof CICLOS)[number], seco: boolean): Promise<number> {
	fs.mkdirSync(TEMP_DIR, { recursive: true });
	const zip = path.join(TEMP_DIR, `consulta_cand_${ciclo.ano}.zip`);
	await downloadZipComCurl(`https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ciclo.ano}.zip`, zip);
	const csv = extrairArquivoZip(zip, new RegExp(`consulta_cand_${ciclo.ano}_BRASIL\\.csv$`, "i"), TEMP_DIR);
	const linhas = await lerCsv(csv, ciclo.ano, ciclo.cargos, await mapaIbge(ciclo.eleicaoMunicipal));
	const minimo = MINIMOS[ciclo.ano] ?? 1;
	if (linhas.length < minimo) {
		throw new Error(`[TSE ELEITOS ${ciclo.ano}] ${linhas.length} registros, abaixo do mínimo ${minimo}: nada gravado.`);
	}
	if (!seco) await gravar(ciclo, linhas);
	const comCpf = linhas.filter((l) => l.nr_cpf_candidato).length;
	console.log(`[TSE ELEITOS ${ciclo.ano}] ${linhas.length} registros ${seco ? "lidos (modo seco, nada gravado)" : "gravados"} (${comCpf} com CPF válido).`);
	if (seco) console.log(JSON.stringify(linhas.slice(0, 2)));
	return linhas.length;
}

async function main() {
	const i = process.argv.indexOf("--ano");
	const ano = i >= 0 ? Number(process.argv[i + 1]) : null;
	const ciclos = ano ? CICLOS.filter((c) => c.ano === ano) : CICLOS;
	if (ciclos.length === 0) throw new Error(`Ano ${ano} não configurado em CICLOS.`);
	let total = 0;
	const seco = process.argv.includes("--seco");
	for (const ciclo of ciclos) total += await sincronizarCiclo(ciclo, seco);
	console.log(`[TSE ELEITOS] Concluído: ${total} registros ${seco ? "lidos (nada gravado)" : "no Banco de Perfil"}.`);
}

main().catch((e) => {
	console.error(e?.message || e);
	process.exit(1);
});
