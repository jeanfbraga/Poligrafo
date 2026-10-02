import { describe, expect, it } from "vitest";
import { analisarLoteComInteligencia, dividirEmLotes, TAMANHO_LOTE_IA } from "@/app/api/investigar/ai_helpers";

describe("dividirEmLotes", () => {
	it("60 notas viram 3 lotes de 20", () => {
		const lotes = dividirEmLotes(Array.from({ length: 60 }, (_, i) => i));
		expect(lotes).toHaveLength(3);
		expect(lotes.every((l) => l.length === TAMANHO_LOTE_IA)).toBe(true);
	});

	it("o último lote leva o resto e a ordem é preservada", () => {
		const lotes = dividirEmLotes([1, 2, 3, 4, 5], 2);
		expect(lotes).toEqual([[1, 2], [3, 4], [5]]);
		expect(lotes.flat()).toEqual([1, 2, 3, 4, 5]);
	});

	it("lista vazia não gera lotes", () => {
		expect(dividirEmLotes([])).toEqual([]);
	});
});

describe("analisarLoteComInteligencia — em lotes", () => {
	it("devolve uma avaliação por despesa, na mesma ordem, mesmo com mais de um lote (sem LLM em dev)", async () => {
		const despesas = Array.from({ length: 45 }, (_, i) => ({
			cnpjCpfFornecedor: `1234567800${String(i).padStart(4, "0")}`,
			nomeFornecedor: `FORNECEDOR ${i}`,
			tipoDespesa: "MANUTENÇÃO DE ESCRITÓRIO",
			valorDocumento: 100 + i,
			dataDocumento: "2026-02-05",
		}));
		const r = await analisarLoteComInteligencia(despesas, "SP", [], "FEDERAL", "CAMARA");
		expect(r).toHaveLength(45);
		expect(r.map((x: any) => x.nomeFornecedor)).toEqual(despesas.map((d) => d.nomeFornecedor));
		expect(r.every((x: any) => typeof x.score_letalidade === "number")).toBe(true);
	});
});
