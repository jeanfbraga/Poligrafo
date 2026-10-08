import { describe, expect, it } from "vitest";
import { limitarSimultaneas } from "../../src/lib/simultaneas";

describe("limite de chamadas simultâneas", () => {
	it("nunca passa do máximo, atende na ordem e libera a vaga mesmo quando a tarefa falha", async () => {
		const executar = limitarSimultaneas(2);
		let agora = 0;
		let pico = 0;
		const ordem: number[] = [];
		const tarefa = (i: number, falhar = false) => () => new Promise<number>((ok, erro) => {
			agora++;
			pico = Math.max(pico, agora);
			ordem.push(i);
			setTimeout(() => {
				agora--;
				if (falhar) erro(new Error(`tarefa ${i}`));
				else ok(i);
			}, 5);
		});
		const resultados = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => executar(tarefa(i, i === 2))));
		expect(pico).toBe(2);
		expect(ordem).toEqual([1, 2, 3, 4, 5]);
		expect(resultados.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled", "fulfilled"]);
		expect(await executar(async () => "livre")).toBe("livre");
	});
});
