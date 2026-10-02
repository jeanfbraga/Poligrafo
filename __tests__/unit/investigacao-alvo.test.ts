import { describe, expect, it } from "vitest";
import {
	acharPorNomeExato,
	alvoDosParams,
	identidadeInicial,
	inferirRef,
	montarRef,
	normalizarNome,
	rotaDoPolitico,
	urlDossie,
} from "@/lib/investigacao/alvo";

const INDEX = [
	{ id: 100, nome: "Alice Ribeiro", casa: "CAMARA", uf: "RJ", partido: "XYZ" },
	{ id: 200, nome: "Carla Nogueira", casa: "SENADO", uf: "MG" },
	{ id: "v1", nome: "Gilda Sampaio", casa: "CAMARA_MUNICIPAL", uf: "SE", municipio: "aracaju" },
	{ id: "g1", nome: "Gov Teste", casa: "GOVERNADOR", uf: "SP" },
];

describe("montarRef", () => {
	it("monta refs por casa", () => {
		expect(montarRef(INDEX[0])).toBe("FEDERAL:CAMARA:100");
		expect(montarRef(INDEX[1])).toBe("FEDERAL:SENADO:200");
		expect(montarRef(INDEX[2])).toBe("SE:VEREADOR:aracaju:v1");
		expect(montarRef(INDEX[3])).toBe("GOVERNADOR:SP:g1");
		expect(montarRef({ id: "p1", nome: "P", casa: "PREFEITO", uf: "BA" })).toBe("PREFEITO:BA:p1");
	});

	it("sem id ou casa desconhecida retorna undefined", () => {
		expect(montarRef({ nome: "Sem Id", casa: "CAMARA" })).toBeUndefined();
		expect(montarRef({ id: 1, nome: "X", casa: "OUTRA" })).toBeUndefined();
	});
});

describe("nomes", () => {
	it("normalizarNome remove acentos e caixa", () => {
		expect(normalizarNome("João Álvaro")).toBe("joao alvaro");
	});

	it("acharPorNomeExato ignora acento e espaços nas pontas", () => {
		expect(acharPorNomeExato("  ALICE ribeiro ", INDEX)?.id).toBe(100);
		expect(acharPorNomeExato("Inexistente", INDEX)).toBeUndefined();
	});
});

describe("identidadeInicial", () => {
	it("usa a ref explícita da Câmara (cargo + fotos)", () => {
		const r = identidadeInicial({ nome: "Qualquer", ref: "FEDERAL:CAMARA:555" }, INDEX);
		expect(r.cargo).toBe("DEPUTADO FEDERAL");
		expect(r.urlFoto).toContain("/fotos-politicos/555.jpg");
		expect(r.urlFotoFallback).toBe("https://www.camara.leg.br/internet/deputado/bandep/555.jpg");
	});

	it("ref do Senado usa a foto oficial do Senado como fallback", () => {
		const r = identidadeInicial({ nome: "X", ref: "FEDERAL:SENADO:9" }, []);
		expect(r.cargo).toBe("SENADOR");
		expect(r.urlFotoFallback).toContain("senador9.jpg");
	});

	it("ref de governador/prefeito/vereador define cargo e UF", () => {
		expect(identidadeInicial({ nome: "X", ref: "GOVERNADOR:SP:1" }, [])).toMatchObject({ cargo: "GOVERNADOR", uf: "SP" });
		expect(identidadeInicial({ nome: "X", ref: "PREFEITO:BA:1" }, [])).toMatchObject({ cargo: "PREFEITO", uf: "BA" });
		expect(identidadeInicial({ nome: "X", ref: "SE:VEREADOR:aracaju:1" }, [])).toMatchObject({ cargo: "VEREADOR", uf: "SE" });
	});

	it("sem ref, cai no match pelo nome no índice", () => {
		const r = identidadeInicial({ nome: "Alice Ribeiro" }, INDEX);
		expect(r).toMatchObject({ cargo: "DEPUTADO FEDERAL", uf: "RJ" });
		expect(r.urlFoto).toContain("100.jpg");
	});

	it("a UF da alçada (exceto FEDERAL) vale mais que a do índice", () => {
		expect(identidadeInicial({ nome: "Alice Ribeiro", uf: "SP" }, INDEX).uf).toBe("SP");
		expect(identidadeInicial({ nome: "Alice Ribeiro", uf: "FEDERAL" }, INDEX).uf).toBe("RJ");
	});

	it("sem nenhuma pista retorna campos indefinidos", () => {
		expect(identidadeInicial({ nome: "Ninguém" }, INDEX)).toEqual({
			cargo: undefined,
			uf: undefined,
			urlFoto: undefined,
			urlFotoFallback: undefined,
		});
	});

	it("vereador indexado vira cargo VEREADOR sem foto", () => {
		const r = identidadeInicial({ nome: "Gilda Sampaio" }, INDEX);
		expect(r.cargo).toBe("VEREADOR");
		expect(r.urlFoto).toBeUndefined();
	});
});

describe("inferirRef", () => {
	it("prioriza a ref explícita, depois o índice, depois a alçada estadual", () => {
		expect(inferirRef({ nome: "X", ref: "A:B:C" }, INDEX)).toBe("A:B:C");
		expect(inferirRef({ nome: "Alice Ribeiro" }, INDEX)).toBe("FEDERAL:CAMARA:100");
		expect(inferirRef({ nome: "Desconhecido", uf: "RJ" }, INDEX)).toBe("ESTADUAL:RJ");
		expect(inferirRef({ nome: "Desconhecido" }, INDEX)).toBeUndefined();
	});
});

describe("urlDossie / alvoDosParams", () => {
	it("faz o round-trip do alvo", () => {
		const url = urlDossie({ nome: "Alice Ribeiro", ref: "FEDERAL:CAMARA:100", uf: "FEDERAL" });
		expect(url.startsWith("/dossie?")).toBe(true);
		const q = new URLSearchParams(url.split("?")[1]);
		expect(alvoDosParams(q)).toEqual({ nome: "Alice Ribeiro", ref: "FEDERAL:CAMARA:100", uf: "FEDERAL" });
	});

	it("aceita o formato legado ?alvo=Nome&ref=REF", () => {
		const q = new URLSearchParams("alvo=Alice%20Ribeiro&ref=FEDERAL%3ACAMARA%3A100");
		expect(alvoDosParams(q)).toEqual({ nome: "Alice Ribeiro", ref: "FEDERAL:CAMARA:100", uf: undefined });
	});

	it("aceita o formato legado ?alvo=REF&nome=Nome", () => {
		const q = new URLSearchParams("alvo=FEDERAL%3ASENADO%3A9&nome=Carla&uf=FEDERAL");
		expect(alvoDosParams(q)).toEqual({ nome: "Carla", ref: "FEDERAL:SENADO:9", uf: "FEDERAL" });
	});

	it("sem alvo retorna null", () => {
		expect(alvoDosParams(new URLSearchParams("nome=Fulano"))).toBeNull();
		expect(alvoDosParams(new URLSearchParams(""))).toBeNull();
	});

	it("alvo só com nome (sem ref) preserva a UF", () => {
		const q = new URLSearchParams("alvo=Fulano&uf=RJ");
		expect(alvoDosParams(q)).toEqual({ nome: "Fulano", ref: undefined, uf: "RJ" });
	});
});

describe("rotaDoPolitico — só deputado e presidente têm Perfil", () => {
	it("presidente vai ao perfil do presidente", () => {
		expect(rotaDoPolitico({ id: "lula", nome: "Lula", isPresidente: true })).toEqual({
			tipo: "perfil",
			href: "/perfil/presidente/lula",
		});
	});

	it("deputado federal vai ao perfil com nome, partido e UF", () => {
		const r = rotaDoPolitico(INDEX[0]);
		expect(r.tipo).toBe("perfil");
		expect(r.href).toContain("/perfil/deputado/100?");
		expect(r.href).toContain("nome=Alice+Ribeiro");
		expect(r.href).toContain("partido=XYZ");
		expect(r.href).toContain("uf=RJ");
	});

	it("senador, vereador e governador vão direto ao dossiê com a ref", () => {
		for (const p of [INDEX[1], INDEX[2], INDEX[3]]) {
			const r = rotaDoPolitico(p);
			expect(r.tipo).toBe("dossie");
			expect(r.href).toContain("/dossie?alvo=");
		}
	});
});
