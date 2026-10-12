import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));

import { buscarPoliticosCamaraLista } from "../../src/app/api/investigar/scrapers/legislativo";
import { titularDoCargo } from "../../src/services/integrations/tse/eleitos";

afterEach(() => vi.unstubAllGlobals());

describe("busca na Câmara por UF", () => {
	// 12/10/2026: nome + siglaUf + idLegislatura juntos deixavam a API em 12–15 s (504) e o pipe
	// desistia aos 10 s em toda busca por UF ("Câmara dos Deputados demorou demais").
	it("a URL não leva siglaUf; a UF é filtrada na resposta", async () => {
		const fetchFn = vi.fn(async () =>
			new Response(JSON.stringify({ dados: [
				{ id: 1, nome: "Marcelo Calero", siglaUf: "RJ", idLegislatura: 57 },
				{ id: 2, nome: "Marcelo Álvaro", siglaUf: "MG", idLegislatura: 57 },
			] }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchFn);
		const r = await buscarPoliticosCamaraLista("Marcelo", "RJ");
		const url = String((fetchFn.mock.calls[0] as unknown[])[0]);
		expect(url).not.toContain("siglaUf");
		expect(url).toContain("idLegislatura=57");
		expect(r.map((p) => p.id)).toEqual([1]);
		expect((await buscarPoliticosCamaraLista("Marcelo", "FEDERAL")).map((p) => p.id)).toEqual([1, 2]);
	});
});

describe("titular do cargo (governador e presidente)", () => {
	const TARCISIO = { sq_candidato: "250001615967", ano_eleicao: 2022, cd_cargo: "3", sg_uf: "SP", nm_candidato: "TARCISIO GOMES DE FREITAS", nm_urna_candidato: "TARCÍSIO", nr_cpf_candidato: "52998224725" };

	function cliente(data: unknown[], error: { message: string } | null = null) {
		const filtros: [string, unknown][] = [];
		const q: Record<string, unknown> = {};
		q.select = () => q;
		q.eq = (c: string, v: unknown) => (filtros.push([c, v]), q);
		q.order = () => q;
		q.limit = async () => ({ data, error });
		return { filtros, c: { from: () => q } as never };
	}

	it("governador da UF com nome compatível (curto ou completo)", async () => {
		for (const nome of ["Tarcísio", "Tarcísio de Freitas", "TARCISIO GOMES DE FREITAS"]) {
			const { c, filtros } = cliente([TARCISIO]);
			expect(await titularDoCargo("3", "SP", nome, c)).toMatchObject({ sq_candidato: "250001615967" });
			expect(filtros).toEqual([["cd_cargo", "3"], ["sg_uf", "SP"]]);
		}
	});

	it("nome que não bate, cargo com vários titulares ou mais de um na mesma eleição: nada", async () => {
		expect(await titularDoCargo("3", "SP", "Fernando Haddad", cliente([TARCISIO]).c)).toBeNull();
		expect(await titularDoCargo("5", "RJ", "Flávio Bolsonaro", cliente([TARCISIO]).c)).toBeNull();
		expect(await titularDoCargo("3", "SP", "Tarcísio", cliente([TARCISIO, { ...TARCISIO, sq_candidato: "2" }]).c)).toBeNull();
	});

	it("presidente: sem filtro de UF; base fora do ar = null com aviso", async () => {
		const { c, filtros } = cliente([{ ...TARCISIO, cd_cargo: "1", sg_uf: "BR", nm_candidato: "LUIZ INÁCIO LULA DA SILVA", nm_urna_candidato: "LULA" }]);
		expect(await titularDoCargo("1", "BR", "Luiz Inácio Lula da Silva", c)).toMatchObject({ cd_cargo: "1" });
		expect(filtros).toEqual([["cd_cargo", "1"]]);
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await titularDoCargo("3", "SP", "Tarcísio", cliente([], { message: "fora" }).c)).toBeNull();
		expect(aviso.mock.calls.some((a) => String(a[0]).includes("[TSE ELEITOS] Base indisponível (fora)"))).toBe(true);
		aviso.mockRestore();
	});
});
