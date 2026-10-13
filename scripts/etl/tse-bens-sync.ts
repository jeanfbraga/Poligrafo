/**
 * ETL tse_bens → BANCO DE PERFIL: bens declarados ao TSE de quem está na janela de mandato e
 * dos presidentes (decisão de 12/10/2026). Substitui tse-sync-real.ts, que gravava TODOS os
 * candidatos de 2022/2026 no Banco Principal (61 MB) pela chave do CPF e, em 2024 (CPF
 * escondido), gravava 0 linha com a action verde.
 *
 * Pré-requisitos: scripts/sql/migracao_perfil_tse_bens.sql e a base tse_eleitos carregada
 * (npm run sync:tse-eleitos), que diz quem está na janela.
 *
 * Uso:
 *   npm run sync:tse-bens                       (carga normal)
 *   npm run sync:tse-bens -- --seco             (lê e mede, sem gravar)
 *   npm run sync:tse-bens -- --troca-de-periodo (posse de 2027: deixa sair quem saiu da janela)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import dotenv from "dotenv";
import { cpfValido, soDigitos } from "../../src/lib/documento";
import { naJanela, posseRecente } from "../../src/lib/janela-mandato";
import { credenciaisBancoPerfil } from "./banco-perfil";
import { downloadZipComCurl, extrairArquivoZip } from "./tse-arquivos";
import {
	ANOS_BENS,
	ANOS_PELO_CPF,
	agruparBens,
	type BensNaBase,
	bensQueMudaram,
	bensQueSairam,
	type DonoDoSq,
	type LinhaBens,
	LIMITE_SAIDA_BENS,
} from "./tse-bens";

dotenv.config({ path: ".env.local" });

const TEMP_DIR = path.join(process.cwd(), ".tmp_tse");
const LOTE_LEITURA = 1000;
const LOTE_GRAVACAO = 500;
/** Abaixo disso algo deu errado (arquivo ou base de eleitos): nada é gravado nem apagado. */
const MINIMO = 40_000;

interface PessoaNaBase extends DonoDoSq {
	sq_candidato: string;
	ano_eleicao: number;
}

function bancoPerfil(): SupabaseClient {
	const { url, key } = credenciaisBancoPerfil();
	return createClient(url, key, { auth: { persistSession: false } });
}

async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
	const todos: T[] = [];
	for (let de = 0; ; de += LOTE_LEITURA) {
		const { data, error } = await consulta(de, de + LOTE_LEITURA - 1);
		if (error) throw new Error(`[TSE BENS] Leitura da base: ${error.message}`);
		todos.push(...((data ?? []) as T[]));
		if (!data || data.length < LOTE_LEITURA) return todos;
	}
}

/** Eleitos na janela de mandato (e presidentes), sem suplente que não assumiu. */
async function pessoasNaJanela(banco: SupabaseClient): Promise<PessoaNaBase[]> {
	const linhas = await lerTudo<any>((de, ate) =>
		banco.from("tse_eleitos").select("sq_candidato,ano_eleicao,nr_cpf_candidato,nm_candidato,cd_cargo,sg_uf,ds_sit_tot_turno").neq("ds_sit_tot_turno", "SUPLENTE").order("id").range(de, ate),
	);
	return linhas
		.filter((e) => naJanela(Number(e.cd_cargo), e.ano_eleicao))
		.map((e) => ({ sq_candidato: String(e.sq_candidato), ano_eleicao: e.ano_eleicao, cpf: e.nr_cpf_candidato ?? null, nome: e.nm_candidato, cd_cargo: e.cd_cargo, sg_uf: e.sg_uf }));
}

async function percorrerCsv(arquivo: string, aoLer: (r: Record<string, string>) => void): Promise<void> {
	const parser = fs.createReadStream(arquivo, "latin1").pipe(
		parse({ columns: true, delimiter: ";", skip_empty_lines: true, relax_quotes: true, relax_column_count: true }),
	);
	try {
		for await (const r of parser) aoLer(r as Record<string, string>);
	} finally {
		fs.rmSync(arquivo, { force: true });
	}
}

/** CSV nacional do ano; null se o TSE não publica o arquivo (ex.: bens de anos antigos). */
async function csvDoTse(pasta: string, prefixo: string, ano: number): Promise<string | null> {
	fs.mkdirSync(TEMP_DIR, { recursive: true });
	const zip = path.join(TEMP_DIR, `${prefixo}_${ano}.zip`);
	try {
		await downloadZipComCurl(`https://cdn.tse.jus.br/estatistica/sead/odsele/${pasta}/${prefixo}_${ano}.zip`, zip, 2, [5_000]);
		return extrairArquivoZip(zip, new RegExp(`${prefixo}_${ano}_BRASIL\\.csv$`, "i"), TEMP_DIR);
	} catch (e) {
		console.warn(`[TSE BENS ${ano}] ${prefixo}_${ano} indisponível (${(e as Error).message}); ano pulado.`);
		return null;
	}
}

/** Outras candidaturas da mesma pessoa no ano, pelo CPF (para a variação patrimonial). */
async function donosPeloCpf(ano: number, porCpf: Map<string, DonoDoSq>, donos: Map<string, DonoDoSq>): Promise<void> {
	const csv = await csvDoTse("consulta_cand", "consulta_cand", ano);
	if (!csv) return;
	let achados = 0;
	await percorrerCsv(csv, (r) => {
		const cpf = cpfValido(r.NR_CPF_CANDIDATO) ? soDigitos(r.NR_CPF_CANDIDATO) : null;
		const sq = String(r.SQ_CANDIDATO ?? "");
		if (!cpf || !porCpf.has(cpf) || donos.has(sq)) return;
		donos.set(sq, { cpf, nome: String(r.NM_CANDIDATO), cd_cargo: String(r.CD_CARGO), sg_uf: String(r.SG_UF) });
		achados++;
	});
	console.log(`[TSE BENS ${ano}] ${achados} candidatura(s) de quem está na janela, achadas pelo CPF.`);
}

async function bensDoAno(ano: number, pessoas: PessoaNaBase[], porCpf: Map<string, DonoDoSq>): Promise<LinhaBens[]> {
	const donos = new Map<string, DonoDoSq>(pessoas.filter((p) => p.ano_eleicao === ano).map((p) => [p.sq_candidato, p]));
	if (ANOS_PELO_CPF.includes(ano)) await donosPeloCpf(ano, porCpf, donos);
	if (donos.size === 0) return [];
	const csv = await csvDoTse("bem_candidato", "bem_candidato", ano);
	if (!csv) return [];
	const linhasCsv: Record<string, string>[] = [];
	await percorrerCsv(csv, (r) => {
		if (donos.has(String(r.SQ_CANDIDATO))) linhasCsv.push(r);
	});
	const linhas = agruparBens(linhasCsv, donos, ano);
	console.log(`[TSE BENS ${ano}] ${linhas.length} declaração(ões) de ${donos.size} candidatura(s) na janela.`);
	return linhas;
}

async function gravarBens(banco: SupabaseClient, linhas: LinhaBens[], trocaDePeriodo: boolean): Promise<void> {
	const naBase = await lerTudo<BensNaBase>((de, ate) => banco.from("tse_bens").select("sq_candidato,ano_eleicao,valor_total,cpf").order("sq_candidato").order("ano_eleicao").range(de, ate));
	const mudaram = bensQueMudaram(linhas, naBase);
	console.log(`[TSE BENS] ${mudaram.length} de ${linhas.length} declaração(ões) novas ou alteradas para gravar.`);
	for (let i = 0; i < mudaram.length; i += LOTE_GRAVACAO) {
		const { error } = await banco.from("tse_bens").upsert(mudaram.slice(i, i + LOTE_GRAVACAO), { onConflict: "sq_candidato,ano_eleicao" });
		if (error) throw new Error(`[TSE BENS] upsert falhou: ${error.message}`);
	}
	await apagarQuemSaiu(banco, naBase, linhas, trocaDePeriodo);
}

async function apagarQuemSaiu(banco: SupabaseClient, naBase: BensNaBase[], linhas: LinhaBens[], trocaDePeriodo: boolean): Promise<void> {
	const sairam = bensQueSairam(naBase, linhas, trocaDePeriodo);
	if (sairam === null) {
		console.warn(`[TSE BENS] Mais de ${LIMITE_SAIDA_BENS * 100}% das declarações sairiam: nada apagado (troca de período? rode com --troca-de-periodo).`);
		return;
	}
	for (const ano of new Set(sairam.map((s) => s.ano_eleicao))) {
		const sqs = sairam.filter((s) => s.ano_eleicao === ano).map((s) => s.sq_candidato);
		for (let i = 0; i < sqs.length; i += LOTE_LEITURA) {
			const { error } = await banco.from("tse_bens").delete().eq("ano_eleicao", ano).in("sq_candidato", sqs.slice(i, i + LOTE_LEITURA));
			if (error) throw new Error(`[TSE BENS] Remoção falhou: ${error.message}`);
		}
	}
	console.log(`[TSE BENS] ${sairam.length} declaração(ões) de quem saiu da janela removida(s).`);
}

function medir(linhas: LinhaBens[]): string {
	const bytes = linhas.reduce((t, l) => t + JSON.stringify(l).length, 0);
	return `${linhas.length} declarações, ${linhas.reduce((t, l) => t + l.bens.length, 0)} bens, ~${(bytes / 1e6).toFixed(1)} MB de dados`;
}

async function main() {
	const seco = process.argv.includes("--seco");
	const banco = bancoPerfil();
	const pessoas = await pessoasNaJanela(banco);
	const porCpf = new Map(pessoas.filter((p) => p.cpf).map((p) => [p.cpf as string, p as DonoDoSq]));
	console.log(`[TSE BENS] ${pessoas.length} pessoa(s) na janela de mandato (${porCpf.size} com CPF).`);
	const linhas: LinhaBens[] = [];
	for (const ano of ANOS_BENS) linhas.push(...(await bensDoAno(ano, pessoas, porCpf)));
	if (linhas.length < MINIMO) throw new Error(`[TSE BENS] ${linhas.length} declarações, abaixo do mínimo ${MINIMO}: nada gravado.`);
	console.log(`[TSE BENS] ${medir(linhas)}.`);
	if (seco) return;
	// Troca de período: na posse (ou até 45 dias depois) a saída grande de quem deixou a janela é esperada.
	const troca = process.argv.includes("--troca-de-periodo") || posseRecente();
	if (troca) console.log("[TSE BENS] Troca de período (posse recente ou --troca-de-periodo): quem saiu da janela sai da base.");
	await gravarBens(banco, linhas, troca);
	console.log("[TSE BENS] Concluído.");
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e?.message || e);
		process.exit(1);
	});
