/**
 * Arquivos do TSE (cdn.tse.jus.br): baixar o zip com novas tentativas, listar e extrair um CSV,
 * e ler um bem declarado. Saiu de tse-sync-real.ts, a carga antiga de tse_bens_historico no
 * Banco Principal, aposentada em 12/10/2026 (ver tse-bens-sync.ts).
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const DOWNLOAD_DELAYS_MS = [15_000, 45_000, 90_000];

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
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Poligrafo/1.0",
			"-H",
			"Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"-H",
			"Accept-Language: pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
			"-H",
			"Referer: https://dadosabertos.tse.jus.br/",
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

async function executarFetchDownload(url: string, zipPath: string): Promise<void> {
	if (fs.existsSync(zipPath)) {
		fs.rmSync(zipPath, { force: true });
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 300_000); // 5 min timeout
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
				"Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				"Referer": "https://dadosabertos.tse.jus.br/",
			},
		});

		if (!res.ok) {
			throw new Error(`HTTP ${res.status}: ${res.statusText}`);
		}

		const fileStream = fs.createWriteStream(zipPath);
		const body = res.body;
		if (!body) throw new Error("Corpo da resposta HTTP nulo");

		const reader = body.getReader();
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
						fileStream.write(value);
					}
				} catch (e) {
					fileStream.destroy();
					reject(e);
				}
			};
			void pump();
		});

		if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size <= 1024) {
			throw new Error("Arquivo ZIP baixado via fetch é menor que 1KB ou inexistente");
		}
	} finally {
		clearTimeout(timer);
	}
}

async function tentarDownloadZip(url: string, zipPath: string): Promise<void> {
	try {
		await executarFetchDownload(url, zipPath);
		console.log(
			`[TSE SYNC] Download concluído via fetch: ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)}MB`
		);
	} catch (fetchErr: any) {
		console.warn(`[TSE SYNC] Fetch falhou (${fetchErr.message}). Tentando via curl...`);
		executarCurlDownload(url, zipPath);
		console.log(
			`[TSE SYNC] Download concluído via curl: ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)}MB`
		);
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
			await tentarDownloadZip(url, zipPath);
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
