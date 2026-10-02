import { describe, expect, it, vi } from "vitest";
import {
	despesasDoCsv,
	extrairValorReembolsado,
	mapearRegistroSenado,
	minimoRegistros,
	parsearCsvSenado,
	runForYear,
} from "../../scripts/etl/ceap-senado-sync";

// Formato real do CSV do Senado (UTF-8, ";", cabeçalho na 1ª linha).
const CABECALHO = '"ID";"TIPO_DOCUMENTO";"ANO";"MÊS";"COD_SENADOR";"NOME_SENADOR";"TIPO_DESPESA";"CPF_CNPJ_FORNECEDOR";"NOME_FORNECEDOR";"DOCUMENTO";"DATA";"DETALHAMENTO";"VALOR_REEMBOLSADO"';
const LINHA_1 = '"2300035";"Fatura";"2026";"8";"6336";"CAMILO SANTANA";"Contratação de consultorias";"05.120.923/0001-09";"Aerotur Serviços";"2200627723";"2026-08-11";;"278,05"';
const LINHA_2 = '"2300036";"Fatura";"2026";"8";"6336";"CAMILO SANTANA";"Contratação de consultorias";"";"Fornecedor sem documento";"2200716796";"2026-08-12";;"1.598,49"';
const CSV = [CABECALHO, LINHA_1, LINHA_2].join("\n");

describe("CSV do Senado", () => {
	it("o cabeçalho está na 1ª linha: não se descarta nenhuma linha de dados", () => {
		const registros = parsearCsvSenado(CSV);
		expect(registros).toHaveLength(2);
		expect(registros[0].NOME_SENADOR).toBe("CAMILO SANTANA");
	});

	it("mapeia as colunas atuais (COD_SENADOR, CPF_CNPJ_FORNECEDOR, NOME_FORNECEDOR)", () => {
		const [d] = despesasDoCsv(CSV, 2026);
		expect(d).toMatchObject({
			id_deputado: 6336,
			ano: 2026,
			cnpj_cpf_fornecedor: "05120923000109",
			nome_fornecedor: "Aerotur Serviços",
			valor_documento: 278.05,
			data_documento: "2026-08-11",
			casa: "SENADO",
			url_documento: null,
		});
	});

	it("valor com milhar e vírgula decimal; fornecedor sem documento vira null", () => {
		const d = despesasDoCsv(CSV, 2026)[1];
		expect(d.valor_documento).toBeCloseTo(1598.49);
		expect(d.cnpj_cpf_fornecedor).toBeNull();
	});

	it("ignora linhas sem senador ou sem código", () => {
		expect(mapearRegistroSenado({ NOME_SENADOR: "", COD_SENADOR: "1" }, 2026)).toBeNull();
		expect(mapearRegistroSenado({ NOME_SENADOR: "X", COD_SENADOR: "" }, 2026)).toBeNull();
	});

	it("extrairValorReembolsado tolera vazio e lixo", () => {
		expect(extrairValorReembolsado(undefined)).toBe(0);
		expect(extrairValorReembolsado("abc")).toBe(0);
		expect(extrairValorReembolsado("12,50")).toBe(12.5);
	});

	it("exige mais registros para anos fechados que para o ano corrente", () => {
		const hoje = new Date(2026, 9, 2);
		expect(minimoRegistros(2025, hoje)).toBeGreaterThan(minimoRegistros(2026, hoje));
	});
});

describe("runForYear — nunca esvazia o cache com um CSV ruim", () => {
	const clienteFalso = () => {
		const eq2 = vi.fn().mockResolvedValue({ error: null });
		const eq1 = vi.fn(() => ({ eq: eq2 }));
		const del = vi.fn(() => ({ eq: eq1 }));
		const insert = vi.fn().mockResolvedValue({ error: null });
		const from = vi.fn(() => ({ delete: del, insert }));
		return { client: { from } as any, del, insert };
	};

	it("CSV com poucos registros é rejeitado antes de qualquer DELETE", async () => {
		const { client, del, insert } = clienteFalso();
		const fs = await import("node:fs");
		const baixar = (_ano: number, dir: string) => {
			const p = `${dir}/s.csv`;
			fs.writeFileSync(p, CSV, "utf8");
			return p;
		};
		const r = await runForYear(2025, client, baixar);
		expect(r.success).toBe(false);
		expect(del).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
	});

	it("dry-run valida e conta sem gravar", async () => {
		const { client, del, insert } = clienteFalso();
		const fs = await import("node:fs");
		const linhas = Array.from({ length: 600 }, () => LINHA_1);
		const baixar = (_ano: number, dir: string) => {
			const p = `${dir}/s.csv`;
			fs.writeFileSync(p, [CABECALHO, ...linhas].join("\n"), "utf8");
			return p;
		};
		const ano = new Date().getFullYear();
		const r = await runForYear(ano, client, baixar, true);
		expect(r).toEqual({ success: true, count: 600 });
		expect(del).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
	});
});
