import { describe, expect, it, vi } from "vitest";

/** Imita o PostgREST: aplica `.range()` e nunca devolve mais que 1000 linhas. */
function clienteFalso(linhas: any[], opcoes: { erroNaPagina?: number } = {}) {
	const ranges: Array<[number, number]> = [];
	const client = {
		ranges,
		from: () => {
			let de = 0;
			let ate = Number.POSITIVE_INFINITY;
			const q: any = {
				select: () => q,
				eq: () => q,
				order: () => q,
				range: (a: number, b: number) => {
					de = a;
					ate = b;
					ranges.push([a, b]);
					return q;
				},
				then: (ok: (r: any) => unknown, falha?: (e: unknown) => unknown) => {
					if (opcoes.erroNaPagina === ranges.length - 1) {
						return Promise.resolve({ data: null, error: { message: "timeout" } }).then(ok, falha);
					}
					const data = linhas.slice(de, Math.min(ate + 1, de + 1000));
					return Promise.resolve({ data, error: null }).then(ok, falha);
				},
			};
			return q;
		},
	};
	return client;
}

const fakes = vi.hoisted(() => ({ perfil: {} as any, principal: {} as any }));
vi.mock("@/lib/supabase-perfil", () => ({ get supabasePerfilAdmin() { return fakes.perfil; } }));
vi.mock("@/lib/supabase-admin", () => ({ get supabaseAdmin() { return fakes.principal; } }));

const { buscarVotosDeputado } = await import("@/lib/perfil-deputado/consultas");

function votos(n: number) {
	return Array.from({ length: n }, (_, i) => ({
		id_votacao: `v-${String(i).padStart(5, "0")}`,
		voto: i % 3 === 0 ? "Não" : "Sim",
		camara_votacoes_master: { data_votacao: new Date(Date.UTC(2023, 0, 1) + i * 86_400_000).toISOString() },
	}));
}

describe("buscarVotosDeputado", () => {
	it("lê todas as páginas em vez de parar nas 1000 linhas do PostgREST", async () => {
		fakes.perfil = clienteFalso(votos(2345));
		fakes.principal = clienteFalso([]);
		const lista = await buscarVotosDeputado(fakes.perfil, 109429);
		expect(lista).toHaveLength(2345);
		expect(fakes.perfil.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
		expect(new Set(lista.map((v: any) => v.id_votacao)).size).toBe(2345);
		// Do mais recente ao mais antigo, depois de juntar as páginas.
		expect(lista[0].id_votacao).toBe("v-02344");
		expect(lista.at(-1)?.id_votacao).toBe("v-00000");
	});

	it("com exatamente 1000 votos, confirma o fim com uma página vazia", async () => {
		fakes.perfil = clienteFalso(votos(1000));
		fakes.principal = clienteFalso([]);
		expect(await buscarVotosDeputado(fakes.perfil, 1)).toHaveLength(1000);
		expect(fakes.perfil.ranges).toEqual([[0, 999], [1000, 1999]]);
	});

	it("erro no meio da paginação resulta em lista vazia, nunca em contagem truncada", async () => {
		fakes.perfil = clienteFalso(votos(1500), { erroNaPagina: 1 });
		fakes.principal = clienteFalso(votos(1500));
		expect(await buscarVotosDeputado(fakes.perfil, 1)).toEqual([]);
	});

	it("nunca consulta o banco principal: perfil vazio é perfil vazio", async () => {
		fakes.perfil = clienteFalso([]);
		fakes.principal = clienteFalso(votos(1500));
		expect(await buscarVotosDeputado(fakes.perfil, 1)).toEqual([]);
		expect(fakes.principal.ranges).toEqual([]);
	});
});
