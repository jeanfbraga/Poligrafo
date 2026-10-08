import { beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({ buscarDespesasAlespDaBase: vi.fn() }));
vi.mock("@/services/integrations/alesp/despesas-base", () => base);

import { buscarDespesasDeputadoEstadualSP } from "../../src/app/api/investigar/estados/sp/alesp";

describe("deputado estadual de SP no pipe: base da ALESP antes do XML ao vivo", () => {
	beforeEach(() => {
		base.buscarDespesasAlespDaBase.mockReset();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("com a base: nem baixa o XML, limita a 60 e registra no log de onde veio", async () => {
		const despesas = Array.from({ length: 70 }, (_v, i) => ({ cnpjCpfFornecedor: "1", valorDocumento: 70 - i }));
		base.buscarDespesasAlespDaBase.mockResolvedValue({ despesas, deputado: { matricula: "300257", deputado: "ANDRÉ DO PRADO", ultimo_ano: 2026 } });
		const eventos: { tipo: string; payload: any }[] = [];
		const r = await buscarDespesasDeputadoEstadualSP("x", "ANDRE LUIS DO PRADO", (tipo: string, payload: any) => eventos.push({ tipo, payload }));
		expect(r).toHaveLength(60);
		expect(fetch).not.toHaveBeenCalled();
		expect(eventos).toEqual([{ tipo: "STATUS", payload: { msg: expect.stringMatching(/^\[ALESP\] 70 despesa\(s\) de gabinete de ANDRÉ DO PRADO \(matrícula 300257\) desde \d{4}, pela base de dados abertos da ALESP\.$/) } }]);
	});

	it("nome ausente ou ambíguo na lista da ALESP: aviso na tela e nenhuma despesa de outro deputado", async () => {
		base.buscarDespesasAlespDaBase.mockResolvedValue({ despesas: [], deputado: null });
		const eventos: { tipo: string; payload: any }[] = [];
		expect(await buscarDespesasDeputadoEstadualSP("x", "MARIA SILVA", (tipo: string, payload: any) => eventos.push({ tipo, payload }))).toEqual([]);
		expect(eventos[0]).toEqual({ tipo: "API_WARNING", payload: { fonte: "Assembleia Legislativa de SP (ALESP)", mensagem: '"MARIA SILVA" não foi identificado(a) com segurança na lista de deputados da ALESP (nome ausente ou ambíguo).' } });
		expect(fetch).not.toHaveBeenCalled();
	});
});
