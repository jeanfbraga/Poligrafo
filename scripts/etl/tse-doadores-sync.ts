#!/usr/bin/env tsx
/**
 * ETL: TSE Doadores de Campanha → tse_doadores_cache (Supabase)
 *
 * Baixa os CSVs de Receitas (doações recebidas) dos Dados Abertos do TSE
 * para as eleições de 2022 (Federal/Estadual) e 2024 (Municipal) e sincroniza
 * com a tabela `tse_doadores_cache` do Supabase.
 *
 * Fonte: cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/
 * Não há WAF nesse domínio — livre para automação.
 *
 * Uso:
 *   npx tsx scripts/etl/tse-doadores-sync.ts
 *   npx tsx scripts/etl/tse-doadores-sync.ts --ano 2022
 *   npx tsx scripts/etl/tse-doadores-sync.ts --ano 2024
 *   npx tsx scripts/etl/tse-doadores-sync.ts --ano todos
 */

import { createClient } from "@supabase/supabase-js";
import { createWriteStream, createReadStream } from "fs";
import { mkdir, unlink, stat } from "fs/promises";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import * as unzipper from "unzipper";
import { parse } from "csv-parse";
import path from "path";
import os from "os";
import dotenv from "dotenv";

// Carrega as variáveis do .env.local para testes locais
dotenv.config({ path: ".env.local" });

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
	console.error("[ETL] ERRO: Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Diretório temporário para downloads
const TEMP_DIR = path.join(os.tmpdir(), "politgrafo-etl-tse");

// Fontes de dados por eleição
const FONTES: Record<string, { zipUrl: string; csvPattern: RegExp; descricao: string }[]> = {
	"2022": [
		{
			// Receitas dos candidatos 2022 (Federal + Estadual)
			zipUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2022.zip",
			csvPattern: /receitas_candidatos_2022/i,
			descricao: "Receitas de Candidatos 2022 (Federal + Estadual)",
		},
	],
	"2024": [
		{
			// Receitas dos candidatos 2024 (Municipal)
			zipUrl: "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2024.zip",
			csvPattern: /receitas_candidatos_2024/i,
			descricao: "Receitas de Candidatos 2024 (Municipal)",
		},
	],
};

// Cargos a incluir (numeração TSE)
// 1=Presidente, 3=Governador, 5=Senador, 6=Dep.Federal, 7=Dep.Estadual, 11=Prefeito, 13=Vereador
const CARGOS_INCLUIDOS = new Set(["1", "3", "5", "6", "7", "11", "13"]);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function logStep(step: string, msg: string) {
	const now = new Date().toISOString().substring(11, 19);
	console.log(`[${now}] [${step}] ${msg}`);
}

async function downloadFile(url: string, destPath: string): Promise<void> {
	logStep("DOWNLOAD", `Iniciando: ${url}`);
	logStep("DOWNLOAD", `Destino: ${destPath}`);

	try {
		const st = await stat(destPath);
		if (st.size > 100 * 1024 * 1024) { // mais de 100MB
			logStep("DOWNLOAD", `Arquivo já existe com ${(st.size / 1024 / 1024).toFixed(1)}MB. Pulando download.`);
			return;
		}
	} catch (e) {}

	const res = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 Polígrafo-ETL/1.0 (https://github.com/jeanfbraga/Poligrafo)",
		},
	});

	if (!res.ok) {
		throw new Error(`HTTP ${res.status} ao baixar ${url}`);
	}

	const contentLength = res.headers.get("content-length");
	const totalMB = contentLength ? (parseInt(contentLength) / 1024 / 1024).toFixed(1) : "?";
	logStep("DOWNLOAD", `Tamanho: ${totalMB}MB — baixando em streaming...`);

	const fileStream = createWriteStream(destPath);
	const body = res.body;
	if (!body) throw new Error("Response body is null");

	let downloadedBytes = 0;
	let lastLogBytes = 0;

	const reader = body.getReader();
	const writer = fileStream;

	await new Promise<void>((resolve, reject) => {
		fileStream.on("error", reject);
		fileStream.on("finish", resolve);

		const pump = async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						fileStream.end();
						break;
					}
					downloadedBytes += value.length;
					fileStream.write(value);

					// Log a cada 50MB
					if (downloadedBytes - lastLogBytes > 50 * 1024 * 1024) {
						lastLogBytes = downloadedBytes;
						logStep(
							"DOWNLOAD",
							`${(downloadedBytes / 1024 / 1024).toFixed(1)}MB baixados...`,
						);
					}
				}
			} catch (err) {
				reject(err);
			}
		};
		pump();
	});

	logStep("DOWNLOAD", `Concluído: ${(downloadedBytes / 1024 / 1024).toFixed(1)}MB`);
}

async function extrairCSVDoZip(
	zipPath: string,
	csvPattern: RegExp,
	destDir: string,
): Promise<string[]> {
	logStep("EXTRACT", `Extraindo CSVs do ZIP (padrão: ${csvPattern.source})...`);

	return new Promise((resolve, reject) => {
		const extractedFiles: string[] = [];
		const promises: Promise<void>[] = [];

		createReadStream(zipPath)
			.pipe(unzipper.Parse())
			.on("entry", (entry: any) => {
				const fileName = entry.path;
				
				if (csvPattern.test(fileName)) {
					logStep("EXTRACT", `Match de extração: ${fileName}`);
					const outPath = path.join(destDir, path.basename(fileName));
					extractedFiles.push(outPath);
					
					const p = new Promise<void>((res, rej) => {
						entry.pipe(createWriteStream(outPath))
							.on("finish", () => {
								logStep("EXTRACT", `Salvo: ${path.basename(fileName)}`);
								res();
							})
							.on("error", rej);
					});
					promises.push(p);
				} else {
					entry.autodrain();
				}
			})
			.on("finish", async () => {
				try {
					await Promise.all(promises);
					resolve(extractedFiles);
				} catch (err) {
					reject(err);
				}
			})
			.on("error", reject);
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSAMENTO CSV — agrupamento de doadores por candidato
// ─────────────────────────────────────────────────────────────────────────────

interface EntryDoador {
	nomeCandidato: string;
	nomeUrna: string;
	uf: string;
	cargo: string;
	cpfCnpjDoador: string;
}

async function processarCSVReceitas(csvPath: string): Promise<Map<string, string[]>> {
	logStep("CSV", `Processando: ${csvPath}`);

	// Mapa: "nomeUrna|uf" → Set<cpfCnpj>
	const grupos = new Map<string, Set<string>>();
	let linhasProcessadas = 0;
	let linhasIgnoradas = 0;

	return new Promise((resolve, reject) => {
		const parser = parse({
			delimiter: ";",
			columns: true,
			encoding: "latin1",
			skip_empty_lines: true,
			relaxColumnCount: true,
		});

		parser.on("readable", () => {
			let record: Record<string, string>;
			while ((record = parser.read()) !== null) {
				linhasProcessadas++;

				if (linhasProcessadas % 100000 === 0) {
					logStep("CSV", `${linhasProcessadas.toLocaleString()} linhas processadas...`);
				}

				// Identifica as colunas do CSV do TSE (podem variar entre anos)
				const cargo =
					record["CD_CARGO"] ||
					record["CD_CARGO_CANDIDATO"] ||
					record["Código Cargo"] ||
					record["SG_CARGO"] ||
					"";

				// Filtra apenas cargos relevantes
				if (!CARGOS_INCLUIDOS.has(cargo.trim())) {
					linhasIgnoradas++;
					continue;
				}

				const nomeUrna = (
					record["NM_CANDIDATO"] ||
					record["NM_URNA_CANDIDATO"] ||
					record["Nome Urna Candidato"] ||
					record["SG_UE_SUPERIOR"] || // fallback
					""
				).trim();

				const uf =
					(record["SG_UF"] || record["UF"] || record["SG_UE"] || "").trim().toUpperCase();

				// CPF/CNPJ do doador — coluna varia por ano
				const cpfCnpj = (
					record["NR_CPF_CNPJ_DOADOR"] ||
					record["CPF/CNPJ do doador"] ||
					record["NR_CPF_CNPJ"] ||
					""
				).replace(/\D/g, "");

				if (!nomeUrna || !uf || !cpfCnpj || cpfCnpj.length < 11) {
					continue;
				}

				const chave = `${nomeUrna.toLowerCase()}|${uf}`;

				if (!grupos.has(chave)) {
					grupos.set(chave, new Set());
				}
				grupos.get(chave)!.add(cpfCnpj);
			}
		});

		parser.on("error", reject);
		parser.on("end", () => {
			logStep(
				"CSV",
				`Processamento concluído: ${linhasProcessadas.toLocaleString()} linhas, ${grupos.size} candidatos únicos. (${linhasIgnoradas.toLocaleString()} linhas ignoradas por cargo)`,
			);

			// Converte Sets para Arrays
			const resultado = new Map<string, string[]>();
			for (const [chave, set] of grupos) {
				resultado.set(chave, [...set]);
			}
			resolve(resultado);
		});

		createReadStream(csvPath).pipe(parser);
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// UPSERT NO SUPABASE — em batches
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 200;

async function sincronizarComSupabase(
	dados: Map<string, string[]>,
): Promise<void> {
	logStep("SUPABASE", `Iniciando upsert de ${dados.size} candidatos...`);

	const registros = [...dados.entries()].map(([chave, doadores]) => {
		const [nome_politico, uf] = chave.split("|");
		return { nome_politico, uf, doadores };
	});

	let sincronizados = 0;
	let erros = 0;

	for (let i = 0; i < registros.length; i += BATCH_SIZE) {
		const batch = registros.slice(i, i + BATCH_SIZE);

		const { error } = await supabase
			.from("tse_doadores_cache")
			.upsert(batch, { onConflict: "nome_politico,uf" });

		if (error) {
			logStep("SUPABASE", `Erro no batch ${i / BATCH_SIZE + 1}: ${error.message}`);
			erros++;
		} else {
			sincronizados += batch.length;
		}

		if (sincronizados % 2000 === 0 && sincronizados > 0) {
			logStep("SUPABASE", `${sincronizados}/${registros.length} candidatos sincronizados...`);
		}
	}

	logStep(
		"SUPABASE",
		`Upsert concluído: ${sincronizados} sincronizados, ${erros} batches com erro.`,
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// LIMPEZA DE ARQUIVOS TEMPORÁRIOS
// ─────────────────────────────────────────────────────────────────────────────

async function limparTemp(files: string[]) {
	for (const f of files) {
		try {
			await unlink(f);
			logStep("CLEANUP", `Removido: ${f}`);
		} catch (err) {
			logStep("CLEANUP-ERRO", `Falha ao remover ${f}: ${err}`);
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function processarAno(ano: string) {
	const fontes = FONTES[ano];
	if (!fontes) {
		logStep("ERRO", `Ano '${ano}' não suportado. Use '2022' ou '2024'.`);
		return;
	}

	for (const fonte of fontes) {
		logStep("START", `=== Processando: ${fonte.descricao} ===`);

		const zipPath = path.join(TEMP_DIR, `receitas_${ano}.zip`);
		let tempFiles: string[] = [zipPath];

		try {
			// 1. Download
			await downloadFile(fonte.zipUrl, zipPath);

			// 2. Extrair CSV(s) do ZIP
			let extraidos = await extrairCSVDoZip(zipPath, fonte.csvPattern, TEMP_DIR);

			if (extraidos.length === 0) {
				logStep("EXTRACT", `Padrão principal não encontrado, tentando padrão amplo...`);
				extraidos = await extrairCSVDoZip(zipPath, /receitas.*candidatos.*\.csv/i, TEMP_DIR);
			}

			if (extraidos.length === 0) {
				logStep("ERRO", `Nenhum CSV encontrado no ZIP de ${ano}. Pulando.`);
				continue;
			}

			tempFiles = tempFiles.concat(extraidos);

			// 3. Processar cada CSV extraído e agregar
			const dadosAgregados = new Map<string, Set<string>>();

			for (const arquivoCsv of extraidos) {
				const dados = await processarCSVReceitas(arquivoCsv);
				
				// Combina os resultados
				for (const [chave, doadores] of dados.entries()) {
					if (!dadosAgregados.has(chave)) {
						dadosAgregados.set(chave, new Set());
					}
					const setAtual = dadosAgregados.get(chave)!;
					for (const d of doadores) {
						setAtual.add(d);
					}
				}
			}

			// Converter os Sets para arrays finais
			const dadosFinais = new Map<string, string[]>();
			for (const [chave, doadoresSet] of dadosAgregados.entries()) {
				dadosFinais.set(chave, Array.from(doadoresSet));
			}

			// 4. Sincronizar com Supabase
			if (dadosFinais.size > 0) {
				await sincronizarComSupabase(dadosFinais);
			} else {
				logStep("AVISO", "Nenhum dado extraído dos CSVs. Verifique o formato das colunas.");
			}
		} catch (err) {
			logStep("ERRO", `Falha ao processar ${ano}: ${err}`);
		} finally {
			await limparTemp(tempFiles);
		}

		logStep("DONE", `=== Concluído: ${fonte.descricao} ===\n`);
	}
}

async function main() {
	const args = process.argv.slice(2);
	const anoArg = args.find((a) => a.startsWith("--ano="))?.split("=")[1] || "todos";

	console.log("╔════════════════════════════════════════════════════════════╗");
	console.log("║  Polígrafo ETL — Doadores TSE → Supabase                   ║");
	console.log("╚════════════════════════════════════════════════════════════╝\n");

	// Cria diretório temporário
	await mkdir(TEMP_DIR, { recursive: true });
	logStep("INIT", `Diretório temp: ${TEMP_DIR}`);

	const anos = anoArg === "todos" ? ["2022", "2024"] : [anoArg];

	for (const ano of anos) {
		await processarAno(ano);
	}

	console.log("\n╔════════════════════════════════════════════════════════════╗");
	console.log("║  ETL Finalizado com sucesso!                                ║");
	console.log("╚════════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
	console.error("[ETL FATAL]", err);
	process.exit(1);
});
