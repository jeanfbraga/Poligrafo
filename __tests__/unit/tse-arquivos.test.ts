import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { downloadZipComCurl, encontrarArquivoNoZip, extrairArquivoZip, listarArquivosZip, parseItemBem } from "../../scripts/etl/tse-arquivos";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));

describe("Arquivos do TSE - download, zip e bens", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tse-teste-"));
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});
	describe("encontrarArquivoNoZip", () => {
		it("prioriza arquivo consolidado BRASIL", () => {
			const arquivos = [
				"consulta_cand_2022_SP.csv",
				"consulta_cand_2022_RJ.csv",
				"consulta_cand_2022_BRASIL.csv",
				"leia-me.pdf",
			];
			const match = encontrarArquivoNoZip(arquivos, /consulta_cand_2022.*\.csv$/i);
			expect(match).toBe("consulta_cand_2022_BRASIL.csv");
		});

		it("encontra arquivo CSV correspondente caso não haja BRASIL", () => {
			const arquivos = [
				"consulta_cand_2024_SP.csv",
				"leia-me.pdf",
			];
			const match = encontrarArquivoNoZip(arquivos, /consulta_cand_2024.*\.csv$/i);
			expect(match).toBe("consulta_cand_2024_SP.csv");
		});

		it("lança erro se nenhum arquivo casar com o padrão", () => {
			const arquivos = ["outro_arquivo.txt", "leia-me.pdf"];
			expect(() => encontrarArquivoNoZip(arquivos, /consulta_cand_2026.*\.csv$/i)).toThrow(
				/Nenhum arquivo correspondente ao padrão/
			);
		});
	});

	describe("parseItemBem", () => {
		it("retorna null se SQ_CANDIDATO estiver ausente", () => {
			expect(parseItemBem({})).toBeNull();
		});

		it("converte valores monetários formatados em pt-BR corretamente", () => {
			const record = {
				SQ_CANDIDATO: "123456",
				VR_BEM_CANDIDATO: "1.234.567,89",
				DS_TIPO_BEM_CANDIDATO: "Imóvel",
				DS_BEM_CANDIDATO: "Casa residencial",
			};
			const res = parseItemBem(record);
			expect(res).not.toBeNull();
			expect(res?.sqCandidato).toBe("123456");
			expect(res?.valor).toBe(1234567.89);
			expect(res?.item.tipoBem).toBe("Imóvel");
			expect(res?.item.descricao).toBe("Casa residencial");
		});
	});

	describe("downloadZipComCurl", () => {
		beforeEach(() => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch desabilitado no teste unitario")));
		});

		it("reutiliza cache se arquivo existir com mais de 1KB", async () => {
			const zipFile = path.join(tempDir, "teste.zip");
			fs.writeFileSync(zipFile, Buffer.alloc(2048));

			const wait = vi.fn();
			await downloadZipComCurl("https://cdn.tse.jus.br/teste.zip", zipFile, 4, [10], wait);

			expect(execFileSync).not.toHaveBeenCalled();
			expect(wait).not.toHaveBeenCalled();
		});

		it("faz retry com backoff quando o curl falha (ex: HTTP 403) e recupera", async () => {
			const zipFile = path.join(tempDir, "teste.zip");
			let attempts = 0;

			vi.mocked(execFileSync).mockImplementation(() => {
				attempts++;
				if (attempts === 1) {
					throw new Error("curl (22): The requested URL returned error: 403");
				}
				fs.writeFileSync(zipFile, Buffer.alloc(5000));
				return Buffer.alloc(0);
			});

			const wait = vi.fn().mockResolvedValue(undefined);
			await downloadZipComCurl(
				"https://cdn.tse.jus.br/teste.zip",
				zipFile,
				4,
				[15_000, 45_000, 90_000],
				wait
			);

			expect(attempts).toBe(2);
			expect(wait).toHaveBeenCalledWith(15_000);
			expect(fs.existsSync(zipFile)).toBe(true);
		});

		it("lança erro após esgotar todas as tentativas", async () => {
			const zipFile = path.join(tempDir, "teste.zip");

			vi.mocked(execFileSync).mockImplementation(() => {
				throw new Error("curl (22): 403 Forbidden");
			});

			const wait = vi.fn().mockResolvedValue(undefined);
			await expect(
				downloadZipComCurl(
					"https://cdn.tse.jus.br/teste.zip",
					zipFile,
					3,
					[100, 200],
					wait
				)
			).rejects.toThrow(/Download falhou após 3 tentativas/);

			expect(wait).toHaveBeenCalledTimes(2);
			expect(fs.existsSync(zipFile)).toBe(false);
		});
	});

	describe("listarArquivosZip e extrairArquivoZip", () => {
		it("lista e extrai arquivo do zip utilizando executável do sistema", () => {
			const zipFile = path.join(tempDir, "fake.zip");
			fs.writeFileSync(zipFile, Buffer.alloc(2000));

			vi.mocked(execFileSync).mockImplementation((cmd, args) => {
				const argsArr = args as string[];
				if (argsArr.includes("-tf")) {
					return "consulta_cand_2026_BRASIL.csv\nleia-me.pdf";
				}
				if (argsArr.includes("-xf") || argsArr.includes("-o")) {
					fs.writeFileSync(
						path.join(tempDir, "consulta_cand_2026_BRASIL.csv"),
						Buffer.alloc(500)
					);
					return Buffer.alloc(0);
				}
				return Buffer.alloc(0);
			});

			const lista = listarArquivosZip(zipFile);
			expect(lista).toEqual(["consulta_cand_2026_BRASIL.csv", "leia-me.pdf"]);

			const extraido = extrairArquivoZip(
				zipFile,
				/consulta_cand_2026.*\.csv$/i,
				tempDir
			);
			expect(extraido).toBe(path.join(tempDir, "consulta_cand_2026_BRASIL.csv"));
		});
	});
});
