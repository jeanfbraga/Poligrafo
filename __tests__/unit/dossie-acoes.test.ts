import { describe, expect, it } from "vitest";
import {
	acoesDoNo,
	cnpjDoNo,
	hrefPerfil,
	linkMapa,
	TIPOS_COM_INSPETOR,
	urlDocumentoValida,
} from "@/components/dossie/acoes";

describe("cnpjDoNo", () => {
	it("EMPRESA usa cnpj; despesa usa documento; só aceita 14 dígitos", () => {
		expect(cnpjDoNo("EMPRESA", { cnpj: "12.345.678/0001-90" })).toBe("12345678000190");
		expect(cnpjDoNo("DESPESA", { documento: "12345678000190" })).toBe("12345678000190");
		expect(cnpjDoNo("DESPESA", { cnpjCpfFornecedor: "12345678000190" })).toBe("12345678000190");
		expect(cnpjDoNo("DESPESA", { documento: "12345678901" })).toBe("");
		expect(cnpjDoNo("SOCIO", {})).toBe("");
	});
});

describe("urlDocumentoValida e linkMapa", () => {
	it("aceita PDF e domínios oficiais; rejeita o resto", () => {
		expect(urlDocumentoValida("https://x.com/nota.pdf")).toBe(true);
		expect(urlDocumentoValida("https://www.camara.leg.br/cota/1")).toBe(true);
		expect(urlDocumentoValida("https://www.senado.leg.br/x")).toBe(true);
		expect(urlDocumentoValida("https://outro.com/x")).toBe(false);
		expect(urlDocumentoValida(null)).toBe(false);
	});

	it("linkMapa monta a busca com nome, município, UF e CNPJ", () => {
		const url = linkMapa({ label: "ACME", municipio: "Niterói", uf: "RJ", cnpj: "123" });
		expect(url).toContain("google.com/maps/search");
		expect(decodeURIComponent(url)).toContain("ACME Niterói RJ CNPJ 123 Brasil");
	});
});

describe("hrefPerfil", () => {
	it("deputado federal com id vira link de perfil com query", () => {
		const href = hrefPerfil({ cargo: "DEPUTADO FEDERAL", label: "Alice", partido: "XYZ", uf: "RJ", ref: "FEDERAL:CAMARA:100" }, "pessoa-100");
		expect(href).toContain("/perfil/deputado/100?");
		expect(href).toContain("nome=Alice");
	});

	it("senador ou sem id não tem link", () => {
		expect(hrefPerfil({ cargo: "SENADOR", label: "X" }, "p")).toBeUndefined();
		expect(hrefPerfil({ cargo: "DEPUTADO FEDERAL", label: "X" }, "sem-id")).toBeUndefined();
	});
});

describe("acoesDoNo", () => {
	const ids = (n: Parameters<typeof acoesDoNo>[0], ja = false) => acoesDoNo(n, ja).map((a) => a.id);

	it("PESSOA: perfil só para deputado federal", () => {
		expect(ids({ id: "pessoa-100", type: "PESSOA", data: { cargo: "DEPUTADO FEDERAL", label: "A", idPoliticoOriginal: "100" } })).toEqual(["perfil"]);
		expect(ids({ id: "p", type: "PESSOA", data: { cargo: "VEREADOR", label: "A" } })).toEqual([]);
	});

	it("DESPESA: nota, pivô e mapa quando há PDF e CNPJ", () => {
		const n = { id: "d", type: "DESPESA", data: { documento: "12345678000190", urlDocumento: "https://x/y.pdf", label: "ACME" } };
		expect(ids(n)).toEqual(["nota", "pivot-cnpj", "mapa"]);
	});

	it("DESPESA de campanha ou com CPF não oferece pivô nem mapa", () => {
		expect(ids({ id: "d", type: "DESPESA", data: { documento: "12345678000190", label: "COMITE DE CAMPANHA" } })).toEqual([]);
		expect(ids({ id: "d", type: "DESPESA", data: { documento: "12345678901", label: "FULANO" } })).toEqual([]);
	});

	it("EMPRESA: pivô + mapa; marca concluída depois de expandir", () => {
		const n = { id: "e", type: "EMPRESA", data: { cnpj: "12345678000190", label: "ACME" } };
		expect(ids(n)).toEqual(["pivot-cnpj", "mapa"]);
		expect(acoesDoNo(n, true)[0].concluida).toBe(true);
	});

	it("SOCIO: busca reversa sempre; pivô só com CNPJ; sem mapa", () => {
		expect(ids({ id: "s", type: "SOCIO", data: { label: "Rui" } })).toEqual(["busca-reversa"]);
		const a = acoesDoNo({ id: "s", type: "SOCIO", data: { label: "Rui", documento: "12345678000190" } }, false);
		expect(a.map((x) => x.id)).toEqual(["pivot-cnpj", "busca-reversa"]);
		expect(a.find((x) => x.id === "busca-reversa")?.arg).toBe("Rui");
	});

	it("EMENDA_RESUMO alterna o rótulo conforme o estado", () => {
		expect(acoesDoNo({ id: "hub", type: "EMENDA_RESUMO", data: {} }, false)[0].label).toBe("Ver todas as emendas no canvas");
		expect(acoesDoNo({ id: "hub", type: "EMENDA_RESUMO", data: { isExpanded: true } }, false)[0].label).toBe("Recolher emendas no canvas");
		expect(acoesDoNo({ id: "hub", type: "EMENDA_RESUMO", data: {} }, false)[0].arg).toBe("hub");
	});

	it("o resumo do Transferegov (sem emendas filhas) não oferece 'ver emendas no canvas'", () => {
		expect(acoesDoNo({ id: "transferegov-p", type: "EMENDA_RESUMO", data: { label: "TRANSFEREGOV: EMENDAS PIX (75)" } }, false)).toEqual([]);
	});

	it("RESUMO_GASTOS abre o Raio-X com o nome do vereador", () => {
		expect(acoesDoNo({ id: "r", type: "RESUMO_GASTOS", data: { nomeVereador: "Fulano" } }, false)[0]).toMatchObject({ id: "raio-x", arg: "Fulano" });
	});

	it("tipos sem ação retornam lista vazia", () => {
		expect(ids({ id: "x", type: "CONTRATO", data: {} })).toEqual([]);
		expect(ids({ id: "x" })).toEqual([]);
	});

	it("todos os tipos principais abrem o inspetor", () => {
		for (const t of ["PESSOA", "DESPESA", "EMENDA", "EMPRESA", "SOCIO", "CONTRATO", "PROCESSO_JUDICIAL"]) {
			expect(TIPOS_COM_INSPETOR.has(t), t).toBe(true);
		}
	});
});
