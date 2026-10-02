import { describe, expect, it } from "vitest";
import {
	abreviarPartido,
	buscarPoliticos,
	combinaComAlcada,
	destacarNome,
	INDICE_COMPLETO,
	mesclarRecente,
	rotuloCargo,
	termosDe,
	UFS,
	VIPS,
} from "@/lib/busca";

const IDX = [
	{ id: 1, nome: "Alice Ribeiro", casa: "CAMARA", uf: "RJ", partido: "XYZ" },
	{ id: 2, nome: "Maria Alice Souza", casa: "CAMARA", uf: "SP", partido: "ABC" },
	{ id: 3, nome: "Alicia Keys", casa: "SENADO", uf: "RJ", partido: "DEF" },
	{ id: 4, nome: "Bruno Alice", casa: "CAMARA_MUNICIPAL", uf: "SE", partido: "GHI" },
	{ id: "lula", nome: "Luiz Inácio Lula da Silva", casa: "PRESIDENCIA_DA_REPUBLICA", uf: "BR", isPresidente: true },
];

describe("buscarPoliticos", () => {
	it("exige todos os termos, ignorando acento e caixa", () => {
		expect(buscarPoliticos("INACIO lula", "FEDERAL", IDX).map((p) => p.id)).toEqual(["lula"]);
		expect(buscarPoliticos("alice ribeiro", "FEDERAL", IDX).map((p) => p.id)).toEqual([1]);
	});

	it("FEDERAL não filtra por UF; uma UF filtra e exclui presidentes", () => {
		expect(buscarPoliticos("alice", "FEDERAL", IDX)).toHaveLength(3);
		expect(buscarPoliticos("alice", "RJ", IDX).map((p) => p.id)).toEqual([1]);
		expect(buscarPoliticos("lula", "RJ", IDX)).toEqual([]);
	});

	it("nomes que começam pelo termo vêm primeiro", () => {
		const r = buscarPoliticos("alice", "FEDERAL", IDX).map((p) => p.id);
		expect(r.slice(0, 1)).toEqual([1]);
		expect(r.indexOf(2)).toBeGreaterThan(r.indexOf(1));
	});

	it("deduplica por id e respeita o limite", () => {
		const dup = [...IDX, { ...IDX[0] }];
		expect(buscarPoliticos("alice ribeiro", "FEDERAL", dup)).toHaveLength(1);
		expect(buscarPoliticos("alice", "FEDERAL", IDX, 2)).toHaveLength(2);
	});

	it("consulta vazia não retorna nada", () => {
		expect(buscarPoliticos("   ", "FEDERAL", IDX)).toEqual([]);
	});

	it("o índice real encontra Lula pelos VIPs", () => {
		expect(buscarPoliticos("inacio lula", "FEDERAL").some((p) => p.id === "lula")).toBe(true);
		expect(VIPS.every((v) => v.isPresidente)).toBe(true);
		expect(INDICE_COMPLETO.length).toBeGreaterThan(100);
	});
});

describe("alçada e auxiliares", () => {
	it("combinaComAlcada", () => {
		expect(combinaComAlcada(IDX[0], "")).toBe(true);
		expect(combinaComAlcada(IDX[0], "FEDERAL")).toBe(true);
		expect(combinaComAlcada(IDX[0], "RJ")).toBe(true);
		expect(combinaComAlcada(IDX[0], "SP")).toBe(false);
		expect(combinaComAlcada(IDX[4], "RJ")).toBe(false);
	});

	it("termosDe normaliza e separa", () => {
		expect(termosDe("  João  Álvaro ")).toEqual(["joao", "alvaro"]);
	});

	it("27 UFs", () => {
		expect(UFS).toHaveLength(27);
	});
});

describe("destacarNome", () => {
	it("destaca o primeiro termo encontrado preservando o texto original", () => {
		expect(destacarNome("Maria Alice Souza", "alice")).toEqual([
			{ texto: "Maria ", destaque: false },
			{ texto: "Alice", destaque: true },
			{ texto: " Souza", destaque: false },
		]);
	});

	it("sem correspondência devolve o nome inteiro; no início não gera trecho vazio", () => {
		expect(destacarNome("Bruno", "xyz")).toEqual([{ texto: "Bruno", destaque: false }]);
		expect(destacarNome("Alice", "ali")[0]).toEqual({ texto: "Ali", destaque: true });
	});
});

describe("abreviarPartido, rotuloCargo e recentes", () => {
	it("abrevia partidos longos e trata vazio", () => {
		expect(abreviarPartido("Solidariedade")).toBe("SD");
		expect(abreviarPartido("pt")).toBe("PT");
		expect(abreviarPartido()).toBe("—");
	});

	it("rótulos de cargo por casa", () => {
		expect(rotuloCargo(IDX[0])).toBe("Deputado federal · Câmara");
		expect(rotuloCargo(IDX[1])).toBe("Deputado federal · Câmara");
		expect(rotuloCargo(IDX[2])).toBe("Senador · Senado");
		expect(rotuloCargo(IDX[4])).toBe("Presidência da República");
		expect(rotuloCargo({ nome: "X", cargo: "Vice" })).toBe("Vice");
		expect(rotuloCargo({ nome: "X" })).toBe("Político");
	});

	it("mesclarRecente põe o novo no topo, sem duplicar, até o máximo", () => {
		let r = mesclarRecente([], IDX[0]);
		r = mesclarRecente(r, IDX[1]);
		r = mesclarRecente(r, IDX[0]);
		expect(r.map((p) => p.id)).toEqual([1, 2]);
		const muitos = [IDX[0], IDX[1], IDX[2], IDX[3]].reduce<typeof IDX>((acc, p) => mesclarRecente(acc, p), []);
		expect(mesclarRecente(muitos, IDX[4], 4)).toHaveLength(4);
	});
});
