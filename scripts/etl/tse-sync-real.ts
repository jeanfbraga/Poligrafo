#!/usr/bin/env tsx
/**
 * ETL: TSE Candidatos & Bens Declarados → tse_bens_historico (Supabase)
 *
 * Baixa os CSVs de Candidatos e Bens Declarados dos Dados Abertos do TSE
 * para as eleições de 2026 (Federal/Estadual), 2024 (Municipal) e 2022 (Federal/Estadual)
 * e sincroniza com a tabela `tse_bens_historico` do Supabase.
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

// Parser de argumentos
const args = process.argv.slice(2);
let anoFiltro = "2026";
const anoArg = args.find((a) => a.startsWith("--ano"));
if (anoArg) {
	if (anoArg.includes("=")) {
		anoFiltro = anoArg.split("=")[1];
	} else {
		const next = args[args.indexOf(anoArg) + 1];
		if (next) anoFiltro = next;
	}
}

const ANOS_DISPONIVEIS = ["2026", "2024", "2022"];
const anosParaProcessar =
	anoFiltro === "todos"
		? ANOS_DISPONIVEIS
		: ANOS_DISPONIVEIS.includes(anoFiltro)
			? [anoFiltro]
			: ["2026"];

function downloadAndExtract(ano: string) {
	if (!fs.existsSync(TEMP_DIR)) {
		fs.mkdirSync(TEMP_DIR, { recursive: true });
	}

	const zipCand = path.join(TEMP_DIR, `consulta_cand_${ano}.zip`);
	const csvCand = path.join(TEMP_DIR, `consulta_cand_${ano}_BRASIL.csv`);

	const zipBens = path.join(TEMP_DIR, `bem_candidato_${ano}.zip`);
	const csvBens = path.join(TEMP_DIR, `bem_candidato_${ano}_BRASIL.csv`);

	// 1. Download e extração de Candidatos
	if (!fs.existsSync(csvCand)) {
		console.log(`[TSE SYNC ${ano}] Baixando arquivo ZIP de Candidatos do TSE...`);
		try {
			execSync(
				`curl -L -o "${zipCand}" https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${ano}.zip`,
				{ stdio: "inherit" },
			);
		} catch (e: any) {
			console.error(`[TSE SYNC ${ano}] Falha no download de candidatos:`, e.message);
		}

		console.log(`[TSE SYNC ${ano}] Extraindo consulta_cand_${ano}_BRASIL.csv...`);
		try {
			execSync(
				`tar -xf "${zipCand}" -C "${TEMP_DIR}" consulta_cand_${ano}_BRASIL.csv`,
				{ stdio: "inherit" },
			);
		} catch (_e) {
			try {
				execSync(
					`unzip -o "${zipCand}" consulta_cand_${ano}_BRASIL.csv -d "${TEMP_DIR}"`,
					{ stdio: "inherit" },
				);
			} catch (err: any) {
				console.error(`[TSE SYNC ${ano}] Falha ao extrair candidatos:`, err.message);
			}
		}
	}

	// 2. Download e extração de Bens
	if (!fs.existsSync(csvBens)) {
		console.log(`[TSE SYNC ${ano}] Baixando arquivo ZIP de Bens Declarados do TSE...`);
		try {
			execSync(
				`curl -L -o "${zipBens}" https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_${ano}.zip`,
				{ stdio: "inherit" },
			);
		} catch (e: any) {
			console.error(`[TSE SYNC ${ano}] Falha no download de bens:`, e.message);
		}

		console.log(`[TSE SYNC ${ano}] Extraindo bem_candidato_${ano}_BRASIL.csv...`);
		try {
			execSync(
				`tar -xf "${zipBens}" -C "${TEMP_DIR}" bem_candidato_${ano}_BRASIL.csv`,
				{ stdio: "inherit" },
			);
		} catch (_e) {
			try {
				execSync(
					`unzip -o "${zipBens}" bem_candidato_${ano}_BRASIL.csv -d "${TEMP_DIR}"`,
					{ stdio: "inherit" },
				);
			} catch (err: any) {
				console.error(`[TSE SYNC ${ano}] Falha ao extrair bens:`, err.message);
			}
		}
	}

	return { csvCand, csvBens };
}

async function processarBensCsv(csvBensPath: string): Promise<Map<string, { valorTotal: number; bens: any[] }>> {
	const bensMap = new Map<string, { valorTotal: number; bens: any[] }>();
	if (!fs.existsSync(csvBensPath)) {
		console.log(`[TSE SYNC] Arquivo de bens não encontrado: ${csvBensPath}. Prosseguindo sem bens.`);
		return bensMap;
	}

	console.log(`[TSE SYNC] Parseando Bens Declarados: ${csvBensPath}`);
	return new Promise((resolve) => {
		const parser = fs.createReadStream(csvBensPath, "latin1").pipe(
			parse({
				columns: true,
				skip_empty_lines: true,
				delimiter: ";",
				relax_quotes: true,
				relax_column_count: true,
			}),
		);

		parser.on("readable", () => {
			let record: any;
			while ((record = parser.read()) !== null) {
				const sqCandidato = record["SQ_CANDIDATO"];
				if (!sqCandidato) continue;

				const valorRaw = (record["VR_BEM_CANDIDATO"] || "0").replace(/\./g, "").replace(",", ".");
				const valor = parseFloat(valorRaw) || 0;
				const tipo = record["DS_TIPO_BEM_CANDIDATO"] || "Ativo";
				const descricao = record["DS_BEM_CANDIDATO"] || "";

				const item = {
					tipoBem: tipo,
					descricao: descricao || tipo,
					valor,
				};

				if (!bensMap.has(sqCandidato)) {
					bensMap.set(sqCandidato, { valorTotal: valor, bens: [item] });
				} else {
					const entry = bensMap.get(sqCandidato)!;
					entry.valorTotal += valor;
					entry.bens.push(item);
				}
			}
		});

		parser.on("error", (err) => {
			console.warn("[TSE SYNC] Aviso ao parsear Bens CSV:", err.message);
			resolve(bensMap);
		});

		parser.on("end", () => {
			console.log(`[TSE SYNC] Bens parseados para ${bensMap.size} candidatos.`);
			resolve(bensMap);
		});
	});
}

async function processarCandidatosCsv(
	csvCandPath: string,
	bensMap: Map<string, { valorTotal: number; bens: any[] }>,
	ano: number,
) {
	if (!fs.existsSync(csvCandPath)) {
		console.error(`[TSE SYNC] Arquivo de candidatos não encontrado: ${csvCandPath}`);
		return;
	}

	console.log(`[TSE SYNC ${ano}] Parseando e inserindo Candidatos: ${csvCandPath}`);

	return new Promise((resolve, reject) => {
		let batch: any[] = [];
		let count = 0;
		const cpfsVistosNoAno = new Set<string>();

		const parser = fs.createReadStream(csvCandPath, "latin1").pipe(
			parse({
				columns: true,
				skip_empty_lines: true,
				delimiter: ";",
				relax_quotes: true,
				relax_column_count: true,
			}),
		);

		parser.on("readable", async () => {
			let record: any;
			while ((record = parser.read()) !== null) {
				const cpfRaw = record["NR_CPF_CANDIDATO"];
				const nomeRaw = record["NM_CANDIDATO"];
				if (!cpfRaw || !nomeRaw) continue;

				const docLimpo = cpfRaw.replace(/\D/g, "");
				if (!docLimpo || docLimpo.length !== 11) continue;

				// Evita duplicados no mesmo ano
				if (cpfsVistosNoAno.has(docLimpo)) continue;
				cpfsVistosNoAno.add(docLimpo);

				const sqCandidato = record["SQ_CANDIDATO"];
				const dadosBens = sqCandidato ? bensMap.get(sqCandidato) : null;

				batch.push({
					cpf_candidato: docLimpo,
					nome_candidato: nomeRaw.trim(),
					ano_eleicao: ano,
					valor_total: dadosBens ? dadosBens.valorTotal : 0,
					descricao_bens: dadosBens ? dadosBens.bens : [],
				});

				if (batch.length >= BATCH_SIZE) {
					parser.pause();
					await insertBatch(batch);
					count += batch.length;
					batch = [];
					parser.resume();
				}
			}
		});

		parser.on("error", (err) => {
			console.error(`[TSE SYNC ${ano}] Erro ao parsear CSV de candidatos:`, err.message);
			reject(err);
		});

		parser.on("end", async () => {
			if (batch.length > 0) {
				await insertBatch(batch);
				count += batch.length;
			}
			console.log(`[TSE SYNC ${ano}] Concluído! ${count} candidatos sincronizados no Supabase.`);
			resolve(true);
		});
	});
}

async function insertBatch(batch: any[]) {
	const { error } = await supabaseAdmin.from("tse_bens_historico").insert(batch);
	if (error) {
		console.error("[TSE SYNC] Erro ao inserir lote:", error.message);
	}
}

async function main() {
	console.log(`[TSE SYNC] Iniciando sincronização para os anos: ${anosParaProcessar.join(", ")}`);
	for (const anoStr of anosParaProcessar) {
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

main().catch(console.error);
