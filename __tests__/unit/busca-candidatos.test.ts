import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));

import {
	buscarCandidatos,
	coberturaNome,
	type DependenciasBusca,
	naJanelaDaBusca,
	ordenarCandidatos,
} from "../../src/services/core/busca-candidatos";

function deps(over: Partial<DependenciasBusca> = {}): DependenciasBusca {
	return {
		camara: vi.fn().mockResolvedValue([]),
		senado: vi.fn().mockResolvedValue([]),
		alesp: vi.fn().mockResolvedValue([]),
		alerj: vi.fn().mockResolvedValue([]),
		eleitos: vi.fn().mockResolvedValue([]),
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

	it("deputado atual com linhas de várias legislaturas fica com a mais recente", () => {
		const lista = [
			{ nome: "Fulano", ref: "FEDERAL:CAMARA:1", casa: "CAMARA", idLegislatura: 56 },
			{ nome: "Fulano", ref: "FEDERAL:CAMARA:1", casa: "CAMARA", idLegislatura: 57 },
		];
		const r = ordenarCandidatos(lista, "Fulano", null);
		expect(r).toHaveLength(1);
		expect(r[0].idLegislatura).toBe(57);
	});

	it("nome de urna entre parênteses conta como exato", () => {
		const lista = [
			{ nome: "ANDRÉ DO PRADO SILVA", ref: "A", uf: "SP" },
			{ nome: "ANDRE LUIS DO PRADO (ANDRÉ DO PRADO)", ref: "B", uf: "SP" },
		];
		expect(ordenarCandidatos(lista, "André do Prado", "SP")[0].ref).toBe("B");
	});
});

describe("janela de mandato na busca (12/10/2026)", () => {
	it("fora: deputado de legislatura passada e suplente que não assumiu; dentro: quem saiu no mandato (marcado)", () => {
		expect(naJanelaDaBusca({ nome: "X", ref: "FEDERAL:CAMARA:1", casa: "CAMARA", idLegislatura: 56 })).toBe(false);
		expect(naJanelaDaBusca({ nome: "X", ref: "ESTADUAL:GO:SQ-1", suplente: true })).toBe(false);
		expect(naJanelaDaBusca({ nome: "X", ref: "ALERJ:DEPUTADO_ESTADUAL:X:", casa: "ALERJ", emExercicio: false })).toBe(true);
		expect(naJanelaDaBusca({ nome: "X", ref: "FEDERAL:CAMARA:1", casa: "CAMARA", idLegislatura: 57 })).toBe(true);
	});

	it("ex-deputado federal (legislatura 54) hoje prefeito: só o prefeito aparece", async () => {
		const d = deps({
			camara: vi.fn().mockResolvedValue([{ id: 74000, nome: "Sandro Mabel", uf: "GO", idLegislatura: 54, casa: "CAMARA" }]),
			eleitos: vi.fn().mockResolvedValue([{ nome: "SANDRO MABEL", uf: "GO", ref: "GO:PREFEITO:goiania:SQ-7", casa: "PREFEITURA" }]),
		});
		const r = await buscarCandidatos({ ...base, nome: "Sandro Mabel", uf: "GO" }, d);
		expect(r.candidatos.map((c) => c.ref)).toEqual(["GO:PREFEITO:goiania:SQ-7"]);
	});

	it("ninguém na janela: lista vazia sem erro (a tela explica a regra, não é falha)", async () => {
		const r = await buscarCandidatos({ ...base, nome: "Pessoa Comum", uf: "GO" }, deps());
		expect(r).toEqual({ candidatos: [], houveErroApi: false });
	});

	it("base de eleitos fora do ar (null) ou fonte que cai: lista vazia COM erro (aí é falha)", async () => {
		expect((await buscarCandidatos({ ...base, nome: "X", uf: "GO" }, deps({ eleitos: vi.fn().mockResolvedValue(null) }))).houveErroApi).toBe(true);
		expect((await buscarCandidatos({ ...base, nome: "X", uf: null }, deps({ camara: vi.fn().mockRejectedValue(new Error("timeout")) }))).houveErroApi).toBe(true);
	});
});

describe("buscarCandidatos (só nossas bases e fontes que respondem à Vercel)", () => {
	it("deputado estadual de SP não vira parlamentar federal de nome parecido", async () => {
		const d = deps({
			senado: vi.fn().mockResolvedValue([{ id: 9, nome: "André Amaral", uf: "PB" }]),
			alesp: vi.fn().mockResolvedValue([{ nome: "ANDRÉ DO PRADO", uf: "SP", ref: "ALESP:DEPUTADO_ESTADUAL:ANDRE:", cargo: "Deputado Estadual", casa: "ALESP" }]),
		});
		const r = await buscarCandidatos({ ...base, nome: "André do Prado", uf: "SP" }, d);
		expect(r.candidatos[0].ref).toBe("ALESP:DEPUTADO_ESTADUAL:ANDRE:");
	});

	it("SP/RJ: base (com CPF) e lista da assembleia juntas — Bacellar, cassado e fora da base, aparece marcado", async () => {
		const amorim = { nome: "RODRIGO AMORIM DOS SANTOS (RODRIGO AMORIM)", uf: "RJ", ref: "ALERJ:DEPUTADO_ESTADUAL:RODRIGO%20AMORIM%20DOS%20SANTOS:52998224725", casa: "ALERJ", cargo: "Deputado Estadual (RJ)" };
		const d = deps({
			eleitos: vi.fn().mockResolvedValue([amorim]),
			alerj: vi.fn().mockResolvedValue([
				{ nome: "RODRIGO DA SILVA BACELLAR (RODRIGO BACELLAR)", uf: "RJ", ref: "ALERJ:DEPUTADO_ESTADUAL:RODRIGO%20DA%20SILVA%20BACELLAR:", casa: "ALERJ", cargo: "Ex-deputado estadual (RJ) — sem verba de gabinete desde 03/2026", emExercicio: false },
				{ nome: "RODRIGO AMORIM DOS SANTOS (RODRIGO AMORIM)", uf: "RJ", ref: "ALERJ:DEPUTADO_ESTADUAL:RODRIGO%20AMORIM%20DOS%20SANTOS:", casa: "ALERJ", cargo: "Deputado Estadual (RJ)" },
			]),
		});
		const r = await buscarCandidatos({ ...base, nome: "Rodrigo", uf: "RJ" }, d);
		expect(d.alerj).toHaveBeenCalledWith("Rodrigo");
		expect(r.candidatos.map((c) => c.ref)).toEqual([amorim.ref, "ALERJ:DEPUTADO_ESTADUAL:RODRIGO%20DA%20SILVA%20BACELLAR:"]);
	});

	it("vereador: vem da base de eleitos e o log diz que a busca cobre estado e município", async () => {
		const vereador = { nome: "RAFAEL ALOISIO FREITAS", uf: "RJ", ref: "RJ:VEREADOR:rio-de-janeiro:SQ-1", casa: "CAMARA_MUNICIPAL_RJ" };
		const d = deps({
			camara: vi.fn().mockResolvedValue([{ id: 7, nome: "Rafael Prudente", uf: "RJ" }]),
			eleitos: vi.fn().mockResolvedValue([vereador]),
		});
		const r = await buscarCandidatos({ ...base, nome: "Rafael Aloisio Freitas", uf: "RJ" }, d);
		expect(d.eleitos).toHaveBeenCalledWith("Rafael Aloisio Freitas", "RJ", undefined);
		expect(r.candidatos[0].ref).toBe("RJ:VEREADOR:rio-de-janeiro:SQ-1");
		expect(vi.mocked(d.status).mock.calls.map((c) => c[0])).toEqual(["Buscando nas esferas Federal, Estadual e Municipal (RJ)..."]);
	});

	it("alçada FEDERAL explícita não consulta a base nem as assembleias", async () => {
		const d = deps({ camara: vi.fn().mockResolvedValue([{ id: 1, nome: "Fulano", uf: "SP" }]) });
		await buscarCandidatos({ ...base, nome: "Fulano de Tal", uf: "SP", somenteFederal: true }, d);
		expect(d.eleitos).not.toHaveBeenCalled();
		expect(d.alesp).not.toHaveBeenCalled();
	});

	it("prefeito pedido explicitamente: só a base, no cargo 11", async () => {
		const prefeito = { nome: "SANDRO MABEL", uf: "GO", ref: "GO:PREFEITO:goiania:SQ-7", casa: "PREFEITURA" };
		const d = deps({ eleitos: vi.fn().mockResolvedValue([prefeito]) });
		const r = await buscarCandidatos({ ...base, cargo: "PREFEITO", nome: "Sandro Mabel", uf: "GO" }, d);
		expect(d.eleitos).toHaveBeenCalledWith("Sandro Mabel", "GO", ["11"]);
		expect(d.camara).not.toHaveBeenCalled();
		expect(r.candidatos[0].ref).toBe("GO:PREFEITO:goiania:SQ-7");
	});

	it("governador sugerido pela correção de nome ('tarcisio'): governador da UF na base", async () => {
		const gov = { nome: "TARCISIO GOMES DE FREITAS", uf: "SP", ref: "GOVERNADOR:SP:TARCISIO GOMES DE FREITAS", casa: "GOVERNO_ESTADUAL" };
		const eleitos = vi.fn().mockImplementation(async (_n: string, _uf: string | null, cargos?: string[]) => (cargos?.[0] === "3" ? [gov] : []));
		const r = await buscarCandidatos({ ...base, nome: "tarcisio", uf: "SP", refGovernadorSugerida: "GOVERNADOR:SP:Tarcísio de Freitas" }, deps({ eleitos }));
		expect(eleitos).toHaveBeenCalledWith("Tarcísio de Freitas", "SP", ["3"]);
		expect(r.candidatos[0].ref).toBe(gov.ref);
	});

	it("base que lança erro não derruba a busca (a assembleia ainda responde)", async () => {
		const d = deps({ eleitos: vi.fn().mockRejectedValue(new Error("rede")), alesp: vi.fn().mockResolvedValue([{ nome: "X", ref: "ALESP:1", uf: "SP", casa: "ALESP" }]) });
		const r = await buscarCandidatos({ ...base, nome: "X", uf: "SP" }, d);
		expect(r.candidatos[0].ref).toBe("ALESP:1");
	});
});
