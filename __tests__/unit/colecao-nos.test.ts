import { describe, expect, it, vi } from "vitest";
import { ColecaoNos, envolverEmissor } from "../../src/services/core/colecao-nos";

describe("ColecaoNos (cache do dossiê)", () => {
	it("atualiza pelo id: a versão com score da IA substitui a anterior", () => {
		const c = new ColecaoNos();
		c.push({ id: "empresa-1", data: { score: undefined } });
		c.push({ id: "despesa-1" });
		c.push({ id: "empresa-1", data: { score: 87 } });
		expect(c).toHaveLength(2);
		expect(c[0]).toMatchObject({ id: "empresa-1", data: { score: 87 } });
	});

	it("ignora nós só de contexto da IA e valores inválidos", () => {
		const c = new ColecaoNos();
		c.push({ id: "ctx", _isContextOnly: true }, null, undefined, "x");
		expect(c).toHaveLength(0);
	});

	it("aceita nós sem id (sem deduplicar) e serializa como array", () => {
		const c = new ColecaoNos();
		c.push({ type: "A" }, { type: "B" });
		expect(JSON.parse(JSON.stringify({ nodes: c })).nodes).toEqual([{ type: "A" }, { type: "B" }]);
		expect(Array.isArray(c.filter(() => true))).toBe(true);
		expect(c.filter(() => true)).not.toBeInstanceOf(ColecaoNos);
	});

	it("todo NODE_NOVO enviado à tela entra no cache; STATUS não", () => {
		const c = new ColecaoNos();
		const tela = vi.fn();
		const emitir = envolverEmissor(tela, c);
		emitir("STATUS", { msg: "x" });
		emitir("NODE_NOVO", { id: "sancao-ceis-1", type: "PROCESSO_JUDICIAL" });
		expect(tela).toHaveBeenCalledTimes(2);
		expect(c.map((n) => n.id)).toEqual(["sancao-ceis-1"]);
	});

	it("push explícito depois do envio não duplica", () => {
		const c = new ColecaoNos();
		const emitir = envolverEmissor(() => {}, c);
		const no = { id: "pessoa-1" };
		emitir("NODE_NOVO", no);
		c.push(no);
		expect(c).toHaveLength(1);
	});
});
