import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));

import { candidatoDaAssembleia, deputadosDaAssembleiaNaBase, juntarCandidatosEstaduais } from "@/services/integrations/assembleias/deputados-base";
import { interpretarRef } from "@/services/core/alvo-ref";

const AGORA = new Date("2026-10-12T12:00:00Z");

function cliente(data: unknown, error: { message: string } | null = null) {
	const visoes: string[] = [];
	return {
		visoes,
		c: { from: (v: string) => (visoes.push(v), { select: async () => ({ data, error }) }) } as never,
	};
}

// alerj_deputados (DOCIGP) em 12/10/2026: o TSE marca Rodrigo Bacellar "NÃO ELEITO" em 2022,
// então ele não está em tse_eleitos, e o DivulgaCand recusa a Vercel.
const ALERJ = [
	{ deputado: "Rodrigo Da Silva Bacellar (Rodrigo Bacellar)", ultimo_ano: 2026 },
	{ deputado: "Rodrigo Amorim Dos Santos (Rodrigo Amorim)", ultimo_ano: 2026 },
	{ deputado: "Fulano Antigo Bacellar", ultimo_ano: 2022 },
];

describe("deputado estadual pela lista da própria assembleia", () => {
	it("acha pelo nome de urna e monta a ref da ALERJ que o pipe entende (sem documento)", async () => {
		const { c, visoes } = cliente(ALERJ);
		const r = await deputadosDaAssembleiaNaBase("ALERJ", "Rodrigo Bacellar", AGORA, c);
		expect(visoes).toEqual(["alerj_deputados"]);
		expect(r).toEqual([candidatoDaAssembleia("ALERJ", "Rodrigo Da Silva Bacellar (Rodrigo Bacellar)")]);
		expect(r[0]).toMatchObject({ uf: "RJ", casa: "ALERJ", cargo: "Deputado Estadual (RJ)", id: "RODRIGO DA SILVA BACELLAR" });
		expect(interpretarRef(r[0].ref)).toEqual({ tipo: "ASSEMBLEIA", uf: "RJ", casa: "ALERJ", nome: "RODRIGO DA SILVA BACELLAR", doc: "" });
	});

	it("nome parcial lista os que batem; quem saiu antes do ano passado fica de fora", async () => {
		const { c } = cliente(ALERJ);
		const r = await deputadosDaAssembleiaNaBase("ALERJ", "Rodrigo", AGORA, c);
		expect(r.map((x) => x.id)).toEqual(["RODRIGO DA SILVA BACELLAR", "RODRIGO AMORIM DOS SANTOS"]);
		expect((await deputadosDaAssembleiaNaBase("ALERJ", "Bacellar", AGORA, c)).map((x) => x.id)).toEqual(["RODRIGO DA SILVA BACELLAR"]);
	});

	it("ALESP usa a lista da ALESP; base fora do ar = [] com aviso no log", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { c, visoes } = cliente(null, { message: "timeout" });
		expect(await deputadosDaAssembleiaNaBase("ALESP", "André do Prado", AGORA, c)).toEqual([]);
		expect(visoes).toEqual(["alesp_deputados"]);
		expect(aviso).toHaveBeenCalledWith("[ALESP] Lista de deputados indisponível (timeout); seguindo sem ela.");
		aviso.mockRestore();
	});

	it("sem verba há mais de 3 meses (mandato cassado): ex-deputado, com a data, e sem mandato atual na ordenação", async () => {
		// Bacellar: diploma cassado pelo TSE em 2026; última verba 03/2026, base da ALERJ até 07/2026.
		const linhas = [
			{ deputado: "Rodrigo Da Silva Bacellar (Rodrigo Bacellar)", ultimo_ano: 2026, ultimo_mes: "2026-03-01" },
			{ deputado: "Carlos Augusto Nogueira Pinto (Delegado Carlos Augusto)", ultimo_ano: 2026, ultimo_mes: "2026-07-01" },
			{ deputado: "Rodrigo Amorim Dos Santos (Rodrigo Amorim)", ultimo_ano: 2026, ultimo_mes: "2026-06-01" },
		];
		const r = await deputadosDaAssembleiaNaBase("ALERJ", "Rodrigo", AGORA, cliente(linhas).c);
		expect(r.map((x) => [x.id, x.cargo, x.emExercicio])).toEqual([
			["RODRIGO DA SILVA BACELLAR", "Ex-deputado estadual (RJ) — sem verba de gabinete desde 03/2026", false],
			["RODRIGO AMORIM DOS SANTOS", "Deputado Estadual (RJ)", undefined],
		]);
		const { mandatoAtual, ordenarCandidatos } = await import("@/services/core/busca-candidatos");
		expect(mandatoAtual(r[0])).toBe(false);
		expect(ordenarCandidatos(r, "Rodrigo", "RJ").map((x) => x.id)).toEqual(["RODRIGO AMORIM DOS SANTOS", "RODRIGO DA SILVA BACELLAR"]);
	});

	it("cargo do dossiê: ex-deputado só quando a verba parou; em exercício ou nome ambíguo, o de sempre", async () => {
		const { cargoForaDoExercicio } = await import("@/services/integrations/assembleias/deputados-base");
		const linhas = [
			{ deputado: "Rodrigo Da Silva Bacellar (Rodrigo Bacellar)", ultimo_ano: 2026, ultimo_mes: "2026-03-01" },
			{ deputado: "Rodrigo Amorim Dos Santos (Rodrigo Amorim)", ultimo_ano: 2026, ultimo_mes: "2026-07-01" },
		];
		expect(await cargoForaDoExercicio("ALERJ", "RODRIGO DA SILVA BACELLAR", AGORA, cliente(linhas).c)).toBe("Ex-deputado estadual (RJ) — sem verba de gabinete desde 03/2026");
		expect(await cargoForaDoExercicio("ALERJ", "RODRIGO AMORIM DOS SANTOS", AGORA, cliente(linhas).c)).toBeNull();
		expect(await cargoForaDoExercicio("ALERJ", "Rodrigo", AGORA, cliente(linhas).c)).toBeNull();
	});

	it("com o TSE respondendo, a mesma pessoa não aparece duas vezes (o do TSE traz o CPF)", () => {
		const doTse = [{ ...candidatoDaAssembleia("ALERJ", "RODRIGO DA SILVA BACELLAR"), ref: "ALERJ:DEPUTADO_ESTADUAL:RODRIGO%20DA%20SILVA%20BACELLAR:08661032792" }];
		const daBase = [candidatoDaAssembleia("ALERJ", "Rodrigo Da Silva Bacellar (Rodrigo Bacellar)"), candidatoDaAssembleia("ALERJ", "Rodrigo Amorim Dos Santos (Rodrigo Amorim)")];
		expect(juntarCandidatosEstaduais(doTse, daBase).map((x) => x.ref)).toEqual([doTse[0].ref, daBase[1].ref]);
	});
});
