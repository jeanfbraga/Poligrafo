import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
	parseAnoFiltro,
	minimoRegistrosTse,
	encontrarArquivoNoZip,
	parseItemBem,
	parseCandidato,
	downloadZipComCurl,
	listarArquivosZip,
	extrairArquivoZip,
	processarBensCsv,
	processarCandidatosCsv,
	sincronizarAno,
	main,
} from "../../scripts/etl/tse-sync-real";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));

describe("TSE Sync Real - ETL & Resiliência", () => {
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

	describe("parseAnoFiltro", () => {
		it("retorna 2026 por padrão quando nenhum argumento é passado", () => {
			expect(parseAnoFiltro([])).toEqual(["2026"]);
		});

		it("interpreta argumento --ano=2024", () => {
			expect(parseAnoFiltro(["--ano=2024"])).toEqual(["2024"]);
		});

		it("interpreta argumento --ano 2022", () => {
			expect(parseAnoFiltro(["--ano", "2022"])).toEqual(["2022"]);
		});

		it("retorna todos os anos disponíveis quando passado 'todos'", () => {
			expect(parseAnoFiltro(["--ano=todos"])).toEqual(["2026", "2024", "2022"]);
		});

		it("faz fallback para 2026 em caso de ano inválido", () => {
			expect(parseAnoFiltro(["--ano=1999"])).toEqual(["2026"]);
		});
	});

	describe("minimoRegistrosTse", () => {
		it("retorna o mínimo de segurança correto por eleição", () => {
			expect(minimoRegistrosTse(2022)).toBe(10_000);
			expect(minimoRegistrosTse(2024)).toBe(1_000);
			expect(minimoRegistrosTse(2026)).toBe(500);
			expect(minimoRegistrosTse(2030)).toBe(500);
		});
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

	describe("parseCandidato", () => {
		it("rejeita registros sem CPF ou sem Nome", () => {
			const bensMap = new Map();
			expect(parseCandidato({ NM_CANDIDATO: "João" }, 2026, bensMap)).toBeNull();
			expect(parseCandidato({ NR_CPF_CANDIDATO: "12345678901" }, 2026, bensMap)).toBeNull();
		});

		it("rejeita CPF inválido com menos de 11 dígitos numéricos", () => {
			const bensMap = new Map();
			expect(
				parseCandidato(
					{ NR_CPF_CANDIDATO: "123.456", NM_CANDIDATO: "João" },
					2026,
					bensMap
				)
			).toBeNull();
		});

		it("associa bens declarados existentes no bensMap", () => {
			const bensMap = new Map();
			bensMap.set("999", {
				valorTotal: 500000,
				bens: [{ tipoBem: "Veículo", descricao: "Carro", valor: 500000 }],
			});

			const candidato = parseCandidato(
				{
					NR_CPF_CANDIDATO: "111.222.333-44",
					NM_CANDIDATO: "Maria Silva",
					SQ_CANDIDATO: "999",
				},
				2026,
				bensMap
			);

			expect(candidato).toEqual({
				cpf_candidato: "11122233344",
				nome_candidato: "Maria Silva",
				ano_eleicao: 2026,
				valor_total: 500000,
				descricao_bens: [{ tipoBem: "Veículo", descricao: "Carro", valor: 500000 }],
			});
		});

		it("retorna valor total zero e bens vazios se candidato não tiver bens declarados", () => {
			const bensMap = new Map();
			const candidato = parseCandidato(
				{
					NR_CPF_CANDIDATO: "111.222.333-44",
					NM_CANDIDATO: "Maria Silva",
					SQ_CANDIDATO: "888",
				},
				2026,
				bensMap
			);

			expect(candidato?.valor_total).toBe(0);
			expect(candidato?.descricao_bens).toEqual([]);
		});
	});

	describe("downloadZipComCurl", () => {
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

	describe("processarBensCsv e processarCandidatosCsv", () => {
		it("processa e associa bens aos candidatos inserindo no banco mockado", async () => {
			const csvBensPath = path.join(tempDir, "bens.csv");
			const conteudoBens =
				"SQ_CANDIDATO;VR_BEM_CANDIDATO;DS_TIPO_BEM_CANDIDATO;DS_BEM_CANDIDATO\n" +
				"1001;50.000,00;Apartamento;Apto centro\n" +
				"1001;25.000,00;Veículo;Carro popular\n";
			fs.writeFileSync(csvBensPath, conteudoBens, "latin1");

			const bensMap = await processarBensCsv(csvBensPath);
			expect(bensMap.size).toBe(1);
			expect(bensMap.get("1001")?.valorTotal).toBe(75000);
			expect(bensMap.get("1001")?.bens.length).toBe(2);

			const csvCandPath = path.join(tempDir, "candidatos.csv");
			const conteudoCand =
				"NR_CPF_CANDIDATO;NM_CANDIDATO;SQ_CANDIDATO\n" +
				"123.456.789-00;Fulano de Tal;1001\n" +
				"987.654.321-99;Candidato Sem Bens;2002\n";
			fs.writeFileSync(csvCandPath, conteudoCand, "latin1");

			const upsertMock = vi.fn().mockResolvedValue({ error: null });
			const clientMock = {
				from: vi.fn().mockReturnValue({ upsert: upsertMock }),
			};

			const count = await processarCandidatosCsv(csvCandPath, bensMap, 2026, clientMock as any);
			expect(count).toBe(2);
			expect(upsertMock).toHaveBeenCalled();
			const loteInserido = upsertMock.mock.calls[0][0];
			expect(loteInserido.length).toBe(2);
			expect(loteInserido[0].valor_total).toBe(75000);
			expect(loteInserido[1].valor_total).toBe(0);
		});
	});

	describe("sincronizarAno e main com Degradação Graciosa", () => {
		it("rejeita quando a quantidade sincronizada é menor que o mínimo", async () => {
			const csvBens = path.join(tempDir, "bens.csv");
			fs.writeFileSync(
				csvBens,
				"SQ_CANDIDATO;VR_BEM_CANDIDATO;DS_TIPO_BEM_CANDIDATO;DS_BEM_CANDIDATO;CD_TIPO_BEM_CANDIDATO\n1;10.000,00;Apartamento Residencial no Centro;Imovel Urbano;11\n",
				"latin1"
			);

			const csvCand = path.join(tempDir, "cand.csv");
			// Apenas 1 registro quando para 2026 o mínimo é 500
			fs.writeFileSync(
				csvCand,
				"NR_CPF_CANDIDATO;NM_CANDIDATO;SQ_CANDIDATO;DS_CARGO;SG_PARTIDO;NM_PARTIDO\n12345678901;Candidato de Teste da Silva;1;Deputado Federal;POL;Partido Politico\n",
				"latin1"
			);

			const zipCand = path.join(tempDir, "consulta_cand_2026.zip");
			const zipBens = path.join(tempDir, "bem_candidato_2026.zip");
			fs.writeFileSync(zipCand, Buffer.alloc(2000));
			fs.writeFileSync(zipBens, Buffer.alloc(2000));

			vi.mocked(execFileSync).mockImplementation((cmd, args) => {
				const argsArr = args as string[];
				if (argsArr.includes("-tf")) {
					return "consulta_cand_2026_BRASIL.csv\nbem_candidato_2026_BRASIL.csv";
				}
				if (argsArr.includes("-xf") || argsArr.includes("-o")) {
					fs.copyFileSync(csvCand, path.join(tempDir, "consulta_cand_2026_BRASIL.csv"));
					fs.copyFileSync(csvBens, path.join(tempDir, "bem_candidato_2026_BRASIL.csv"));
				}
				return Buffer.alloc(0);
			});

			const clientMock = {
				from: vi.fn().mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) }),
			};

			await expect(
				sincronizarAno("2026", clientMock as any, undefined, tempDir)
			).rejects.toThrow(/Quantidade de registros \(1\) inferior ao mínimo esperado/);
		});

		it("main lança erro se todos os anos falharem", async () => {
			const originalArgv = process.argv;
			process.argv = ["node", "tse-sync-real.ts", "--ano=2026"];

			vi.mocked(execFileSync).mockImplementation(() => {
				throw new Error("403 Forbidden");
			});

			const wait = vi.fn().mockResolvedValue(undefined);
			const clientMock = { from: vi.fn() };

			await expect(main(clientMock as any, wait)).rejects.toThrow(
				/Todos os anos processados \(2026\) falharam/
			);

			process.argv = originalArgv;
		});
	});
});
