import { describe, expect, it, vi } from "vitest";
import {
	buscarCandidatos,
	coberturaNome,
	type DependenciasBusca,
	ordenarCandidatos,
} from "../../src/services/core/busca-candidatos";

function deps(over: Partial<DependenciasBusca> = {}): DependenciasBusca {
	return {
		camara: vi.fn().mockResolvedValue([]),
		senado: vi.fn().mockResolvedValue([]),
		tse: vi.fn().mockResolvedValue(null),
		alesp: vi.fn().mockResolvedValue([]),
		alerj: vi.fn().mockResolvedValue([]),
		municipal: vi.fn().mockResolvedValue([]),
		status: vi.fn(),
		...over,
	};
}

const base = { cargo: "FEDERAL", somenteFederal: false };

describe("cobertura do nome", () => {
	it("conta palavras inteiras e ignora de/da/do", () => {
		expect(coberturaNome("André do Prado", "ANDRÉ DO PRADO")).toBe(1);
		expect(coberturaNome("André do Prado", "André Fufuca")).toBe(0.5);
		expect(coberturaNome("Rafael Aloisio Freitas", "Rafael Prudente")).toBeCloseTo(1 / 3);
	});

	it("ordena pela cobertura e remove refs repetidas", () => {
		const lista = [
			{ nome: "André Fufuca", ref: "FEDERAL:CAMARA:1", uf: "MA" },
			{ nome: "ANDRÉ DO PRADO", ref: "ALESP:DEPUTADO_ESTADUAL:x:1", uf: "SP" },
			{ nome: "André Fufuca", ref: "FEDERAL:CAMARA:1", uf: "MA" },
		];
		const r = ordenarCandidatos(lista, "André do Prado", "SP");
		expect(r.map((c) => c.ref)).toEqual(["ALESP:DEPUTADO_ESTADUAL:x:1", "FEDERAL:CAMARA:1"]);
	});
});

describe("buscarCandidatos", () => {
	it("deputado estadual de SP não vira parlamentar federal de nome parecido", async () => {
		const d = deps({
			senado: vi.fn().mockResolvedValue([{ id: 9, nome: "André Amaral", uf: "PB" }]),
			alesp: vi.fn().mockResolvedValue([{ nome: "ANDRÉ DO PRADO", uf: "SP", ref: "ALESP:DEPUTADO_ESTADUAL:ANDRE:1", cargo: "Deputado Estadual" }]),
		});
		const r = await buscarCandidatos({ ...base, nome: "André do Prado", uf: "SP" }, d);
		expect(r.candidatos[0].ref).toBe("ALESP:DEPUTADO_ESTADUAL:ANDRE:1");
		expect(d.municipal).not.toHaveBeenCalled(); // já houve cobertura total
	});

	it("deputado estadual fora de SP/RJ vem do TSE (cargo 7) com ref ESTADUAL", async () => {
		const d = deps({
			camara: vi.fn().mockResolvedValue([{ id: 5, nome: "Bruno Ganem", uf: "SP" }]),
			tse: vi.fn().mockImplementation(async (_n: string, _uf: string, cargo: string) =>
				cargo === "7" ? { documentoPrincipal: "52998224725", nome: "BRUNO PEIXOTO", nomeUrna: "Bruno Peixoto", idTse: 1 } : null),
		});
		const r = await buscarCandidatos({ ...base, nome: "Bruno Peixoto", uf: "GO" }, d);
		expect(r.candidatos[0]).toMatchObject({ ref: "ESTADUAL:GO:52998224725", cargo: "Deputado Estadual" });
	});

	it("vereador: sem cobertura total no federal, roda a varredura municipal e ela vence", async () => {
		const d = deps({
			camara: vi.fn().mockResolvedValue([{ id: 7, nome: "Rafael Prudente", uf: "RJ" }]),
			municipal: vi.fn().mockResolvedValue([{ nome: "RAFAEL ALOISIO FREITAS", uf: "RJ", ref: "RJ:VEREADOR:rio-de-janeiro:1" }]),
		});
		const r = await buscarCandidatos({ ...base, nome: "Rafael Aloisio Freitas", uf: "RJ" }, d);
		expect(d.municipal).toHaveBeenCalledWith("RJ", "Rafael Aloisio Freitas");
		expect(r.candidatos[0].ref).toBe("RJ:VEREADOR:rio-de-janeiro:1");
	});

	it("alçada FEDERAL explícita não busca estado nem município", async () => {
		const d = deps({ camara: vi.fn().mockResolvedValue([{ id: 1, nome: "Fulano", uf: "SP" }]) });
		await buscarCandidatos({ ...base, nome: "Fulano de Tal", uf: null, somenteFederal: true }, d);
		expect(d.municipal).not.toHaveBeenCalled();
		expect(d.alesp).not.toHaveBeenCalled();
	});

	it("prefeito pedido explicitamente vai direto ao TSE (cargo 11)", async () => {
		const d = deps({
			tse: vi.fn().mockResolvedValue({ documentoPrincipal: "52998224725", nome: "SANDRO MABEL", municipio: "goiania" }),
		});
		const r = await buscarCandidatos({ ...base, cargo: "PREFEITO", nome: "Sandro Mabel", uf: "GO" }, d);
		expect(d.tse).toHaveBeenCalledWith("Sandro Mabel", "GO", "11");
		expect(r.candidatos[0].ref).toBe("GO:PREFEITO:goiania:52998224725");
	});

	it("candidato ao Senado no TSE não passa à frente do mandato atual na ALESP", async () => {
		const d = deps({
			alesp: vi.fn().mockResolvedValue([{ nome: "ANDRE LUIS DO PRADO (ANDRÉ DO PRADO)", uf: "SP", ref: "ALESP:DEPUTADO_ESTADUAL:x:1" }]),
			tse: vi.fn().mockResolvedValue({ documentoPrincipal: "52998224725", nome: "ANDRE LUIS DO PRADO", nomeUrna: "ANDRÉ DO PRADO" }),
		});
		const r = await buscarCandidatos({ ...base, nome: "André do Prado", uf: "SP" }, d);
		expect(r.candidatos[0].ref).toBe("ALESP:DEPUTADO_ESTADUAL:x:1");
		expect(r.candidatos.some((c) => c.ref.startsWith("FEDERAL:SENADO"))).toBe(false); // reserva do TSE nem roda
	});

	it("nome de urna entre parênteses conta como exato", () => {
		const lista = [
			{ nome: "ANDRÉ DO PRADO SILVA", ref: "A", uf: "SP" },
			{ nome: "ANDRE LUIS DO PRADO (ANDRÉ DO PRADO)", ref: "B", uf: "SP" },
		];
		expect(ordenarCandidatos(lista, "André do Prado", "SP")[0].ref).toBe("B");
	});

	it("sinaliza erro de API quando uma fonte cai e nada é encontrado", async () => {
		const d = deps({ camara: vi.fn().mockRejectedValue(new Error("timeout")) });
		const r = await buscarCandidatos({ ...base, nome: "Ninguém", uf: null }, d);
		expect(r).toEqual({ candidatos: [], houveErroApi: true });
	});
});
