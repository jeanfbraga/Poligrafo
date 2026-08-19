import { describe, it, expect, vi, beforeEach } from "vitest";
import { buscarConveniosEntidade } from "@/services/integrations/transparencia/convenios-client";
import * as tseModule from "@/app/api/investigar/tse";

describe("Portal da Transparência: Convênios Terceiro Setor / ONGs (Ponto 7)", () => {
	const originalEnv = process.env.TRANSPARENCIA_API_KEY;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.TRANSPARENCIA_API_KEY = "test-api-key";
	});

	afterAll(() => {
		process.env.TRANSPARENCIA_API_KEY = originalEnv;
	});

	it("deve retornar vazio se não houver chave de API configurada", async () => {
		delete process.env.TRANSPARENCIA_API_KEY;
		const res = await buscarConveniosEntidade("INSTITUTO BRASIL");
		expect(res).toEqual([]);
	});

	it("deve parsear convênios federais retornados pela API", async () => {
		vi.spyOn(tseModule, "fetchWithTimeout").mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => [
				{
					numero: "901234",
					objeto: "Capacitação profissional de jovens",
					orgaoSuperior: { nome: "Ministério do Desenvolvimento Social" },
					orgaoConcedente: { nome: "Secretaria Nacional de Assistência" },
					concedente: "União Federal",
					convenente: { nome: "INSTITUTO ESPERANCA VIVA", cnpj: "12345678000190" },
					valorGlobal: 1500000,
					valorLiberado: 750000,
					situacao: "EM EXECUÇÃO",
					dataInicioVigencia: "2023-01-01",
					dataFimVigencia: "2025-12-31",
				},
			],
		} as any);

		const res = await buscarConveniosEntidade("12345678000190");
		expect(res.length).toBe(1);
		expect(res[0].numeroConvenio).toBe("901234");
		expect(res[0].convenenteNome).toBe("INSTITUTO ESPERANCA VIVA");
		expect(res[0].valorGlobal).toBe(1500000);
		expect(res[0].valorLiberado).toBe(750000);
	});
});
