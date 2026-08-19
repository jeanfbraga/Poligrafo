import { describe, it, expect, vi, beforeEach } from "vitest";
import { analisarConflitoVotacoes } from "@/services/integrations/camara/conflito-legislativo";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

describe("Conflito de Interesses Legislativo: Votos x Doadores", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deve retornar vazio se não houver doadores ou deputado inválido", async () => {
		const res = await analisarConflitoVotacoes(0, []);
		expect(res).toEqual([]);
	});

	it("deve identificar conflito quando o deputado votou em matéria do setor do doador", async () => {
		vi.spyOn(supabasePerfilAdmin, "from").mockImplementation((table: string) => {
			if (table === "camara_votos_detalhados") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockReturnThis(),
					limit: vi.fn().mockResolvedValue({
						data: [
							{
								id_votacao: "2201999-1",
								voto: "Sim",
								camara_votacoes_master: {
									id_proposicao: "12345",
									projeto_nome: "PL 1234/2023 - Marco dos Defensivos Agrícolas",
									projeto_tema: "AGRONEGÓCIO",
									data_votacao: "2024-05-10",
								},
							},
						],
						error: null,
					}),
				} as any;
			}
			return {} as any;
		});

		const doadores = [
			{ nome: "AGROPECUARIA VALE VERDE LTDA", valor: 50000 },
		];

		const conflitos = await analisarConflitoVotacoes(204515, doadores);
		expect(conflitos.length).toBeGreaterThan(0);
		expect(conflitos[0].projetoTema).toBe("AGRONEGÓCIO");
		expect(conflitos[0].doadorRelacionado).toBe("AGROPECUARIA VALE VERDE LTDA");
		expect(conflitos[0].voto).toBe("SIM");
	});
});
