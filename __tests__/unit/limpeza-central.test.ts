import { describe, expect, it } from "vitest";
import { type ClienteLimpeza, executarLimpeza, linhaDoLog, REGRAS, resumoMarkdown } from "../../scripts/etl/limpeza-central";

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

describe("limpeza central dos bancos", () => {
	it("sem --aplicar só mede: nenhuma linha é apagada, nem pelas regras ativas", async () => {
		const principal = bancoFalso({ pesquisas: 3, ceap_despesas_cache: 0 });
		const perfil = bancoFalso({ pncp_contratos_cache: 2 });
		const r = await executarLimpeza({ principal: principal.cliente, perfil: perfil.cliente }, { agora: AGORA });
		expect([...principal.chamadas, ...perfil.chamadas].some((c) => c.startsWith("apagar"))).toBe(false);
		expect(linhaDoLog(r.find((l) => l.regra.id === "pesquisas-30d")!)).toBe("[LIMPEZA] pesquisas-30d (Principal · pesquisas, ativa): 3 linha(s) na regra → não aplicada (rode com --aplicar).");
	});

	it("com --aplicar apaga só pelas regras ativas e com linhas; propostas são só medidas", async () => {
		const principal = bancoFalso({ pesquisas: 3, tse_doadores_cache: 0, ceap_despesas_cache: 9, tse_bens_historico: 5 });
		const perfil = bancoFalso({ pncp_contratos_cache: 2 });
		const r = await executarLimpeza({ principal: principal.cliente, perfil: perfil.cliente }, { agora: AGORA, aplicar: true });
		expect(principal.chamadas.filter((c) => c.startsWith("apagar"))).toEqual(["apagar pesquisas atualizado_em<2026-09-08T12:00:00.000Z"]);
		expect(perfil.chamadas.filter((c) => c.startsWith("apagar"))).toEqual(["apagar pncp_contratos_cache consultado_em<2026-09-08T12:00:00.000Z"]);
		const ceap = r.find((l) => l.regra.id === "ceap-janela-3-anos")!;
		expect(ceap).toMatchObject({ medidas: 9, removidas: null });
		expect(linhaDoLog(ceap)).toBe("[LIMPEZA] ceap-janela-3-anos (Principal · ceap_despesas_cache, proposta): 9 linha(s) na regra → proposta: só medida.");
		expect(principal.chamadas).toContain("contar ceap_despesas_cache ano<2024");
		expect(principal.chamadas).toContain("contar tse_bens_historico ano_eleicao<2018");
	});

	it("uma regra com erro não para as outras; o erro aparece no log e no resumo", async () => {
		const principal = bancoFalso({ pesquisas: 1 }, ["tse_doadores_cache"]);
		const perfil = bancoFalso({});
		const r = await executarLimpeza({ principal: principal.cliente, perfil: perfil.cliente }, { agora: AGORA, aplicar: true });
		const doadores = r.find((l) => l.regra.id === "doadores-vazios")!;
		expect(doadores).toMatchObject({ medidas: null, erro: "permission denied" });
		expect(r.find((l) => l.regra.id === "pesquisas-30d")).toMatchObject({ removidas: 1 });
		const md = resumoMarkdown(r, true);
		expect(md).toContain("## Limpeza central dos bancos — aplicada (regras ativas)");
		expect(md).toContain("| doadores-vazios | Principal · `tse_doadores_cache` | ativa | ? | erro: permission denied |");
	});

	it("as regras ativas são as que já valiam (pesquisas 30 dias, doadores vazios) e a cópia do PNCP; o resto é proposta", () => {
		expect(REGRAS.filter((r) => r.estado === "ativa").map((r) => r.id)).toEqual(["pesquisas-30d", "doadores-vazios", "pncp-30d"]);
		expect(REGRAS.filter((r) => r.estado === "proposta").map((r) => r.id)).toEqual(["ceap-janela-3-anos", "doadores-por-nome-180d", "bens-eleicoes-antigas"]);
	});
});
