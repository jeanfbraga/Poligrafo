import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));

import { buscarBensHistoricoTSE, buscarBensPorSqTSE, resolverPatrimonioTSE } from "../../src/services/integrations/tse/bens";

const CPF = "52998224725";
const linha = (ano: number, total: number) => ({ sq_candidato: "250002351684", ano_eleicao: ano, cpf: CPF, nome: "FULANA DE TAL", valor_total: String(total), bens: [{ t: "Casa", d: "CASA", v: total }] });

function cliente(data: unknown[] | null, error: { message: string } | null = null) {
	const filtros: [string, string][] = [];
	return {
		filtros,
		c: {
			from: (tabela: string) => {
				filtros.push(["tabela", tabela]);
				return {
					select: () => ({
						eq: (coluna: string, valor: string) => {
							filtros.push([coluna, valor]);
							return { order: async () => ({ data, error }) };
						},
					}),
				};
			},
		} as never,
	};
}

describe("bens declarados pela base tse_bens (Banco de Perfil)", () => {
	it("pelo CPF: lê tse_bens e devolve no formato do dossiê ({ tipoBem, descricao, valor })", async () => {
		const { c, filtros } = cliente([linha(2026, 1500), linha(2022, 1000)]);
		const r = await buscarBensHistoricoTSE("529.982.247-25", c);
		expect(filtros).toEqual([["tabela", "tse_bens"], ["cpf", CPF]]);
		expect(r[0]).toEqual({ sq_candidato: "250002351684", cpf_candidato: CPF, nome_candidato: "FULANA DE TAL", ano_eleicao: 2026, valor_total: 1500, descricao_bens: [{ tipoBem: "Casa", descricao: "CASA", valor: 1500 }] });
	});

	it("CPF inválido não consulta; sem CPF público, vale o número do candidato", async () => {
		const { c, filtros } = cliente([linha(2024, 30000)]);
		expect(await buscarBensHistoricoTSE("-4", c)).toEqual([]);
		expect(filtros).toEqual([]);
		expect((await buscarBensPorSqTSE("250002351684", c))[0].valor_total).toBe(30000);
		expect(filtros).toEqual([["tabela", "tse_bens"], ["sq_candidato", "250002351684"]]);
		expect(await buscarBensPorSqTSE(null, c)).toEqual([]);
	});

	it("base fora do ar: lista vazia e aviso no console", async () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await buscarBensHistoricoTSE(CPF, cliente(null, { message: "timeout" }).c)).toEqual([]);
		expect(aviso).toHaveBeenCalledWith("[TSE] Erro ao buscar bens declarados na base:", "timeout");
		aviso.mockRestore();
	});

	it("ficha: patrimônio do resultado do TSE quando há; o status conta de onde veio quando é da base", async () => {
		const ficha: any = { alertasPessoais: [] };
		await resolverPatrimonioTSE(ficha, { patrimonioTotal: 2000, anoEleicao: 2026, bensDeclarados: [] }, CPF, null);
		expect(ficha).toMatchObject({ patrimonioTotal: 2000, anoPatrimonio: 2026 });
		expect(ficha.alertasPessoais).toEqual(["[TSE] Patrimônio Declarado (2026): R$ 2.000,00"]);
	});
});
