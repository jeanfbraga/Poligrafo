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
import { execSync } from "child_process";
import path from "path";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error("ERRO: Faltando credenciais administrativas do Supabase.");
	process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
	auth: { autoRefreshToken: false, persistSession: false },
});

const BATCH_SIZE = 1000;
const TEMP_DIR = path.join(process.cwd(), ".tmp_tse");
const ANOS_DISPONIVEIS = ["2026", "2024", "2022"];

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

function downloadZipComCurl(url: string, zipPath: string): void {
	if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 1024) {
		console.log(`[TSE SYNC] Arquivo ZIP já em cache local: ${zipPath}`);
		return;
	}

	console.log(`[TSE SYNC] Baixando ${url}...`);
	execSync(
		`curl -f -sS -L -A "Poligrafo-Bot/1.0 (Auditoria Publica)" --retry 3 --retry-delay 2 -o "${zipPath}" "${url}"`,
		{ stdio: "inherit" }
	);

	if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 1024) {
		throw new Error(`[TSE SYNC] Download falhou ou arquivo inválido: ${zipPath}`);
	}
}

function extrairArquivoZip(zipPath: string, fileName: string, destDir: string): string {
	const outPath = path.join(destDir, fileName);
	if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
		return outPath;
	}

	console.log(`[TSE SYNC] Extraindo ${fileName}...`);
	try {
		execSync(`tar -xf "${zipPath}" -C "${destDir}" ${fileName}`, { stdio: "pipe" });
	} catch {
		execSync(`unzip -o "${zipPath}" "${fileName}" -d "${destDir}"`, { stdio: "pipe" });
	}

	if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 100) {
		throw new Error(`[TSE SYNC] Falha crítica na extração de ${fileName} a partir de ${zipPath}`);
	}
	return outPath;
}

function downloadAndExtract(ano: string): { csvCand: string; csvBens: string } {
	if (!fs.existsSync(TEMP_DIR)) {
		fs.mkdirSync(TEMP_DIR, { recursive: true });
	}

	const zipCand = path.join(TEMP_DIR, `consulta_cand_${ano}.zip`);
	const urlCand = `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`;
	downloadZipComCurl(urlCand, zipCand);
	const csvCand = extrairArquivoZip(zipCand, `consulta_cand_${ano}_BRASIL.csv`, TEMP_DIR);

	const zipBens = path.join(TEMP_DIR, `bem_candidato_${ano}.zip`);
	const urlBens = `https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ano}.zip`;
	downloadZipComCurl(urlBens, zipBens);
	const csvBens = extrairArquivoZip(zipBens, `bem_candidato_${ano}_BRASIL.csv`, TEMP_DIR);

	return { csvCand, csvBens };
}

function parseItemBem(record: any) {
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

async function processarBensCsv(
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

function parseCandidato(record: any, ano: number, bensMap: Map<string, any>) {
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

async function insertBatch(batch: any[]) {
	if (batch.length === 0) return;
	const { error } = await supabaseAdmin
		.from("tse_bens_historico")
		.upsert(batch, { onConflict: "cpf_candidato,ano_eleicao" });

	if (error) {
		throw new Error(`[TSE SYNC] Erro fatal no upsert de candidatos: ${error.message}`);
	}
}

async function processarCandidatosCsv(
	csvCandPath: string,
	bensMap: Map<string, any>,
	ano: number
) {
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
			await insertBatch(batch);
			count += batch.length;
			batch = [];
		}
	}

	if (batch.length > 0) {
		await insertBatch(batch);
		count += batch.length;
	}

	console.log(`[TSE SYNC ${ano}] Concluído! ${count} candidatos sincronizados no Supabase.`);
}

async function main() {
	const anos = parseAnoFiltro(process.argv.slice(2));
	console.log(`[TSE SYNC] Iniciando sincronização para os anos: ${anos.join(", ")}`);

	for (const anoStr of anos) {
		const ano = parseInt(anoStr, 10);
		console.log(`\n========================================`);
		console.log(`[TSE SYNC] PROCESSANDO ELEIÇÃO ${ano}`);
		console.log(`========================================`);

		const { csvCand, csvBens } = downloadAndExtract(anoStr);
		const bensMap = await processarBensCsv(csvBens);
		await processarCandidatosCsv(csvCand, bensMap, ano);
	}

	console.log(`\n[TSE SYNC] Todas as sincronizações foram concluídas com sucesso!`);
}

if (process.env.NODE_ENV !== "test") {
	main().catch((err) => {
		console.error("[TSE SYNC FATAL]:", err);
		process.exit(1);
	});
}
