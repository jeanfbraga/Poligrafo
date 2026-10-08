import { beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarEstadoFonteHttp } from "../../src/lib/fonte-http";
import {
	coletarContratosDaCasa,
	coletarContratosDoEnte,
	coletarContratosDoMandato,
	contratoParaDespesa,
	emitirColetaDoEnte,
	emitirColetaDoMandato,
	emitirContratosDoEnte,
	localizarEnte,
} from "../../src/services/core/contratos-do-ente";
import { cruzarDadosDaInvestigacao } from "../../src/services/cruzamentos";
import { buscarCasaLegislativa, consultaDaCasa, escolherCasa } from "../../src/services/integrations/pncp/casa-legislativa";
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

	it("falha não vira 'sem contratos': 1ª página com erro = exceção; só a 2ª = segue e avisa no log", async () => {
		const fora = vi.fn(async () => new Response("erro", { status: 404 }));
		await expect(buscarContratosDoOrgao("03533064000146", { fetchFn: fora as never })).rejects.toThrow("PNCP não respondeu (contratos do órgão 03533064000146): HTTP 404");
		reiniciarEstadoFonteHttp();
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const meia = vi.fn(async (url: string) => (new URL(url).searchParams.get("pagina") === "1"
			? new Response(JSON.stringify({ data: [contratoPncp(1, 100)] }), { status: 200 })
			: new Response("erro", { status: 404 })));
		expect(await buscarContratosDoOrgao("03533064000146", { fetchFn: meia as never })).toHaveLength(1);
		expect(aviso).toHaveBeenCalledWith("[PNCP] 1 página(s) dos contratos do órgão 03533064000146 falharam; seguindo com as que vieram.");
		aviso.mockClear();
		reiniciarEstadoFonteHttp();
		// Órgão com uma página só: o PNCP responde 400 "Página 2 inexistente" — fim, não falha.
		const umaPagina = vi.fn(async (url: string) => (new URL(url).searchParams.get("pagina") === "1"
			? new Response(JSON.stringify({ data: [contratoPncp(1, 100)], totalPaginas: 1 }), { status: 200 })
			: new Response(JSON.stringify({ message: "Página 2 inexistente." }), { status: 400 })));
		expect(await buscarContratosDoOrgao("03533064000146", { fetchFn: umaPagina as never })).toHaveLength(1);
		expect(aviso).not.toHaveBeenCalled();
		aviso.mockRestore();
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
			"[PNCP] Prefeitura (Cuiabá): 25 contrato(s) nos últimos 12 meses (R$ 325.000). Os 20 maiores aparecem no dossiê; todos entram nos cruzamentos.",
		]);
	});

	it("coleta em paralelo sem emitir nada; a emissão vem depois (nó do contrato nunca antes do nó da pessoa)", async () => {
		const eventos: string[] = [];
		const coleta = coletarContratosDoEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403" }, deps([deConsulta(contratoPncp(1, 10))]));
		const r = await coleta;
		expect(eventos).toEqual([]);
		expect(r).toMatchObject({ situacao: "OK", ente: { ente: "Cuiabá" } });
		expect(await coletarContratosDoEnte({ esfera: "FEDERAL", uf: "MT" }, deps())).toEqual({ situacao: "NAO_SE_APLICA" });
		const quebrado = { ...deps(), porIbge: vi.fn(async () => Promise.reject(new Error("rede"))) };
		expect(await coletarContratosDoEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "1" }, quebrado)).toMatchObject({ situacao: "FALHA" });
		const etapas: unknown[] = [];
		expect(emitirColetaDoEnte(r, "p", (t, p) => {
			eventos.push(t);
			if (t === "ETAPA") etapas.push(p);
		})).toHaveLength(1);
		expect(eventos).toEqual(["ETAPA", "STATUS", "NODE_NOVO"]);
		// A lista de fontes da tela recebe o resultado em linguagem simples.
		expect(etapas).toEqual([{ fonte: "pncp", estado: "concluida", origem: "PNCP (portal federal de contratos)", detalhe: "1 contrato: Prefeitura (Cuiabá)" }]);
	});

	it("sem contratos, órgão não localizado e falha: cada caso com sua mensagem no log", async () => {
		const msgs: string[] = [];
		const status = (_t: string, p: any) => msgs.push(p.msg);
		expect(await emitirContratosDoEnte({ esfera: "MUNICIPAL", uf: "GO", codIbge: "5208707" }, "p", status, deps([]))).toEqual([]);
		expect(msgs.at(-1)).toBe("[PNCP] Prefeitura (Cuiabá): nenhum contrato publicado no PNCP nos últimos 12 meses (o órgão pode publicar em portal próprio).");
		const semEnte = { ...deps(), porIbge: vi.fn(async () => null) };
		await emitirContratosDoEnte({ esfera: "MUNICIPAL", uf: "GO", codIbge: "1" }, "p", status, semEnte);
		expect(msgs.at(-1)).toBe("[PNCP] Órgão do mandato não localizado no SICONFI; contratos do órgão não consultados.");
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const quebrado = { ...deps(), contratos: vi.fn(async () => Promise.reject(new Error("timeout"))) };
		expect(await emitirContratosDoEnte({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403" }, "p", status, quebrado)).toEqual([]);
		expect(aviso).toHaveBeenCalledWith("[PNCP] Falha nos contratos do órgão:", expect.objectContaining({ message: "timeout" }));
		expect(msgs.at(-1)).toBe("[PNCP] Prefeitura (Cuiabá): o PNCP não respondeu; contratos não consultados (não quer dizer que não existam).");
		aviso.mockRestore();
		const n = msgs.length;
		expect(await emitirContratosDoEnte({ esfera: "FEDERAL", uf: "MT" }, "p", status, deps())).toEqual([]);
		expect(msgs).toHaveLength(n);
	});

	it("prefeito: só a prefeitura; a casa legislativa não se aplica e nem é procurada", async () => {
		const d = { ...deps(), casa: vi.fn(async () => null) };
		const r = await coletarContratosDoMandato({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403", cargoTse: "11" }, d);
		expect(r.casa).toEqual({ situacao: "NAO_SE_APLICA" });
		expect(d.casa).not.toHaveBeenCalled();
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

describe("casa legislativa do mandato (câmara, assembleia, CLDF) pela busca do PNCP", () => {
	beforeEach(() => reiniciarEstadoFonteHttp());

	const RIO = "3304557";
	const item = (cnpj: string, nome: string, extra: Record<string, unknown> = {}) => ({ orgao_cnpj: cnpj, orgao_nome: nome, municipio_nome: "Rio de Janeiro", codigo_ibge: RIO, uf: "RJ", ...extra });

	it("fica com a câmara, não com o tribunal de contas do município; confere o município e o CNPJ", () => {
		const consulta = consultaDaCasa({ esfera: "MUNICIPAL", codIbge: RIO });
		const itens = [
			item("27532498000190", "TRIBUNAL DE CONTAS DO MUNICIPIO DO RIO DE JANEIRO"),
			item("27532498000190", "TRIBUNAL DE CONTAS DO MUNICIPIO DO RIO DE JANEIRO"),
			item("30467039000184", "CAMARA MUNICIPAL DO RIO DE JANEIRO"),
			item("08903189000134", "RECIFE CAMARA MUNICIPAL", { codigo_ibge: "2611606" }),
			item("12345678000100", "CAMARA COM CNPJ INVALIDO"),
		];
		expect(escolherCasa(itens, consulta)).toEqual({ cnpj: "30467039000184", nome: "CAMARA MUNICIPAL DO RIO DE JANEIRO", rotulo: "Câmara Municipal (Rio de Janeiro)" });
		expect(consulta.parametros).toBe(`q=camara&municipios=${RIO}&poderes=L&esferas=M`);
	});

	it("estadual: a assembleia (não o TCE nem a escola de contas); DF: a Câmara Legislativa", () => {
		const pe = [
			{ orgao_cnpj: "11435633000149", orgao_nome: "TRIBUNAL DE CONTAS DO ESTADO DE PERNAMBUCO", uf: "PE" },
			{ orgao_cnpj: "02770511000118", orgao_nome: "ESCOLA DE CONTAS PUBLICAS PROFESSOR BARRETO GUIMARAES", uf: "PE" },
			{ orgao_cnpj: "11426103000134", orgao_nome: "ASSEMBLEIA LEGISLATIVA DO ESTADO DE PERNAMBUCO", uf: "PE" },
		];
		expect(escolherCasa(pe, consultaDaCasa({ esfera: "ESTADUAL", uf: "pe" }))).toMatchObject({ cnpj: "11426103000134", rotulo: "Assembleia Legislativa de PE" });
		const df = [
			{ orgao_cnpj: "00534560000126", orgao_nome: "TRIBUNAL DE CONTAS DO DISTRITO FEDERAL", uf: "DF" },
			{ orgao_cnpj: "26963645000113", orgao_nome: "CAMARA LEGISLATIVA DO DISTRITO FEDERAL", uf: "DF" },
		];
		const consultaDf = consultaDaCasa({ esfera: "ESTADUAL", uf: "DF" });
		expect(escolherCasa(df, consultaDf)).toMatchObject({ cnpj: "26963645000113", rotulo: "Câmara Legislativa do DF" });
		expect(consultaDf.parametros).toBe("q=camara%20legislativa&ufs=DF&poderes=L&esferas=D");
	});

	it("chama a busca do portal com os filtros; erro da busca vira exceção com o motivo", async () => {
		const fetchFn = vi.fn(async () => new Response(JSON.stringify({ items: [item("30467039000184", "CAMARA MUNICIPAL DO RIO DE JANEIRO")] }), { status: 200 }));
		expect(await buscarCasaLegislativa({ esfera: "MUNICIPAL", codIbge: RIO }, fetchFn as never)).toMatchObject({ cnpj: "30467039000184" });
		const url = new URL(String(fetchFn.mock.calls[0][0]));
		expect(url.pathname).toBe("/api/search/");
		expect(url.searchParams.get("tipos_documento")).toBe("contrato");
		expect(url.searchParams.get("poderes")).toBe("L");
		const falha = vi.fn(async () => new Response("não", { status: 404 }));
		await expect(buscarCasaLegislativa({ esfera: "ESTADUAL", uf: "PE" }, falha as never)).rejects.toThrow("busca do PNCP: HTTP 404");
	});

	const CAMARA_CUIABA = { cnpj: "33710823000160", nome: "CUIABA CAMARA MUNICIPAL", rotulo: "Câmara Municipal (Cuiabá)" };
	const depsCasa = (contratos: ReturnType<typeof deConsulta>[] = []) => ({
		porIbge: vi.fn(async () => CUIABA),
		porNome: vi.fn(async () => CUIABA),
		estadual: vi.fn(async () => ({ ...CUIABA, ente: "Mato Grosso", esfera: "E" })),
		contratos: vi.fn(async () => contratos),
		casa: vi.fn(async () => CAMARA_CUIABA),
	});

	it("vereador: pelo código do IBGE (ou pelo SICONFI, sem ele); deputado estadual: pela UF", async () => {
		const d = depsCasa([deConsulta(contratoPncp(1, 1000))]);
		const r = await coletarContratosDaCasa({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403", cargoTse: "13" }, d);
		expect(d.casa).toHaveBeenCalledWith({ esfera: "MUNICIPAL", codIbge: "5103403" });
		expect(d.contratos).toHaveBeenCalledWith("33710823000160");
		expect(r).toMatchObject({ situacao: "OK", despesas: [{ fonte: "PNCP — Câmara Municipal (Cuiabá)", natureza: "ENTE" }] });
		await coletarContratosDaCasa({ esfera: "MUNICIPAL", uf: "MT", municipio: "cuiaba", cargoTse: "13" }, d);
		expect(d.casa).toHaveBeenLastCalledWith({ esfera: "MUNICIPAL", codIbge: "5103403" });
		await coletarContratosDaCasa({ esfera: "ESTADUAL", uf: "MT", cargoTse: "7" }, d);
		expect(d.casa).toHaveBeenLastCalledWith({ esfera: "ESTADUAL", uf: "MT" });
		expect(await coletarContratosDaCasa({ esfera: "ESTADUAL", uf: "MT", cargoTse: "3" }, d)).toEqual({ situacao: "NAO_SE_APLICA" });
	});

	it("vereador: emite a prefeitura e a câmara, cada uma com sua linha no log e seus nós; tudo vai para o motor", async () => {
		const d = depsCasa([deConsulta(contratoPncp(1, 1000)), deConsulta(contratoPncp(2, 2000))]);
		const eventos: { tipo: string; payload: any }[] = [];
		const coleta = await coletarContratosDoMandato({ esfera: "MUNICIPAL", uf: "MT", codIbge: "5103403", cargoTse: "13" }, d);
		const todos = emitirColetaDoMandato(coleta, "p", (tipo, payload) => eventos.push({ tipo, payload }));
		expect(todos).toHaveLength(4);
		expect(eventos.filter((e) => e.tipo === "STATUS").map((e) => e.payload.msg)).toEqual([
			"[PNCP] Prefeitura (Cuiabá): 2 contrato(s) nos últimos 12 meses (R$ 3.000). Todos aparecem no dossiê e entram nos cruzamentos.",
			"[PNCP] Câmara Municipal (Cuiabá): 2 contrato(s) nos últimos 12 meses (R$ 3.000). Todos aparecem no dossiê e entram nos cruzamentos.",
		]);
		const ids = eventos.filter((e) => e.tipo === "NODE_NOVO").map((e) => e.payload.id);
		expect(ids).toEqual([`contrato-pncp-${FORN}-0`, `contrato-pncp-${FORN}-1`, `contrato-casa-${FORN}-0`, `contrato-casa-${FORN}-1`]);
	});

	it("casa não encontrada, sem contratos e falha: cada caso com sua mensagem no log", async () => {
		const msgs: string[] = [];
		const status = (_t: string, p: any) => msgs.push(p.msg);
		const alvo = { esfera: "ESTADUAL", uf: "DF", cargoTse: "8" };
		emitirColetaDoMandato(await coletarContratosDoMandato(alvo, { ...depsCasa(), casa: vi.fn(async () => null) }), "p", status);
		expect(msgs.at(-1)).toBe("[PNCP] Câmara Legislativa não encontrada na busca do PNCP; contratos da casa não consultados.");
		emitirColetaDoMandato(await coletarContratosDoMandato({ ...alvo, uf: "PE", cargoTse: "7" }, { ...depsCasa(), casa: vi.fn(async () => ({ ...CAMARA_CUIABA, rotulo: "Assembleia Legislativa de PE" })) }), "p", status);
		expect(msgs.at(-1)).toBe("[PNCP] Assembleia Legislativa de PE: nenhum contrato publicado no PNCP nos últimos 12 meses (o órgão pode publicar em portal próprio).");
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		const quebrada = { ...depsCasa(), casa: vi.fn(async () => Promise.reject(new Error("busca do PNCP: HTTP 503"))) };
		emitirColetaDoMandato(await coletarContratosDoMandato({ ...alvo, uf: "MT", cargoTse: "7" }, quebrada), "p", status);
		expect(aviso).toHaveBeenCalledWith("[PNCP] Falha nos contratos da casa legislativa:", expect.objectContaining({ message: "busca do PNCP: HTTP 503" }));
		expect(msgs.at(-1)).toBe("[PNCP] Assembleia Legislativa: o PNCP não respondeu; contratos não consultados (não quer dizer que não existam).");
		const contratosFora = { ...depsCasa(), contratosDaCasa: vi.fn(async () => Promise.reject(new Error("PNCP não respondeu"))) };
		emitirColetaDoMandato(await coletarContratosDoMandato({ ...alvo, uf: "MT", cargoTse: "7" }, contratosFora), "p", status);
		expect(contratosFora.contratosDaCasa).toHaveBeenCalledWith("33710823000160");
		expect(msgs.at(-1)).toBe("[PNCP] Câmara Municipal (Cuiabá): o PNCP não respondeu; contratos não consultados (não quer dizer que não existam).");
		aviso.mockRestore();
	});
});
