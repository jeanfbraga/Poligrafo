import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));

import { doadoresDaCampanha } from "@/services/integrations/tse/campanha";

function cliente(doadores: { documento: string }[], erro: { message: string } | null = null) {
	const consulta = (tipo: string) => ({
		select: () => ({
			eq: () => ({
				eq: () => ({
					order: () => ({ limit: async () => ({ data: tipo === "DOADOR" ? doadores : [], error: erro }) }),
				}),
			}),
		}),
	});
	let chamadas = 0;
	return { from: () => consulta(chamadas++ % 2 === 0 ? "DOADOR" : "FORNECEDOR") } as never;
}

describe("doadores da campanha (só a base; o TSE ao vivo saiu em 12/10/2026)", () => {
	it("pelo número do candidato: CPF e CNPJ só com dígitos, sem repetir e sem documento vazio", async () => {
		const fetchFn = vi.fn();
		vi.stubGlobal("fetch", fetchFn);
		const docs = [{ documento: "529.982.247-25" }, { documento: "52998224725" }, { documento: "" }, { documento: "11222333000181" }];
		expect(await doadoresDaCampanha("130001234567", cliente(docs))).toEqual(["52998224725", "11222333000181"]);
		expect(fetchFn).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("sem número do candidato ou com a base fora do ar: lista vazia, sem consulta ao vivo", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await doadoresDaCampanha(null, cliente([]))).toEqual([]);
		expect(await doadoresDaCampanha("1", cliente([], { message: "timeout" }))).toEqual([]);
		expect(aviso).toHaveBeenCalledWith("[TSE CAMPANHA] Base indisponível (timeout); seguindo sem ela.");
		aviso.mockRestore();
	});
});
