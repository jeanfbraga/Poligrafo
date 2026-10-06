import { describe, expect, it, vi } from "vitest";
import { construirPromptAchados } from "../../src/services/ai/prompt-builder";
import { explicarAchados, MAX_ACHADOS_IA, paraIA, validarExplicacoes } from "../../src/services/cruzamentos/explicacao-ia";

function no(id: string, fatos = 2) {
	return {
		id,
		data: {
			label: `Achado ${id}`,
			severidade: "ALTA",
			motivo_ia: `Resumo ${id}`,
			fatos: Array.from({ length: fatos }, (_v, i) => ({ papel: i ? "FORNECEDOR_COTA" : "DOADOR", fonte: "TSE", detalhe: null, valor: null, data: null })),
		},
	};
}

describe("explicação dos cruzamentos pela IA", () => {
	it("refs F1, F2… únicos no pedido e limite de itens", () => {
		const itens = paraIA([no("a"), no("b", 1)]);
		expect(itens.map((i) => i.fatos.map((f) => f.ref))).toEqual([["F1", "F2"], ["F3"]]);
		expect(paraIA(Array.from({ length: 20 }, (_v, i) => no(`x${i}`)))).toHaveLength(MAX_ACHADOS_IA);
	});

	it("prompt proíbe mudar a gravidade e inventar fatos, e protege contra injeção", () => {
		const { sistema, usuario } = construirPromptAchados(paraIA([no("a")]));
		expect(sistema).toContain("você NÃO pode mudá-la");
		expect(sistema).toContain("não invente valores");
		expect(sistema).toContain("[SEGURANÇA]");
		expect(usuario).toContain('"id": "a"');
	});

	it("contrato: descarta id desconhecido, fato de outro achado e texto vazio; prioridade entre 1 e 5", () => {
		const itens = paraIA([no("a"), no("b", 1)]);
		const r = validarExplicacoes({
			explicacoes: [
				{ achado_id: "a", prioridade: 9, texto: "Conferir F1 e F2.", fatos_citados: ["F1", "F2"] },
				{ achado_id: "b", prioridade: 2, texto: "Usa fato do outro.", fatos_citados: ["F1"] },
				{ achado_id: "zzz", prioridade: 1, texto: "Inventado.", fatos_citados: ["F3"] },
				{ achado_id: "b", prioridade: 1, texto: "  ", fatos_citados: ["F3"] },
			],
		}, itens);
		expect(r).toEqual({ success: true, data: [{ achado_id: "a", prioridade: 5, texto: "Conferir F1 e F2.", fatos_citados: ["F1", "F2"] }] });
		expect(validarExplicacoes({ explicacoes: [] }, itens)).toMatchObject({ success: false });
		expect(validarExplicacoes({ outra: [] }, itens)).toEqual({ success: false, error: 'chave "explicacoes" ausente' });
	});

	it("usa o gateway com a chave e o validador do contrato; falha da IA devolve lista vazia", async () => {
		const gerar = vi.fn(async (pedido: any) => {
			expect(pedido).toMatchObject({ tarefa: "triagem-json", formato: "json", chaveRaiz: "explicacoes" });
			const resposta = { explicacoes: [{ achado_id: "a", prioridade: 1, texto: "Ok.", fatos_citados: ["F2"] }] };
			expect(pedido.validar(resposta).success).toBe(true);
			expect(pedido.validar({ explicacoes: [{ achado_id: "a", texto: "x", fatos_citados: ["F9"] }] }).success).toBe(false);
			return { ok: true, dados: resposta, texto: "", provedor: "groq", modelo: "m", tentativas: [] };
		});
		expect(await explicarAchados([no("a")], gerar as never)).toEqual([{ achado_id: "a", prioridade: 1, texto: "Ok.", fatos_citados: ["F2"] }]);
		const semIA = vi.fn(async () => ({ ok: false, motivo: "ESGOTADO", tentativas: [] }));
		expect(await explicarAchados([no("a")], semIA as never)).toEqual([]);
		expect(await explicarAchados([], gerar as never)).toEqual([]);
	});
});
