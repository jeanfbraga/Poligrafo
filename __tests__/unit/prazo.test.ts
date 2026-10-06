import { describe, expect, it } from "vitest";
import { Prazo } from "../../src/lib/prazo";

describe("Prazo", () => {
	it("conta o tempo restante e expira", () => {
		let agora = 1_000;
		const prazo = new Prazo(500, () => agora);
		expect(prazo.restanteMs()).toBe(500);
		agora = 1_400;
		expect(prazo.restanteMs()).toBe(100);
		expect(prazo.limitar(8_000)).toBe(100);
		agora = 2_000;
		expect(prazo.restanteMs()).toBe(0);
		expect(prazo.expirou()).toBe(true);
	});

	it("reserva um tempo no fim para salvar o que já foi coletado", () => {
		const agora = 0;
		const total = new Prazo(60_000, () => agora);
		const util = total.reservar(15_000);
		expect(util.restanteMs()).toBe(45_000);
		expect(total.reservar(90_000).restanteMs()).toBe(0);
	});
});
