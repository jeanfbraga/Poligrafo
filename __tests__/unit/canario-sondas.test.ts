import { describe, expect, it } from "vitest";
import { SONDAS } from "../../scripts/qa/canario/sondas";

describe("canário de fontes — o que deixa a action vermelha", () => {
	it("o CSV do TSE (base tse_eleitos) é crítico; o DivulgaCand saiu do sistema e não é mais vigiado", () => {
		expect(SONDAS.find((s) => s.id === "tse-cdn-candidatos")?.critica).toBe(true);
		expect(SONDAS.some((s) => s.id === "tse-divulgacand")).toBe(false);
	});
});
