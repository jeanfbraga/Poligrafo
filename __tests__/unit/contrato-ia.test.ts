import { beforeEach, describe, expect, it, vi } from "vitest";

const processPipeline = vi.fn();
vi.mock("../../src/services/ai/llm-orchestrator", () => ({
	AiOrchestrator: class {
		processPipeline = processPipeline;
	},
}));

import {
	analisarEmendasComInteligencia,
	analisarLoteComInteligencia,
	analisarMalhaOsintComInteligencia,
} from "../../src/app/api/investigar/ai_helpers";
import {
	criarValidadorAvaliacoes,
	idsDoLote,
	validarAvaliacoes,
} from "../../src/services/ai/contratos/avaliacoes";
import { parsearRespostaContrato } from "../../src/services/ai/utils";

const avaliacao = (id: string, score = 90) => ({
	id, score_letalidade: score, classificacao: "INDICIO_PENAL_RELEVANTE", motivo_ia: "ALERTA",
});

describe("contrato da IA — validação", () => {
	const ids = idsDoLote(5, "d");

	it("lista vazia NÃO passa (antes marcava tudo como seguro)", () => {
		expect(validarAvaliacoes({ despesas_avaliadas: [] }, "despesas_avaliadas", ids).success).toBe(false);
	});

	it("chave antiga ou de outra tarefa não passa", () => {
		expect(validarAvaliacoes({ avaliacoes: ids.map((id) => avaliacao(id)) }, "despesas_avaliadas", ids).success).toBe(false);
		expect(validarAvaliacoes({ despesas_suspeitas: [avaliacao("d0")] }, "despesas_avaliadas", ids).success).toBe(false);
	});

	it("exige cobertura mínima de 80% dos ids e descarta ids desconhecidos", () => {
		const quatro = { despesas_avaliadas: ["d0", "d1", "d2", "d3", "x9"].map((id) => avaliacao(id)) };
		const r = validarAvaliacoes(quatro, "despesas_avaliadas", ids);
		expect(r.success).toBe(true);
		if (r.success) expect([...r.data.keys()]).toEqual(["d0", "d1", "d2", "d3"]);
		const tres = { despesas_avaliadas: ["d0", "d1", "d2"].map((id) => avaliacao(id)) };
		expect(validarAvaliacoes(tres, "despesas_avaliadas", ids).success).toBe(false);
	});

	it("limita o score a 0-100 e rejeita score não numérico", () => {
		const r = validarAvaliacoes(
			{ despesas_avaliadas: [{ id: "d0", score_letalidade: 250 }, { id: "d1", score_letalidade: "alto" }] },
			"despesas_avaliadas", ["d0", "d1"], 0.5,
		);
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.get("d0")?.score_letalidade).toBe(100);
			expect(r.data.has("d1")).toBe(false);
		}
	});

	it("o provedor recusa resposta fora do contrato (força o próximo modelo)", () => {
		const validar = criarValidadorAvaliacoes("despesas_avaliadas", ["d0"]);
		expect(() => parsearRespostaContrato('{"despesas_avaliadas": []}', "despesas_avaliadas", validar)).toThrow(/contrato/);
		expect(parsearRespostaContrato('```json\n{"despesas_avaliadas":[{"id":"d0","score_letalidade":5}]}\n```', "despesas_avaliadas", validar))
			.toMatchObject({ despesas_avaliadas: [{ id: "d0" }] });
	});
});

describe("contrato da IA — junção dos resultados", () => {
	beforeEach(() => processPipeline.mockReset());

	const despesas = [
		{ cnpjCpfFornecedor: "1", nomeFornecedor: "A", tipoDespesa: "COMBUSTÍVEIS", valorDocumento: 100, dataDocumento: "2026-01-01" },
		{ cnpjCpfFornecedor: "1", nomeFornecedor: "A", tipoDespesa: "COMBUSTÍVEIS", valorDocumento: 100, dataDocumento: "2026-01-02" },
	];

	it("envia um id por item e junta pelo id (CNPJ + valor repetidos não colidem)", async () => {
		processPipeline.mockResolvedValue({ parsedJson: { despesas_avaliadas: [avaliacao("d1", 91), avaliacao("d0", 12)] } });
		const r = await analisarLoteComInteligencia(despesas, "SP", [], "FEDERAL", "CAMARA");
		const prompt = processPipeline.mock.calls[0][1] as string;
		expect(prompt).toContain('"id":"d0"');
		expect(r.map((d: any) => d.score_letalidade)).toEqual([12, 91]);
		expect(r.every((d: any) => d.avaliado_por_ia)).toBe(true);
	});

	it("item que a IA não devolveu recebe a regra local e a marca 'não avaliado', nunca 'seguro'", async () => {
		processPipeline.mockResolvedValue({ parsedJson: { despesas_avaliadas: [avaliacao("d0", 70)] } });
		const r = await analisarLoteComInteligencia(despesas, "SP", [], "FEDERAL", "CAMARA");
		expect(r[0].score_letalidade).toBe(70);
		expect(r[1].avaliado_por_ia).toBe(false);
		expect(r[1].motivo_ia).toContain("Não avaliado pela IA");
		expect(r[1].motivo_ia).not.toContain("seguro");
	});

	it("sem resposta da IA, todo o lote vai para a regra local", async () => {
		processPipeline.mockResolvedValue(null);
		const r = await analisarLoteComInteligencia(despesas, "SP", [], "FEDERAL", "CAMARA");
		expect(r).toHaveLength(2);
		expect(r[0].motivo_ia ?? "").not.toContain("[IA]");
	});

	it("emendas usam ids e0, e1…", async () => {
		const emendas = [{ codigoEmenda: "123" }, { codigoEmenda: "456" }];
		processPipeline.mockResolvedValue({ parsedJson: { emendas_avaliadas: [avaliacao("e0", 40), avaliacao("e1", 80)] } });
		const r = await analisarEmendasComInteligencia(emendas, "SP", "FEDERAL");
		expect(r.map((e: any) => e.score_letalidade)).toEqual([40, 80]);
	});

	it("nó da malha não avaliado mantém o score que já tinha (sem o 20 padrão)", async () => {
		const malha = [
			{ id: "empresa-1", type: "EMPRESA", data: { label: "X", score_letalidade: 55 } },
			{ id: "empresa-2", type: "EMPRESA", data: { label: "Y" } },
			{ id: "empresa-3", type: "EMPRESA", data: { label: "Z" } },
			{ id: "empresa-4", type: "EMPRESA", data: { label: "W" } },
			{ id: "empresa-5", type: "EMPRESA", data: { label: "V" } },
		];
		processPipeline.mockResolvedValue({
			parsedJson: { avaliacoes: ["empresa-2", "empresa-3", "empresa-4", "empresa-5"].map((id) => avaliacao(id, 30)) },
		});
		const r = await analisarMalhaOsintComInteligencia(malha, "SP");
		const e1 = r.find((n: any) => n.id === "empresa-1");
		expect(e1.data.avaliado_por_ia).toBe(false);
		expect(e1.data.score_letalidade).toBe(55);
	});
});
