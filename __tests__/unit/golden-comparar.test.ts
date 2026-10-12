import { describe, expect, it } from "vitest";
import { compararEventos, normalizar } from "../../scripts/qa/golden/comparar";

const no = (id: string, extra: Record<string, unknown> = {}) => ({ tipo: "NODE_NOVO", payload: { id, type: "DESPESA", data: { label: "X", ...extra } } });
const etapa = (fonte: string, estado: string) => ({ tipo: "ETAPA", payload: { fonte, estado } });
const st = (msg: string) => ({ tipo: "STATUS", payload: { msg } });

describe("golden master — comparação de eventos", () => {
	it("ignora o que muda a cada execução: carimbo de tempo e sufixo aleatório nos ids, datas e durações", () => {
		expect(normalizar({ id: "despesa-123-1791801612365-abc12def9", t: "2026-10-12T10:00:00.000Z", msg: "respondeu em 1,2 s" })).toEqual({
			id: "despesa-123-<TS>",
			msg: "respondeu em <DUR>",
			t: "<T>",
		});
		expect(normalizar({ "servidor-cmrj-1791801612365-0": 1 })).toEqual({ "servidor-cmrj-<TS>-0": 1 });
		expect(compararEventos([no("despesa-1-1791801612365-aaaaaaaaa")], [no("despesa-1-1791801699999-bbbbbbbbb")])).toEqual([]);
		expect(compararEventos([st("Triagem em progresso... (15s)")], [])).toEqual([]);
	});

	it("aponta evento que sumiu, apareceu ou mudou de conteúdo", () => {
		const dif = compararEventos([no("a", { valor: 10 }), st("x")], [no("a", { valor: 11 }), st("x"), st("novo")]);
		expect(dif.some((d) => d.startsWith("sumiu (1x)") && d.includes('"valor":10'))).toBe(true);
		expect(dif.some((d) => d.startsWith("apareceu (1x)") && d.includes('"valor":11'))).toBe(true);
		expect(dif.some((d) => d.includes('"msg":"novo"'))).toBe(true);
	});

	it("ordem: avisos de conexão (ETAPA) de fontes em paralelo podem trocar; o resto não", () => {
		expect(compararEventos([etapa("emendas", "respondeu"), etapa("receita", "lenta"), st("a")], [etapa("receita", "lenta"), etapa("emendas", "respondeu"), st("a")])).toEqual([]);
		const dif = compararEventos([st("a"), st("b")], [st("b"), st("a")]);
		expect(dif).toHaveLength(1);
		expect(dif[0]).toMatch(/^ordem mudou no evento 0/);
	});
});
