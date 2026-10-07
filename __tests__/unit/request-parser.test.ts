import { afterEach, describe, expect, it, vi } from "vitest";
import congressoIndex from "../../src/services/integrations/data/congresso-index.json";
import { parseInvestigarRequest } from "../../src/services/core/request-parser";

type Entrada = { id: string; nome: string; casa: string; emExercicio?: boolean };
const indice = congressoIndex as Entrada[];

function parse(query: string) {
	return parseInvestigarRequest(`http://localhost/api/investigar?${query}`) as { forceRef: string | null; nomeParaBusca: string };
}

describe("atalho do índice do Congresso (request-parser)", () => {
	afterEach(() => vi.restoreAllMocks());

	it("o índice marca quem saiu do mandato e mantém a página de perfil deles", () => {
		const fora = indice.filter((p) => p.emExercicio === false);
		expect(fora.length).toBeGreaterThan(0);
		expect(indice.every((p) => typeof p.emExercicio === "boolean")).toBe(true);
	});

	it("ex-deputado (hoje em outro cargo) NÃO ganha atalho: passa pela busca normal", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const ex = indice.find((p) => p.casa === "CAMARA" && p.emExercicio === false) as Entrada;
		expect(parse(`nome=${encodeURIComponent(ex.nome)}`).forceRef).toBeNull();
	});

	it("deputado em exercício ganha o atalho e o log registra a ref forçada", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const atual = indice.find((p) => p.casa === "CAMARA" && p.emExercicio === true) as Entrada;
		expect(parse(`nome=${encodeURIComponent(atual.nome)}`).forceRef).toBe(`FEDERAL:CAMARA:${atual.id}`);
		expect(log).toHaveBeenCalledWith(`[BYPASS] Match local encontrado no JSON para ${atual.nome.toLowerCase()}. Ref forçada: FEDERAL:CAMARA:${atual.id}`);
	});

	it("cargo pedido (ex.: PREFEITO) nunca usa o atalho federal", () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const atual = indice.find((p) => p.casa === "CAMARA" && p.emExercicio === true) as Entrada;
		expect(parse(`nome=${encodeURIComponent(atual.nome)}&cargo=PREFEITO`).forceRef).toBeNull();
	});
});
