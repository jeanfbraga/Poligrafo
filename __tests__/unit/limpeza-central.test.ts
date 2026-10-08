import { describe, expect, it } from "vitest";
import { type ClienteLimpeza, executarLimpeza, linhaDoLog, REGRAS, type RegraRetencao, resumoMarkdown } from "../../scripts/etl/limpeza-central";

const AGORA = new Date("2026-10-08T12:00:00Z");

/** Banco falso: registra cada consulta (tabela, operação, filtros) e devolve a contagem pedida. */
function bancoFalso(contagens: Record<string, number>, falhar: string[] = []) {
	const chamadas: string[] = [];
	const cliente: ClienteLimpeza = {
		from(tabela: string) {
			const consulta = (op: string) => {
				const filtros: string[] = [];
				const q: any = {
					lt: (c: string, v: unknown) => { filtros.push(`${c}<${v}`); return q; },
					eq: (c: string, v: unknown) => { filtros.push(`${c}=${v}`); return q; },
					then: (ok: (r: unknown) => unknown) => {
						chamadas.push(`${op} ${tabela} ${filtros.join(" ")}`);
						const r = falhar.includes(tabela) ? { count: null, error: { message: "permission denied" } } : { count: contagens[tabela] ?? 0, error: null };
						return Promise.resolve(r).then(ok);
					},
				};
				return q;
			};
			return { select: () => consulta("contar"), delete: () => consulta("apagar") };
		},
	};
	return { cliente, chamadas };
}

const PROPOSTA: RegraRetencao = { id: "teste-proposta", banco: "principal", tabela: "tabela_x", estado: "proposta", descricao: "x", filtro: (q) => q.eq("a", 1) };

describe("limpeza central dos bancos", () => {
	it("sem --aplicar só mede: nenhuma linha é apagada, nem pelas regras ativas", async () => {
		const principal = bancoFalso({ pesquisas: 3 });
		const perfil = bancoFalso({ pncp_contratos_cache: 2 });
		const r = await executarLimpeza({ principal: principal.cliente, perfil: perfil.cliente }, { agora: AGORA });
		expect([...principal.chamadas, ...perfil.chamadas].some((c) => c.startsWith("apagar"))).toBe(false);
		expect(linhaDoLog(r.find((l) => l.regra.id === "pesquisas-30d")!)).toBe("[LIMPEZA] pesquisas-30d (Principal · pesquisas, ativa): 3 linha(s) na regra → não aplicada (rode com --aplicar).");
	});

	it("com --aplicar apaga pelas regras ativas com linhas; propostas são só medidas", async () => {
		const principal = bancoFalso({ pesquisas: 3, ceap_despesas_cache: 0, tse_bens_historico: 2, tabela_x: 9 });
		const perfil = bancoFalso({ pncp_contratos_cache: 2 });
		const r = await executarLimpeza({ principal: principal.cliente, perfil: perfil.cliente }, { agora: AGORA, aplicar: true, regras: [...REGRAS, PROPOSTA] });
		expect(principal.chamadas.filter((c) => c.startsWith("apagar"))).toEqual([
			"apagar pesquisas atualizado_em<2026-09-08T12:00:00.000Z",
			"apagar tse_bens_historico ano_eleicao<2018",
		]);
		expect(perfil.chamadas.filter((c) => c.startsWith("apagar"))).toEqual(["apagar pncp_contratos_cache consultado_em<2026-09-08T12:00:00.000Z"]);
		// Janela de 4 anos da cota (decisão do dono): em 2026 só sai o que for anterior a 2023.
		expect(principal.chamadas).toContain("contar ceap_despesas_cache ano<2023");
		const proposta = r.find((l) => l.regra.id === "teste-proposta")!;
		expect(proposta).toMatchObject({ medidas: 9, removidas: null });
		expect(linhaDoLog(proposta)).toBe("[LIMPEZA] teste-proposta (Principal · tabela_x, proposta): 9 linha(s) na regra → proposta: só medida.");
	});

	it("uma regra com erro não para as outras; o erro aparece no log e no resumo", async () => {
		const principal = bancoFalso({ pesquisas: 1 }, ["tse_bens_historico"]);
		const perfil = bancoFalso({});
		const r = await executarLimpeza({ principal: principal.cliente, perfil: perfil.cliente }, { agora: AGORA, aplicar: true });
		expect(r.find((l) => l.regra.id === "bens-eleicoes-antigas")).toMatchObject({ medidas: null, erro: "permission denied" });
		expect(r.find((l) => l.regra.id === "pesquisas-30d")).toMatchObject({ removidas: 1 });
		const md = resumoMarkdown(r, true);
		expect(md).toContain("## Limpeza central dos bancos — aplicada (regras ativas)");
		expect(md).toContain("| bens-eleicoes-antigas | Principal · `tse_bens_historico` | ativa | ? | erro: permission denied |");
	});

	it("regras aprovadas pelo dono em 08/10/2026; a tabela antiga de doadores saiu", () => {
		expect(REGRAS.map((r) => `${r.id}:${r.estado}`)).toEqual(["pesquisas-30d:ativa", "pncp-30d:ativa", "ceap-janela-4-anos:ativa", "cota-agrupada-janela-4-anos:ativa", "bens-eleicoes-antigas:ativa"]);
		expect(REGRAS.some((r) => r.tabela === "tse_doadores_cache")).toBe(false);
	});
});
