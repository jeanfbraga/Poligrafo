import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkNepotismoCamara } from "@/services/integrations/camara/nepotismo-client";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

describe("Auditoria de Nepotismo: Câmara dos Deputados", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("deve retornar null para strings vazias ou curtas", async () => {
		const res1 = await checkNepotismoCamara("");
		const res2 = await checkNepotismoCamara("ABC");
		expect(res1).toBeNull();
		expect(res2).toBeNull();
	});

	it("deve ignorar nomes corporativos (LTDA, S/A, MEI)", async () => {
		const res = await checkNepotismoCamara("EMPRESA DE COMERCIO LTDA");
		expect(res).toBeNull();
	});

	it("deve identificar servidor do gabinete direto do parlamentar investigado", async () => {
		vi.spyOn(supabasePerfilAdmin, "from").mockImplementation((table: string) => {
			if (table === "camara_servidores_gabinete") {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockReturnThis(),
					ilike: vi.fn().mockReturnThis(),
					limit: vi.fn().mockReturnThis(),
					maybeSingle: vi.fn().mockResolvedValue({
						data: {
							deputado_id: 204515,
							nome: "MARIA DA SILVA",
							cargo: "Secretário Parlamentar SP25",
							periodo: "2023 - Atual",
						},
						error: null,
					}),
				} as any;
			}
			return {} as any;
		});

		const res = await checkNepotismoCamara("MARIA DA SILVA", 204515);
		expect(res).not.toBeNull();
		expect(res?.tipoVinculo).toBe("GABINETE_DIRETO");
		expect(res?.cargo).toBe("Secretário Parlamentar SP25");
	});

	it("deve identificar servidor da Câmara em geral quando não é do mesmo gabinete", async () => {
		let callCount = 0;
		vi.spyOn(supabasePerfilAdmin, "from").mockImplementation((table: string) => {
			if (table === "camara_servidores_gabinete") {
				callCount++;
				if (callCount === 1) {
					// 1ª chamada: gabinete direto (retorna nulo)
					return {
						select: vi.fn().mockReturnThis(),
						eq: vi.fn().mockReturnThis(),
						ilike: vi.fn().mockReturnThis(),
						limit: vi.fn().mockReturnThis(),
						maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
					} as any;
				}
				// 2ª chamada: câmara geral (retorna match)
				return {
					select: vi.fn().mockReturnThis(),
					ilike: vi.fn().mockReturnThis(),
					limit: vi.fn().mockReturnThis(),
					maybeSingle: vi.fn().mockResolvedValue({
						data: {
							deputado_id: 999999,
							nome: "JOAO DE SOUZA",
							cargo: "Assistente de Gabinete",
						},
						error: null,
					}),
				} as any;
			}
			return {} as any;
		});

		const res = await checkNepotismoCamara("JOAO DE SOUZA", 204515);
		expect(res).not.toBeNull();
		expect(res?.tipoVinculo).toBe("CAMARA_GERAL");
		expect(res?.deputado_id).toBe(999999);
	});
});
