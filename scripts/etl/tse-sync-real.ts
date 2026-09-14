#!/usr/bin/env tsx
/**
 * ETL: TSE Candidatos & Bens Declarados → tse_bens_historico (Supabase)
 *
 * Baixa os CSVs de Candidatos e Bens Declarados dos Dados Abertos do TSE
 * para as eleições de 2026 (Federal/Estadual), 2024 (Municipal) e 2022 (Federal/Estadual)
 * e sincroniza de forma idempotente (upsert) com a tabela `tse_bens_historico`.
 *
 * Fontes:
 *   https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/
 *   https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/
 *
 * Uso:
 *   npx tsx scripts/etl/tse-sync-real.ts
 *   npx tsx scripts/etl/tse-sync-real.ts --ano 2026
 *   npx tsx scripts/etl/tse-sync-real.ts --ano 2024
 *   npx tsx scripts/etl/tse-sync-real.ts --ano todos
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";
import { parse } from "csv-parse";
import { execFileSync } from "child_process";
import path from "path";

dotenv.config({ path: ".env.local" });

const BATCH_SIZE = 1000;
const TEMP_DIR = path.join(process.cwd(), ".tmp_tse");
const ANOS_DISPONIVEIS = ["2026", "2024", "2022"];
const DOWNLOAD_DELAYS_MS = [15_000, 45_000, 90_000];

const MIN_REGISTROS_TSE: Record<number, number> = {
	2022: 10_000,
	2024: 1_000,
	2026: 500,
};

export function getSupabaseAdmin() {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		throw new Error("Faltando credenciais administrativas do Supabase.");
	}

	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

export function minimoRegistrosTse(ano: number): number {
	return MIN_REGISTROS_TSE[ano] ?? 500;
}

export function parseAnoFiltro(args: string[]): string[] {
	const anoArg = args.find((a) => a.startsWith("--ano"));
	if (!anoArg) return ["2026"];

	let valor = "2026";
	if (anoArg.includes("=")) {
		valor = anoArg.split("=")[1];
	} else {
		const next = args[args.indexOf(anoArg) + 1];
		if (next) valor = next;
	}

	if (valor === "todos") return ANOS_DISPONIVEIS;
	return ANOS_DISPONIVEIS.includes(valor) ? [valor] : ["2026"];
}

export function listarArquivosZip(zipPath: string): string[] {
	let output = "";
	try {
		output = execFileSync("tar", ["-tf", zipPath], {
			encoding: "utf8",
			stdio: ["pipe", "pipe", "pipe"],
			maxBuffer: 50 * 1024 * 1024,
		});
	} catch {
		try {
			output = execFileSync("unzip", ["-Z1", zipPath], {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "pipe"],
				maxBuffer: 50 * 1024 * 1024,
			});
		} catch {
			const raw = execFileSync("unzip", ["-l", zipPath], {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "pipe"],
				maxBuffer: 50 * 1024 * 1024,
			});
			const lines = raw.split(/\r?\n/);
			return lines
				.map((line) => line.trim().split(/\s+/).pop() || "")
				.filter((name) => name && !name.startsWith("---") && !name.endsWith("/") && !name.includes("Archive:"));
		}
	}

	return output
		.split(/\r?\n/)
		.map((f) => f.trim())
		.filter((f) => f.length > 0 && !f.endsWith("/"));
}

export function encontrarArquivoNoZip(arquivos: string[], padrao: RegExp): string {
	const matchBrasil = arquivos.find((f) => padrao.test(f) && /BRASIL/i.test(f));
	if (matchBrasil) return matchBrasil;

	const matchCsv = arquivos.find((f) => padrao.test(f) && /\.csv$/i.test(f));
	if (matchCsv) return matchCsv;

	const match = arquivos.find((f) => padrao.test(f));
	if (match) return match;

	throw new Error(
		`[TSE SYNC] Nenhum arquivo correspondente ao padrão ${padrao.source} foi encontrado no ZIP. Arquivos presentes: ${arquivos.slice(0, 5).join(", ")}`
	);
}

function resolverNomeArquivo(padraoOuNome: RegExp | string, arquivos: string[]): string {
	if (typeof padraoOuNome === "string" && arquivos.includes(padraoOuNome)) {
		return padraoOuNome;
	}
	const padrao = typeof padraoOuNome === "string"
		? new RegExp(padraoOuNome.replace(/_BRASIL/i, ".*").replace(/\.csv$/i, "\\.csv$"), "i")
		: padraoOuNome;
	return encontrarArquivoNoZip(arquivos, padrao);
}

function descompactarComCli(zipPath: string, destDir: string, fileName: string): boolean {
	try {
		execFileSync("tar", ["-xf", zipPath, "-C", destDir, fileName], { stdio: "pipe" });
		return true;
	} catch {
		try {
			execFileSync("unzip", ["-o", zipPath, fileName, "-d", destDir], { stdio: "pipe" });
			return true;
		} catch {
			try {
				execFileSync("unzip", ["-j", "-o", zipPath, fileName, "-d", destDir], { stdio: "pipe" });
				return true;
			} catch {
				return false;
			}
		}
	}
}

export function extrairArquivoZip(
	zipPath: string,
	padraoOuNome: RegExp | string,
	destDir: string
): string {
	const arquivos = listarArquivosZip(zipPath);
	const fileName = resolverNomeArquivo(padraoOuNome, arquivos);
	const outPath = path.join(destDir, path.basename(fileName));

	if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
		return outPath;
	}

	console.log(`[TSE SYNC] Extraindo ${fileName} de ${path.basename(zipPath)}...`);
	const extraiu = descompactarComCli(zipPath, destDir, fileName);

	if (!extraiu || !fs.existsSync(outPath) || fs.statSync(outPath).size < 100) {
		throw new Error(`[TSE SYNC] Falha crítica na extração de ${fileName} a partir de ${zipPath}`);
	}
	return outPath;
}

function executarCurlDownload(url: string, zipPath: string): void {
	const curlBin = process.platform === "win32" ? "curl.exe" : "curl";
	if (fs.existsSync(zipPath)) {
		fs.rmSync(zipPath, { force: true });
	}
	execFileSync(
		curlBin,
		[
			"-f",
			"-sS",
			"-L",
			"-A",
			"Poligrafo-Bot/1.0 (Auditoria Publica)",
			"--connect-timeout",
			"30",
			"--max-time",
			"300",
			"-o",
			zipPath,
			url,
		],
		{ stdio: ["pipe", "inherit", "pipe"] }
	);

	if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size <= 1024) {
		throw new Error("Arquivo ZIP baixado é menor que 1KB ou inexistente");
	}
}

export async function downloadZipComCurl(
	url: string,
	zipPath: string,
	maxTentativas = 4,
	delays = DOWNLOAD_DELAYS_MS,
	waitFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<void> {
	if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 1024) {
		console.log(`[TSE SYNC] Arquivo ZIP já em cache local: ${zipPath}`);
		return;
	}

	for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
		console.log(`[TSE SYNC] Baixando ${url} (tentativa ${tentativa}/${maxTentativas})...`);
		try {
			executarCurlDownload(url, zipPath);
			console.log(
				`[TSE SYNC] Download concluído com sucesso: ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)}MB`
			);
			return;
		} catch (err: any) {
			const errMsg = err?.stderr?.toString() || err?.message || String(err);
			console.warn(`[TSE SYNC] Falha no download (tentativa ${tentativa}/${maxTentativas}): ${errMsg}`);

			if (fs.existsSync(zipPath)) {
				fs.rmSync(zipPath, { force: true });
			}

			if (tentativa === maxTentativas) {
				throw new Error(`[TSE SYNC] Download falhou após ${maxTentativas} tentativas para ${url}: ${errMsg}`);
			}

			const delay = delays[tentativa - 1] ?? 15_000;
			console.log(`[TSE SYNC] Aguardando ${delay / 1000}s antes da tentativa ${tentativa + 1}...`);
			await waitFn(delay);
		}
	}
}

export function parseItemBem(record: any) {
	const sqCandidato = record["SQ_CANDIDATO"];
	if (!sqCandidato) return null;

	const valorRaw = (record["VR_BEM_CANDIDATO"] || "0").replace(/\./g, "").replace(",", ".");
	const valor = parseFloat(valorRaw) || 0;
	const tipo = record["DS_TIPO_BEM_CANDIDATO"] || "Ativo";
	const descricao = record["DS_BEM_CANDIDATO"] || "";

	return {
		sqCandidato,
		item: {
			tipoBem: tipo,
			descricao: descricao || tipo,
			valor,
		},
		valor,
	};
}

export async function processarBensCsv(
	csvBensPath: string
): Promise<Map<string, { valorTotal: number; bens: any[] }>> {
	const bensMap = new Map<string, { valorTotal: number; bens: any[] }>();
	if (!fs.existsSync(csvBensPath)) {
		throw new Error(`[TSE SYNC] Arquivo de bens obrigatório ausente: ${csvBensPath}`);
	}

	console.log(`[TSE SYNC] Parseando Bens Declarados: ${csvBensPath}`);
	const parser = fs.createReadStream(csvBensPath, "latin1").pipe(
		parse({
			columns: true,
			skip_empty_lines: true,
			delimiter: ";",
			relax_quotes: true,
			relax_column_count: true,
		})
	);

	for await (const record of parser) {
		const parsed = parseItemBem(record);
		if (!parsed) continue;

		const existing = bensMap.get(parsed.sqCandidato);
		if (!existing) {
			bensMap.set(parsed.sqCandidato, { valorTotal: parsed.valor, bens: [parsed.item] });
		} else {
			existing.valorTotal += parsed.valor;
			existing.bens.push(parsed.item);
		}
	}

	if (bensMap.size === 0) {
		throw new Error(`[TSE SYNC] Nenhum bem foi encontrado no arquivo ${csvBensPath}. Abortando para integridade.`);
	}

	console.log(`[TSE SYNC] Bens parseados para ${bensMap.size} candidatos.`);
	return bensMap;
}

export function parseCandidato(record: any, ano: number, bensMap: Map<string, any>) {
	const cpfRaw = record["NR_CPF_CANDIDATO"];
	const nomeRaw = record["NM_CANDIDATO"];
	if (!cpfRaw || !nomeRaw) return null;

	const docLimpo = cpfRaw.replace(/\D/g, "");
	if (!docLimpo || docLimpo.length !== 11) return null;

	const sqCandidato = record["SQ_CANDIDATO"];
	const dadosBens = sqCandidato ? bensMap.get(sqCandidato) : null;

	return {
		cpf_candidato: docLimpo,
		nome_candidato: nomeRaw.trim(),
		ano_eleicao: ano,
		valor_total: dadosBens ? dadosBens.valorTotal : 0,
		descricao_bens: dadosBens ? dadosBens.bens : [],
	};
}

async function insertBatch(batch: any[], client = getSupabaseAdmin()) {
	if (batch.length === 0) return;
	const { error } = await client
		.from("tse_bens_historico")
		.upsert(batch, { onConflict: "cpf_candidato,ano_eleicao" });

	if (error) {
		throw new Error(`[TSE SYNC] Erro fatal no upsert de candidatos: ${error.message}`);
	}
}

export async function processarCandidatosCsv(
	csvCandPath: string,
	bensMap: Map<string, any>,
	ano: number,
	client = getSupabaseAdmin()
): Promise<number> {
	if (!fs.existsSync(csvCandPath)) {
		throw new Error(`[TSE SYNC] Arquivo de candidatos não encontrado: ${csvCandPath}`);
	}

	console.log(`[TSE SYNC ${ano}] Parseando e inserindo Candidatos: ${csvCandPath}`);
	let batch: any[] = [];
	let count = 0;
	const cpfsVistos = new Set<string>();

	const parser = fs.createReadStream(csvCandPath, "latin1").pipe(
		parse({
			columns: true,
			skip_empty_lines: true,
			delimiter: ";",
			relax_quotes: true,
			relax_column_count: true,
		})
	);

	for await (const record of parser) {
		const cand = parseCandidato(record, ano, bensMap);
		if (!cand || cpfsVistos.has(cand.cpf_candidato)) continue;

		cpfsVistos.add(cand.cpf_candidato);
		batch.push(cand);

		if (batch.length >= BATCH_SIZE) {
			await insertBatch(batch, client);
			count += batch.length;
			batch = [];
		}
	}

	if (batch.length > 0) {
		await insertBatch(batch, client);
		count += batch.length;
	}

	console.log(`[TSE SYNC ${ano}] Concluído! ${count} candidatos sincronizados no Supabase.`);
	return count;
}

export async function downloadAndExtract(
	ano: string,
	tempDir = TEMP_DIR,
	waitFn?: (ms: number) => Promise<void>
): Promise<{ csvCand: string; csvBens: string }> {
	if (!fs.existsSync(tempDir)) {
		fs.mkdirSync(tempDir, { recursive: true });
	}

	const zipCand = path.join(tempDir, `consulta_cand_${ano}.zip`);
	const urlCand = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`;
	await downloadZipComCurl(urlCand, zipCand, 4, undefined, waitFn);
	const csvCand = extrairArquivoZip(zipCand, new RegExp(`consulta_cand_${ano}.*\\.csv$`, "i"), tempDir);

	const zipBens = path.join(tempDir, `bem_candidato_${ano}.zip`);
	const urlBens = `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ano}.zip`;
	await downloadZipComCurl(urlBens, zipBens, 4, undefined, waitFn);
	const csvBens = extrairArquivoZip(zipBens, new RegExp(`bem_candidato_${ano}.*\\.csv$`, "i"), tempDir);

	return { csvCand, csvBens };
}

export async function sincronizarAno(
	anoStr: string,
	client = getSupabaseAdmin(),
	waitFn?: (ms: number) => Promise<void>,
	tempDir = TEMP_DIR
): Promise<number> {
	const ano = parseInt(anoStr, 10);
	console.log(`\n========================================`);
	console.log(`[TSE SYNC] PROCESSANDO ELEIÇÃO ${ano}`);
	console.log(`========================================`);

	const { csvCand, csvBens } = await downloadAndExtract(anoStr, tempDir, waitFn);
	const bensMap = await processarBensCsv(csvBens);
	const count = await processarCandidatosCsv(csvCand, bensMap, ano, client);

	const minEsperado = minimoRegistrosTse(ano);
	if (count < minEsperado) {
		throw new Error(
			`[TSE SYNC ${ano}] Quantidade de registros (${count}) inferior ao mínimo esperado (${minEsperado}). Abortando para integridade.`
		);
	}

	console.log(`[TSE SYNC ${ano}] Sincronização concluída com sucesso (${count} registros).`);
	return count;
}

export async function main(client = getSupabaseAdmin(), waitFn?: (ms: number) => Promise<void>): Promise<void> {
	const anos = parseAnoFiltro(process.argv.slice(2));
	console.log(`[TSE SYNC] Iniciando sincronização para os anos: ${anos.join(", ")}`);

	let sucessos = 0;
	let falhas = 0;
	const erros: Record<string, string> = {};

	for (const anoStr of anos) {
		try {
			await sincronizarAno(anoStr, client, waitFn);
			sucessos++;
		} catch (err: any) {
			falhas++;
			erros[anoStr] = err?.message || String(err);
			console.error(`[TSE SYNC ${anoStr}] ERRO ao processar eleição ${anoStr}:`, err?.message || err);
		}
	}

	console.log(`\n========================================`);
	console.log(`[TSE SYNC] RESUMO DA EXECUÇÃO:`);
	console.log(`Sucessos: ${sucessos} | Falhas: ${falhas}`);
	if (falhas > 0) {
		console.error("Detalhes das falhas:", erros);
	}
	console.log(`========================================`);

	if (sucessos === 0) {
		throw new Error(`[TSE SYNC] Todos os anos processados (${anos.join(", ")}) falharam.`);
	}
}

const isDirectRun =
	process.argv[1] &&
	(process.argv[1].endsWith("tse-sync-real.ts") || process.argv[1].endsWith("tse-sync-real.js"));

if (process.env.NODE_ENV !== "test" && isDirectRun) {
	main().catch((err) => {
		console.error("[TSE SYNC FATAL]:", err?.message || err);
		process.exit(1);
	});
}
