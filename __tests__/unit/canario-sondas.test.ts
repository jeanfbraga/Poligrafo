import { describe, expect, it } from "vitest";
import { SONDAS } from "../../scripts/qa/canario/sondas";

describe("canário de fontes — o que deixa a action vermelha", () => {
	it("o CSV do TSE (base tse_eleitos) é crítico; o DivulgaCand, que recusa IP de nuvem, não", () => {
		const critica = (id: string) => SONDAS.find((s) => s.id === id)?.critica;
		expect(critica("tse-cdn-candidatos")).toBe(true);
		expect(critica("tse-divulgacand")).toBeFalsy();
	});
});
