import { describe, expect, it } from "vitest";
import {
	normalizarDespesa,
	nosDeContratosDoEnte,
	separarPorNatureza,
} from "../../src/services/core/despesa-normalizada";

describe("despesa normalizada", () => {
	it("traduz os nomes de campo dos TCEs para o formato da triagem (antes chegavam undefined)", () => {
		const d = normalizarDespesa(
			{ fornecedor: "EMPRESA X", cnpjFornecedor: "33.000.167/0001-01", valorLiquido: "1500.5", data: "2026-01-02", url: "https://tce" },
			{ fonte: "TCE-MG", natureza: "ENTE" },
		);
		expect(d).toMatchObject({
			cnpjCpfFornecedor: "33000167000101", nomeFornecedor: "EMPRESA X", valorDocumento: 1500.5,
			dataDocumento: "2026-01-02", urlDocumento: "https://tce", fonte: "TCE-MG", natureza: "ENTE",
		});
	});

	it("respeita a natureza marcada pela fonte (cota da CMRJ é gasto do mandato)", () => {
		const d = normalizarDespesa({ nomeFornecedor: "A", valorDocumento: 10, natureza: "MANDATO", _fonte: "CMRJ_COTA_GABINETE" }, { fonte: "TCE-RJ", natureza: "ENTE" });
		expect(d.natureza).toBe("MANDATO");
		expect(d.fonte).toBe("CMRJ_COTA_GABINETE");
	});

	it("separa mandato de contratos do órgão e transforma o órgão em contexto sem nota da IA", () => {
		const lista = [
			normalizarDespesa({ nomeFornecedor: "COTA", valorDocumento: 5, natureza: "MANDATO" }, { fonte: "x", natureza: "ENTE" }),
			normalizarDespesa({ fornecedor: "OBRA", valor: 900 }, { fonte: "TCE-CE", natureza: "ENTE" }),
			normalizarDespesa({ fornecedor: "MERENDA", valor: 100 }, { fonte: "TCE-CE", natureza: "ENTE" }),
		];
		const { mandato, ente } = separarPorNatureza(lista);
		expect(mandato.map((d) => d.nomeFornecedor)).toEqual(["COTA"]);
		const nos = nosDeContratosDoEnte(ente, "pessoa-1");
		expect(nos.map((n) => n.data.label)).toEqual(["OBRA", "MERENDA"]);
		expect(nos[0].data).not.toHaveProperty("score_letalidade");
		expect(nos[0].data.motivo_ia).toContain("não é gasto do mandato");
	});

	it("nunca inventa documento", () => {
		expect(normalizarDespesa({}, { fonte: "x", natureza: "MANDATO" }).cnpjCpfFornecedor).toBe("");
	});
});
