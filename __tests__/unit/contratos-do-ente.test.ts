import { beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarEstadoFonteHttp } from "../../src/lib/fonte-http";
import { contratoParaDespesa, emitirContratosDoEnte, localizarEnte } from "../../src/services/core/contratos-do-ente";
import { cruzarDadosDaInvestigacao } from "../../src/services/cruzamentos";
import { buscarContratosDoOrgao, deConsulta } from "../../src/services/integrations/pncp/contratos-orgao";

const CUIABA = { cod_ibge: 5103403, ente: "Cuiabá", uf: "MT", esfera: "M", populacao: 691875, cnpj: "03533064000146" };
const FORN = "11222333000181";

const contratoPncp = (seq: number, valor: number, extra: Record<string, unknown> = {}) => ({
	numeroControlePNCP: `03533064000146-2-${String(seq).padStart(6, "0")}/2025`,
	anoContrato: 2025,
	sequencialContrato: seq,
	orgaoEntidade: { cnpj: "03533064000146", razaoSocial: "MUNICIPIO DE CUIABA" },
	unidadeOrgao: { nomeUnidade: "SECRETARIA DE SAÚDE" },
	niFornecedor: FORN,
	nomeRazaoSocialFornecedor: "AGENCIA Y LTDA",
	objetoContrato: "Publicidade institucional",
	valorGlobal: valor,
	dataAssinatura: "2025-04-28",
	emendaParlamentar: false,
	...extra,
});

describe("PNCP — contratos de um órgão", () => {
	beforeEach(() => reiniciarEstadoFonteHttp());

	it("monta o link do contrato pelo ano e sequencial", () => {
		expect(deConsulta(contratoPncp(99, 10)).url).toBe("https://pncp.gov.br/app/contratos/03533064000146/2025/99");
	});

	it("2 páginas de 500 no máximo, só o próprio órgão, sem repetição, maior valor primeiro", async () => {
		const fetchFn = vi.fn(async (url: string) => {
			const pagina = Number(new URL(url).searchParams.get("pagina"));
			const data = pagina === 1
				? [contratoPncp(1, 100), contratoPncp(2, 900), { ...contratoPncp(3, 5000), orgaoEntidade: { cnpj: "99999999000199" } }]
				: [contratoPncp(2, 900), contratoPncp(4, 300)];
			return new Response(JSON.stringify({ data, totalPaginas: 7 }), { status: 200 });
		});
		const r = await buscarContratosDoOrgao("03.533.064/0001-46", { fetchFn: fetchFn as never, agora: () => new Date("2026-10-07T12:00:00Z") });
		expect(fetchFn).toHaveBeenCalledTimes(2);
		const url = new URL(String(fetchFn.mock.calls[0][0]));
		expect(url.searchParams.get("cnpjOrgao")).toBe("03533064000146");
		expect(url.searchParams.get("tamanhoPagina")).toBe("500");
		expect(url.searchParams.get("dataInicial")).toBe("20251007");
		expect(r.map((c) => c.valorGlobal)).toEqual([900, 300, 100]);
	});

	it("204 (sem conteúdo) é lista vazia", async () => {
		const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
		expect(await buscarContratosDoOrgao("01612092000123", { fetchFn: fetchFn as never })).toEqual([]);
	});
});

describe("contratos do órgão ligado ao mandato", () => {
	const deps = (contratos: ReturnType<typeof deConsulta>[] = []) => ({
		porIbge: vi.fn(async () => CUIABA),
		porNome: vi.fn(async () => CUIABA),
		estadual: vi.fn(async () => ({ ...CUIABA, ente: "Mato Grosso", esfera: "E" })),
		contratos: vi.fn(async () => contratos),
	});

	it("municipal pelo código do IBGE (ou nome); estadual pela UF; federal não consulta", async () => {
		const d = deps();
		await localizarEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403" }, d);
		expect(d.porIbge).toHaveBeenCalledWith("5103403");
		await localizarEnte({ esfera: "MUNICIPAL", uf: "MT", municipio: "cuiaba" }, d);
		expect(d.porNome).toHaveBeenCalledWith("MT", "cuiaba");
		await localizarEnte({ esfera: "ESTADUAL", uf: "MT" }, d);
		expect(d.estadual).toHaveBeenCalledWith("MT");
		expect(await localizarEnte({ esfera: "FEDERAL", uf: "MT" }, d)).toBeNull();
	});

	it("emite os maiores como nós de contexto e registra no log quantos contratos e o total", async () => {
		const contratos = Array.from({ length: 25 }, (_v, i) => deConsulta(contratoPncp(i + 1, (i + 1) * 1000)));
		const eventos: { tipo: string; payload: any }[] = [];
		const r = await emitirContratosDoEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403" }, "pessoa-1", (tipo, payload) => eventos.push({ tipo, payload }), deps(contratos));
		expect(r).toHaveLength(25);
		const nos = eventos.filter((e) => e.tipo === "NODE_NOVO");
		expect(nos).toHaveLength(20);
		expect(nos[0].payload).toMatchObject({ type: "CONTRATO", id: `contrato-pncp-${FORN}-0`, data: { natureza: "ENTE", valor: 25000, fonte: "PNCP — Cuiabá" } });
		expect(eventos.filter((e) => e.tipo === "STATUS").map((e) => e.payload.msg)).toEqual([
			"Buscando contratos de Prefeitura de Cuiabá no PNCP (últimos 12 meses)...",
			"[PNCP] 25 contrato(s) de Prefeitura de Cuiabá nos últimos 12 meses (R$ 325.000). Os 20 maiores aparecem no dossiê; todos entram nos cruzamentos.",
		]);
	});

	it("sem contratos, órgão não localizado e falha: cada caso com sua mensagem no log", async () => {
		const msgs: string[] = [];
		const status = (_t: string, p: any) => msgs.push(p.msg);
		expect(await emitirContratosDoEnte({ esfera: "MUNICIPAL", uf: "GO", codIbge: "5208707" }, "p", status, deps([]))).toEqual([]);
		expect(msgs.at(-1)).toBe("[PNCP] Prefeitura de Cuiabá sem contratos publicados no PNCP nos últimos 12 meses (o órgão pode publicar em portal próprio).");
		const semEnte = { ...deps(), porIbge: vi.fn(async () => null) };
		await emitirContratosDoEnte({ esfera: "MUNICIPAL", uf: "GO", codIbge: "1" }, "p", status, semEnte);
		expect(msgs.at(-1)).toBe("[PNCP] Órgão do mandato não localizado no SICONFI; contratos do órgão não consultados.");
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const quebrado = { ...deps(), contratos: vi.fn(async () => Promise.reject(new Error("timeout"))) };
		expect(await emitirContratosDoEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403" }, "p", status, quebrado)).toEqual([]);
		expect(aviso).toHaveBeenCalledWith("[PNCP] Falha nos contratos do órgão:", expect.objectContaining({ message: "timeout" }));
		aviso.mockRestore();
		const n = msgs.length;
		expect(await emitirContratosDoEnte({ esfera: "FEDERAL", uf: "MT" }, "p", status, deps())).toEqual([]);
		expect(msgs).toHaveLength(n);
	});

	it("fornecedor da campanha contratado pela prefeitura vira cruzamento ALTA (contrato da lista completa, sem fato repetido)", async () => {
		const contrato = contratoParaDespesa(deConsulta(contratoPncp(7, 50000)), CUIABA);
		const { fatos, achados } = await cruzarDadosDaInvestigacao({
			pessoaId: "p", casa: "PREFEITURA", doadores: [], empresasDoPolitico: [], despesasMandato: [],
			nos: [{ id: `contrato-pncp-${FORN}-0`, type: "CONTRATO", data: { natureza: "ENTE", documento: FORN, label: "AGENCIA Y LTDA", valor: 50000, dataDocumento: "2025-04-28", fonte: "PNCP — Cuiabá" } }],
			contratosDoEnte: [contrato],
			sqCandidato: "110002118922",
			buscarContas: async () => ({ doadores: [], fornecedores: [{ sq_candidato: "110002118922", ano_eleicao: 2024, tipo: "FORNECEDOR", documento: FORN, nome: "AGENCIA Y LTDA", valor_total: 80000, quantidade: 1, origem: "Publicidade" }] }),
			buscarSancoes: async () => [], buscarQsa: async () => null, buscarFuncoes: async () => [], explicar: async () => [],
		});
		expect(fatos.filter((f) => f.papel === "CONTRATADO_ENTE")).toHaveLength(1);
		expect(achados.map((a) => [a.regra, a.severidade])).toEqual([["fornecedor-campanha-ente", "ALTA"]]);
		expect(achados[0].resumo).toContain("PNCP — Cuiabá");
	});
});
