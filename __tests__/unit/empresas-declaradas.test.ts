import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-perfil", () => ({ supabasePerfilAdmin: {} }));

import {
	type DependenciasEmpresas,
	declaracoesDoPolitico,
	empresasDeclaradas,
	nomeDaEmpresa,
	nosDasEmpresasDeclaradas,
	razaoSocialConfere,
	resolverCnpjDaEmpresa,
} from "@/services/core/empresas-declaradas";
import { nomesDeReferencia } from "@/services/core/socio-confirmacao";
import type { EmpresaDoPolitico } from "@/services/integrations/receita/socios-politicos";

const CPF = "52998224725"; // fictício, miolo 982247
const REF = { nomes: nomesDeReferencia(["FLAVIO NANTES BOLSONARO", "Flávio Bolsonaro"]), cpf: CPF };
const BOLSOTINI = "21636316000144";

// Declarações reais vistas em 08/10/2026 (tse_bens_historico e eventos da matriz).
const BENS_2018 = [
	{ ordem: 3, valor: 50000, descricao: "50% participação da Empresa Bolsotini Chocolates e Café LTDA", descricaoDeTipoDeBem: "Quotas ou quinhões de capital" },
	{ ordem: 2, valor: 150000, descricao: "Sala Comercial na Barra da Tijuca ", descricaoDeTipoDeBem: "Sala ou conjunto" },
	{ ordem: 5, valor: 558220.06, descricao: "Diversas ", descricaoDeTipoDeBem: "Outras aplicações e Investimentos" },
];
const BENS_2026 = [
	{ valor: 46000, tipoBem: "Outras participações societárias", descricao: "QUOTA E QUINHÃO DE CAPITAL" },
	{ valor: 8266.1, tipoBem: "Aplicação de renda fixa (CDB, RDB e outros)", descricao: "APLICAÇÃO EM CDB - BANCO DO BRASIL" },
	{ valor: 10000, tipoBem: "Outras participações societárias", descricao: "QUOTA OU QUINHÃO DE CAPITAL - SOCIEDADE INDIVIDUAL DE ADVOCACIA" },
	{ valor: 1090520.47, tipoBem: "Outros fundos", descricao: "FUNDO DE INVESTIMENTO EM COTAS MULTIMERCADO FIFCIC RL" },
];
// Deputado federal (MG): a regra antiga criou 15 "empresas" com estes bens.
const BENS_GENERICOS = [
	{ valor: 5000, tipoBem: "Quotas ou quinhões de capital", descricao: "PARTICIPAÇÃO SOCIETÁRIA EM EMPRESA PRIVADA" },
	{ valor: 45000, tipoBem: "Quotas ou quinhões de capital", descricao: "QUOTAS DE SOCIEDADE EMPRESÁRIA" },
	{ valor: 25000, tipoBem: "Quotas ou quinhões de capital", descricao: "COTAS DE FUNDO DE INVESTIMENTO ¿ POSIÇÃO 1" },
	{ valor: 1000, tipoBem: "Outras aplicações e Investimentos", descricao: "APLICAÇÃO FINANCEIRA DE RENDA FIXA ¿ POSIÇÃO 2" },
	{ valor: 1000, tipoBem: "Outras aplicações e Investimentos", descricao: "TITULO DE CAPITALIZAÇÃO" },
	{ valor: 1000, tipoBem: "Aplicação de renda fixa (CDB, RDB e outros)", descricao: "Renda Fixa" },
	{ valor: 1000, tipoBem: "Ações (inclusive as provenientes de linha telefônica)", descricao: "AÇÕES DA PETROBRAS" },
];

function deps(parcial: Partial<DependenciasEmpresas> = {}): DependenciasEmpresas {
	return {
		empresasDaBase: vi.fn(async () => []),
		buscarCnpjs: vi.fn(async () => []),
		dadosCnpj: vi.fn(async () => ({ ok: false as const, motivo: "fora" })),
		...parcial,
	};
}

afterEach(() => vi.restoreAllMocks());

describe("quais bens declarados ao TSE são empresas", () => {
	it("a participação com nome vira empresa (com o ano da declaração)", () => {
		const r = empresasDeclaradas([{ ano: 2018, bens: BENS_2018 }]);
		expect(r).toEqual([expect.objectContaining({ ano: 2018, indice: 0, nome: "Bolsotini Chocolates e Café LTDA", valor: 50000, cnpjDeclarado: null })]);
	});

	it("aplicação, fundo, título de capitalização, ações e participação sem nome não viram empresa", () => {
		expect(empresasDeclaradas([{ ano: 2026, bens: BENS_2026 }, { ano: 2026, bens: BENS_GENERICOS }])).toEqual([]);
	});

	it("a empresa de 2018 aparece mesmo quando a declaração atual (2026) é genérica", () => {
		const declaracoes = declaracoesDoPolitico({
			bensDeclarados: BENS_2026,
			anoPatrimonio: 2026,
			historicoPatrimonio: [{ ano: 2026, bensDeclarados: BENS_2026 }, { ano: 2018, bensDeclarados: BENS_2018 }],
		});
		expect(empresasDeclaradas(declaracoes).map((e) => [e.ano, e.nome])).toEqual([[2018, "Bolsotini Chocolates e Café LTDA"]]);
	});

	it("nome limpo da descrição e CNPJ escrito na própria declaração", () => {
		expect(nomeDaEmpresa("QUOTAS DA EMPRESA ACME COMERCIO DE PECAS LTDA - CNPJ 11.222.333/0001-81")).toBe("ACME COMERCIO DE PECAS LTDA");
		const [e] = empresasDeclaradas([{ ano: 2022, bens: [{ tipoBem: "Quotas ou quinhões de capital", descricao: "QUOTAS DA EMPRESA ACME LTDA CNPJ 11.222.333/0001-81", valor: 1 }] }]);
		expect(e.cnpjDeclarado).toBe("11222333000181");
	});

	it("a mesma empresa em duas declarações entra uma vez (a mais recente)", () => {
		const bem = BENS_2018[0];
		expect(empresasDeclaradas([{ ano: 2014, bens: [bem] }, { ano: 2018, bens: [bem] }]).map((e) => e.ano)).toEqual([2018]);
	});
});

describe("razão social confere com o nome declarado", () => {
	it("todas as palavras próprias precisam estar na razão social ou no nome fantasia", () => {
		expect(razaoSocialConfere("Bolsotini Chocolates e Café LTDA", { razao_social: "BOLSOTINI CHOCOLATES E CAFE LTDA" })).toBe(true);
		expect(razaoSocialConfere("Bolsotini Chocolates e Café LTDA", { razao_social: "BOLSOTINI LTDA" })).toBe(false);
		expect(razaoSocialConfere("UNIMED SOROCABA", { razao_social: "X", nome_fantasia: "UNIMED DE SOROCABA" })).toBe(true);
		expect(razaoSocialConfere("LTDA", { razao_social: "QUALQUER LTDA" })).toBe(false);
	});
});

describe("CNPJ da empresa declarada", () => {
	const naBase: EmpresaDoPolitico = {
		cpf_politico: CPF, cnpj: BOLSOTINI, nome_politico: "FLAVIO NANTES BOLSONARO", razao_social: "BOLSOTINI CHOCOLATES E CAFE LTDA",
		natureza_juridica: "Sociedade Empresária Limitada", qualificacao_socio: "Sócio", data_entrada: "2015-01-07", referencia: "2026-09",
	};

	it("primeiro a base do QSA da Receita (funciona na Vercel): não vai à busca na web", async () => {
		const d = deps({ empresasDaBase: vi.fn(async () => [naBase]) });
		const r = await resolverCnpjDaEmpresa("Bolsotini Chocolates e Café LTDA", REF, d);
		expect(r).toMatchObject({ cnpj: BOLSOTINI, veredito: { confirmado: true, forca: "CPF_E_NOME" } });
		expect(r?.veredito.motivo).toContain("arquivo aberto de CNPJ de 2026-09");
		expect(d.buscarCnpjs).not.toHaveBeenCalled();
	});

	it("na base só por nome (sem CPF, drilldown pela tela): vínculo pelo nome civil", async () => {
		const r = await resolverCnpjDaEmpresa("Bolsotini Chocolates e Café LTDA", { ...REF, cpf: null }, deps({ empresasDaBase: vi.fn(async () => [naBase]) }));
		expect(r?.veredito.forca).toBe("NOME");
	});

	it("busca na web: o 1º CNPJ da página não é adotado; razão social errada e político fora do QSA são descartados no log", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const dados: Record<string, object> = {
			"11222333000181": { razao_social: "CHOCOLATES QUALQUER LTDA", qsa: [{ nome_socio: "FLAVIO NANTES BOLSONARO" }] },
			"11444777000161": { razao_social: "BOLSOTINI CHOCOLATES E CAFE LTDA", qsa: [{ nome_socio: "OUTRA PESSOA" }] },
			[BOLSOTINI]: { razao_social: "BOLSOTINI CHOCOLATES E CAFE LTDA", qsa: [{ nome_socio: "FLAVIO NANTES BOLSONARO", cnpj_cpf_do_socio: "***982247**" }] },
		};
		const d = deps({
			buscarCnpjs: vi.fn(async () => ["11.222.333/0001-81", "11.444.777/0001-61", "21.636.316/0001-44"]),
			dadosCnpj: vi.fn(async (c: string) => ({ ok: true as const, via: "BrasilAPI" as const, dados: dados[c] })),
		});
		const r = await resolverCnpjDaEmpresa("Bolsotini Chocolates e Café LTDA", REF, d);
		expect(r).toMatchObject({ cnpj: BOLSOTINI, veredito: { forca: "CPF_E_NOME" } });
		const linhas = log.mock.calls.map((c) => String(c[0]));
		expect(linhas).toContain('[EMPRESAS DECLARADAS] 11222333000181 descartado para "Bolsotini Chocolates e Café LTDA": razão social "CHOCOLATES QUALQUER LTDA" não confere.');
		expect(linhas.some((l) => l.startsWith("[EMPRESAS DECLARADAS] 11444777000161 descartado") && l.includes("nenhum sócio no QSA"))).toBe(true);
	});

	it("nada confere: sem CNPJ (nunca um CNPJ qualquer)", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		const d = deps({
			buscarCnpjs: vi.fn(async () => ["11222333000181"]),
			dadosCnpj: vi.fn(async () => ({ ok: true as const, via: "BrasilAPI" as const, dados: { razao_social: "OUTRA EMPRESA LTDA" } })),
		});
		expect(await resolverCnpjDaEmpresa("Bolsotini Chocolates e Café LTDA", REF, d)).toBeNull();
	});
});

describe("nós das empresas declaradas na investigação", () => {
	it("nó com CNPJ conferido, ano, origem e aviso na tela; nunca lança se as fontes caírem", async () => {
		const status: string[] = [];
		const d = deps({ empresasDaBase: vi.fn(async () => { throw new Error("base fora"); }), buscarCnpjs: vi.fn(async () => { throw new Error("web fora"); }) });
		const nos = await nosDasEmpresasDeclaradas({ declaracoes: [{ ano: 2018, bens: BENS_2018 }], pessoaId: "pessoa-1", referencia: REF, status: (m) => status.push(m) }, d);
		expect(nos).toEqual([
			expect.objectContaining({
				id: "empresa-tse-pessoa-1-2018-0",
				type: "EMPRESA",
				_origemId: "pessoa-1",
				data: expect.objectContaining({ label: "Bolsotini Chocolates e Café LTDA", cnpj: undefined, ano: 2018, origem: "Declaração de bens ao TSE em 2018" }),
			}),
		]);
		expect(String(nos[0].data.motivo_ia)).toContain("CNPJ não localizado com segurança");
		expect(status).toEqual(["[TSE] 1 empresa(s) declarada(s) pelo político; CNPJ conferido em 0."]);
	});

	it("sem participação com nome: nenhum nó e nenhum aviso", async () => {
		const status: string[] = [];
		const d = deps();
		expect(await nosDasEmpresasDeclaradas({ declaracoes: [{ ano: 2026, bens: BENS_GENERICOS }], pessoaId: "p", referencia: REF, status: (m) => status.push(m) }, d)).toEqual([]);
		expect(status).toEqual([]);
		expect(d.buscarCnpjs).not.toHaveBeenCalled();
	});
});
