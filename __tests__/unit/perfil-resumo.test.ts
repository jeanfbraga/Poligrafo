import { describe, expect, it } from "vitest";
import { acaoDoJob, type JobView } from "@/lib/investigacao/job-view";
import { resumoDoPerfil } from "@/lib/perfil-resumo";
import { secaoAtiva } from "@/lib/secao-ativa";

const HOJE = new Date(2026, 9, 2);

describe("resumoDoPerfil", () => {
	const data = {
		tse: { patrimonioTotal: 3898456.67, anoEleicao: 2026, variacaoPatrimonioPercentual: 240.5 },
		cota: [
			{ ano_referencia: 2026, mes_referencia: 1, valor_gasto: 8000, valor_teto: 40000 },
			{ ano_referencia: 2026, mes_referencia: 2, valor_gasto: 12000, valor_teto: 40000 },
		],
		producao: [{}, {}, {}],
		votos: [{}, {}],
		servidores: [
			{ nome: "A", cargo: "SP", periodo: "Desde 01/01/2026" },
			{ nome: "B", cargo: "SP", periodo: "De 01/01/2025 a 01/02/2026" },
			{ nome: "B", cargo: "SP", periodo: "Desde 02/02/2026" },
			{ nome: "C", cargo: "SP", periodo: "De 01/01/2024 a 31/12/2025" },
		],
	};

	it("devolve 5 itens, cada um apontando para uma seção do Perfil", () => {
		const r = resumoDoPerfil(data, HOJE);
		expect(r.map((i) => i.secao)).toEqual(["patrimonio", "cota", "producao", "votos", "gabinete"]);
	});

	it("patrimônio com ano e variação; cota com meses e % do teto", () => {
		const [pat, cota] = resumoDoPerfil(data, HOJE);
		expect(pat.valor).toMatch(/R\$/);
		expect(pat.sub).toContain("TSE 2026");
		expect(pat.sub).toContain("+241%");
		expect(pat.sub).toContain("vs declaração anterior");
		expect(resumoDoPerfil({ tse: { patrimonioTotal: 1, anoEleicao: 2026, variacaoPatrimonioPercentual: 10487.6, anoPatrimonioAnterior: 2022 } }, HOJE)[0].sub).toBe("TSE 2026 · +10.488% vs 2022");
		expect(cota.label).toBe("Cota 2026");
		expect(cota.sub).toBe("2 meses · 25% do teto");
	});

	it("contagens e gabinete (ativos por pessoa, não por período)", () => {
		const r = resumoDoPerfil(data, HOJE);
		expect(r[2].valor).toBe("3");
		expect(r[3].valor).toBe("2");
		expect(r[4].valor).toBe("2 ativos");
		expect(r[4].sub).toBe("3 servidores no total");
	});

	it("ao bater no teto do ETL diz 'mais recentes' em vez de parecer o total da carreira", () => {
		const r = resumoDoPerfil({ votos: Array.from({ length: 1000 }, () => ({})), producao: Array.from({ length: 50 }, () => ({})) }, HOJE);
		expect(r[2].valor).toBe("50");
		expect(r[2].sub).toBe("mais recentes (proposições)");
		expect(r[3].valor).toBe("1.000");
		expect(r[3].sub).toBe("mais recentes (votos)");
	});

	it("sem dados mostra traço, sem quebrar", () => {
		const r = resumoDoPerfil({}, HOJE);
		expect(r.every((i) => i.valor === "—")).toBe(true);
		expect(resumoDoPerfil(null, HOJE)).toHaveLength(5);
	});
});

describe("secaoAtiva", () => {
	const secoes = [
		{ id: "invest", topo: 0 },
		{ id: "perfil", topo: 300 },
		{ id: "cota", topo: 900 },
	];

	it("a última seção cujo topo passou da linha de leitura", () => {
		expect(secaoAtiva(secoes, 100)).toBe("invest");
		expect(secaoAtiva(secoes, 300)).toBe("perfil");
		expect(secaoAtiva(secoes, 5000)).toBe("cota");
	});

	it("antes de qualquer seção vale a primeira; no fim da página, a última; sem seções, nada", () => {
		expect(secaoAtiva(secoes.map((s) => ({ ...s, topo: s.topo + 500 })), 0)).toBe("invest");
		expect(secaoAtiva(secoes, 10, true)).toBe("cota");
		expect(secaoAtiva([], 10)).toBeNull();
	});
});

describe("acaoDoJob — botão principal do Perfil", () => {
	const v = (estado: JobView["estado"], extra: Partial<JobView> = {}): JobView =>
		({ estado, pct: 40, relogio: "01:20", concluidas: 4, total: 10, aplicaveis: 9, nos: 12, criticos: 2, atencao: 3, log: "", erro: "", etapas: [], outraEmAndamento: false, temNos: true, ...extra }) as JobView;

	it("ocioso inicia; em andamento abre o dossiê ao vivo, mostrando o progresso", () => {
		expect(acaoDoJob(v("idle"))).toMatchObject({ tipo: "iniciar", progresso: null });
		const run = acaoDoJob(v("running"));
		expect(run).toMatchObject({ tipo: "abrir", progresso: 40 });
		expect(run.rotulo).toBe("Acompanhar ao vivo · 40%");
		expect(run.dica).toContain("4/9");
	});

	it("concluído abre o dossiê com o resumo; interrompido/falha levam ao painel", () => {
		const done = acaoDoJob(v("done"));
		expect(done).toMatchObject({ tipo: "abrir", progresso: 100 });
		expect(done.dica).toBe("12 nós · ◆ 2 · ▲ 3");
		expect(acaoDoJob(v("partial")).tipo).toBe("rolar");
		expect(acaoDoJob(v("error")).tipo).toBe("rolar");
	});
});
