import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarJson, reiniciarEstadoFonteHttp } from "@/lib/fonte-http";
import { observarFontes, type SinalFonte } from "@/lib/fonte-http/observador";
import { aplicarEventos, iniciarDossie } from "@/lib/investigacao/dossie-state";
import {
	calcularProgresso,
	ETAPAS_INICIAIS,
	marcarConcluida,
	notaDaFonte,
	problemasDeConexao,
	registrarEtapa,
	statusDaFonte,
} from "@/lib/investigacao/etapas";
import { jobView, textoDoLog } from "@/lib/investigacao/job-view";
import { motivoAcessivel, origemDoEndereco, type EventoEtapa } from "@/lib/investigacao/origens";
import { STORE_INICIAL } from "@/lib/investigacao/store";
import { ENDERECO_IA, gerar } from "@/services/ai/gateway";
import { criarOuvinteDeEtapas } from "@/services/core/etapas-ao-vivo";

const PNCP = "https://pncp.gov.br/api/consulta/v1/contratos?cnpjOrgao=1";
const resposta = (status: number) => new Response(status === 200 ? "{}" : "erro", { status });

describe("observador de fontes (fonte-http → sinais da investigação em curso)", () => {
	beforeEach(() => reiniciarEstadoFonteHttp());

	async function sinaisDe(fetchFn: (...a: any[]) => Promise<Response>, tentativas = 2): Promise<SinalFonte[]> {
		const sinais: SinalFonte[] = [];
		await observarFontes((s) => sinais.push(s), () => buscarJson(PNCP, { fetchFn: fetchFn as never, tentativas, dormir: async () => {} }));
		return sinais;
	}

	it("respondeu; 404 também é resposta (não é problema de conexão)", async () => {
		expect(await sinaisDe(async () => resposta(200))).toEqual([{ tipo: "respondeu", url: PNCP, fonte: undefined }]);
		reiniciarEstadoFonteHttp();
		expect((await sinaisDe(async () => resposta(404))).map((s) => s.tipo)).toEqual(["respondeu"]);
	});

	it("erro passageiro: avisa 'lenta' na nova tentativa e 'falhou' quando esgota", async () => {
		const sinais = await sinaisDe(async () => resposta(503));
		expect(sinais).toEqual([
			{ tipo: "lenta", url: PNCP, fonte: undefined, motivo: "HTTP_5XX", status: 503 },
			{ tipo: "falhou", url: PNCP, fonte: undefined, erro: "HTTP_5XX", status: 503 },
		]);
	});

	it("timeout, limite de consultas (429) e acesso recusado (403) também são falha", async () => {
		const timeout = await sinaisDe(async () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })), 1);
		expect(timeout).toEqual([{ tipo: "falhou", url: PNCP, fonte: undefined, erro: "TIMEOUT" }]);
		reiniciarEstadoFonteHttp();
		expect((await sinaisDe(async () => resposta(429), 1)).at(-1)).toMatchObject({ tipo: "falhou", status: 429 });
		reiniciarEstadoFonteHttp();
		expect((await sinaisDe(async () => resposta(403), 1)).at(-1)).toMatchObject({ tipo: "falhou", status: 403 });
	});

	it("fora de uma investigação (ETL, testes) ninguém escuta e nada quebra", async () => {
		const r = await buscarJson(PNCP, { fetchFn: (async () => resposta(200)) as never });
		expect(r.ok).toBe(true);
	});

	it("IA: todos os modelos falharam (ou sem chave) avisa a investigação pelo endereço simbólico", async () => {
		const sinais: SinalFonte[] = [];
		const r = await observarFontes((s) => sinais.push(s), () => gerar({ tarefa: "triagem-json", sistema: "s", usuario: "u", formato: "json", env: {} }));
		expect(r.ok).toBe(false);
		expect(sinais).toEqual([{ tipo: "falhou", url: ENDERECO_IA, erro: "FONTE_INDISPONIVEL" }]);
	});
});

describe("origens e frases para pessoas", () => {
	it("liga o site à fonte da tela; banco e imagens ficam de fora", () => {
		expect(origemDoEndereco(PNCP)).toEqual({ fonte: "pncp", nome: "PNCP (portal federal de contratos)" });
		expect(origemDoEndereco("https://api.portaldatransparencia.gov.br/api-de-dados/emendas?ano=2025")?.fonte).toBe("emendas");
		expect(origemDoEndereco("https://api.portaldatransparencia.gov.br/api-de-dados/ceis")?.fonte).toBe("cgu");
		expect(origemDoEndereco("https://divulgacandcontas.tse.jus.br/divulga/rest/v1")?.fonte).toBe("tse");
		expect(origemDoEndereco("https://dados.tce.rs.gov.br/api")?.fonte).toBe("tribunais");
		expect(origemDoEndereco("https://dados.cl.df.gov.br/api/3/action/package_show")).toEqual({ fonte: "casa", nome: "Câmara Legislativa do DF" });
		expect(origemDoEndereco("https://abc.supabase.co/rest/v1/pesquisas")).toBeNull();
	});

	it("motivo técnico vira frase simples", () => {
		expect(motivoAcessivel("TIMEOUT")).toBe("demorou demais para responder");
		expect(motivoAcessivel("HTTP_4XX", 429)).toBe("recusou por excesso de consultas");
		expect(motivoAcessivel("HTTP_4XX", 403)).toBe("recusou o acesso");
		expect(motivoAcessivel("HTTP_5XX", 500)).toBe("estava com erro no próprio site");
		expect(motivoAcessivel("QUALQUER")).toBe("não respondeu");
	});
});

describe("ouvinte de etapas (sinal → evento ETAPA)", () => {
	it("traduz, não repete o mesmo (site, estado) e ignora o que não é fonte", () => {
		const eventos: { tipo: string; payload: any }[] = [];
		const ouvir = criarOuvinteDeEtapas((tipo, payload) => eventos.push({ tipo, payload }));
		ouvir({ tipo: "respondeu", url: PNCP });
		ouvir({ tipo: "respondeu", url: `${PNCP}&pagina=2` });
		ouvir({ tipo: "lenta", url: PNCP, motivo: "TIMEOUT" });
		ouvir({ tipo: "falhou", url: PNCP, erro: "HTTP_4XX", status: 429 });
		ouvir({ tipo: "falhou", url: "https://abc.supabase.co/rest/v1/x", erro: "REDE" });
		ouvir({ tipo: "falhou", url: ENDERECO_IA, erro: "FONTE_INDISPONIVEL" });
		expect(eventos.map((e) => e.payload)).toEqual([
			{ fonte: "pncp", origem: "PNCP (portal federal de contratos)", estado: "respondeu" },
			{ fonte: "pncp", origem: "PNCP (portal federal de contratos)", estado: "lenta", detalhe: "demorou demais para responder; tentando de novo" },
			{ fonte: "pncp", origem: "PNCP (portal federal de contratos)", estado: "falhou", detalhe: "recusou por excesso de consultas" },
			{ fonte: "ia", origem: "Modelos de IA gratuitos", estado: "falhou", detalhe: "estavam ocupados ou fora do ar; as notas desta parte vieram das regras locais, sem IA" },
		]);
		expect(eventos.every((e) => e.tipo === "ETAPA")).toBe(true);
	});
});

describe("prazo da investigação (fontes param perto do limite da rota)", () => {
	beforeEach(() => reiniciarEstadoFonteHttp());

	it("prazo esgotado: a consulta nem sai e a tela recebe 'ficou sem tempo'", async () => {
		const { Prazo } = await import("@/lib/prazo");
		const fetchFn = vi.fn(async () => resposta(200));
		const sinais: SinalFonte[] = [];
		const r = await observarFontes((s) => sinais.push(s), () => buscarJson(PNCP, { fetchFn: fetchFn as never }), { prazo: new Prazo(0) });
		expect(r).toMatchObject({ ok: false, erro: "PRAZO" });
		expect(fetchFn).not.toHaveBeenCalled();
		expect(sinais).toEqual([{ tipo: "falhou", url: PNCP, fonte: undefined, erro: "PRAZO" }]);
		expect(motivoAcessivel("PRAZO")).toBe("ficou sem tempo dentro da investigação");
	});

	it("o que sobra do prazo encurta o tempo de espera de cada consulta", async () => {
		const { Prazo } = await import("@/lib/prazo");
		const lenta = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_ok, erro) => {
			init.signal?.addEventListener("abort", () => erro(Object.assign(new Error("aborted"), { name: "AbortError" })));
		}));
		const inicio = Date.now();
		const r = await observarFontes(() => {}, () => buscarJson(PNCP, { fetchFn: lenta as never, timeoutMs: 8000, tentativas: 1 }), { prazo: new Prazo(60) });
		expect(r).toMatchObject({ ok: false, erro: "TIMEOUT" });
		expect(Date.now() - inicio).toBeLessThan(2000);
	});

	it("IA: sem tempo sobrando, nem chama o modelo", async () => {
		const { Prazo } = await import("@/lib/prazo");
		const fetchFn = vi.fn();
		const sinais: SinalFonte[] = [];
		const r = await observarFontes((s) => sinais.push(s), () => gerar({ tarefa: "triagem-json", sistema: "s", usuario: "u", formato: "json", env: { GROQ_API_KEY: "x" }, fetchFn: fetchFn as never }), { prazo: new Prazo(300) });
		expect(r).toMatchObject({ ok: false, motivo: "PRAZO" });
		expect(fetchFn).not.toHaveBeenCalled();
		expect(sinais).toEqual([{ tipo: "falhou", url: ENDERECO_IA, erro: "PRAZO" }]);
	});

	it("teto da rota: se o pipe passar do limite, a tela recebe o aviso e o DONE; se terminar antes, nada", async () => {
		const { comTetoDeTempo } = await import("@/services/core/teto-investigacao");
		const eventos: { tipo: string; payload: any }[] = [];
		expect(await comTetoDeTempo(new Promise(() => {}), (tipo, payload) => eventos.push({ tipo, payload }), 20)).toBe("estourou");
		expect(eventos.map((e) => e.tipo)).toEqual(["STATUS", "DONE"]);
		expect(eventos[0].payload.msg).toContain("passou do tempo máximo");
		const nada: unknown[] = [];
		expect(await comTetoDeTempo(Promise.resolve(), () => nada.push(1), 1000)).toBe("concluida");
		expect(nada).toEqual([]);
	});
});

describe("etapas no dossiê guardado", () => {
	it("o pipe redireciona os avisos de conexão para o seu emissor (o que guarda no cache)", async () => {
		const { redirecionarEtapasPara } = await import("@/services/core/etapas-ao-vivo");
		const rota: string[] = [];
		const pipe: string[] = [];
		await observarFontes(criarOuvinteDeEtapas((t) => rota.push(t)), async () => {
			redirecionarEtapasPara((t) => pipe.push(t));
			await buscarJson(PNCP, { fetchFn: (async () => resposta(200)) as never });
		});
		expect(rota).toEqual([]);
		expect(pipe).toEqual(["ETAPA"]);
		redirecionarEtapasPara(() => {}); // fora de uma investigação: nada acontece
	});

	it("dossiê restaurado: diz de quando é e reenvia as etapas; dossiê antigo avisa que não tem o registro", async () => {
		const { reemitirEtapasDoCache } = await import("@/services/core/etapas-ao-vivo");
		const eventos: { tipo: string; payload: any }[] = [];
		const etapa = { fonte: "receita", estado: "falhou", origem: "Receita Federal (dados de CNPJ)", detalhe: "recusou o acesso" };
		reemitirEtapasDoCache({ timestamp: "2026-10-08T16:09:00Z", etapas: [etapa] }, (tipo, payload) => eventos.push({ tipo, payload }));
		expect(eventos).toEqual([
			{ tipo: "STATUS", payload: { msg: "[CACHE] Dossiê guardado em 08/10/2026 às 13:09. A lista de fontes mostra o que respondeu naquela investigação." } },
			{ tipo: "ETAPA", payload: etapa },
		]);
		const antigos: any[] = [];
		reemitirEtapasDoCache({ timestamp: "2026-09-01T12:00:00Z" }, (_t, p) => antigos.push(p));
		expect(antigos).toEqual([{ msg: "[CACHE] Dossiê guardado em 01/09/2026 às 09:00, antes do registro por fonte: não dá para dizer quais fontes responderam." }]);
	});
});

describe("etapas pela tela (evento ETAPA)", () => {
	const PNCP_NOME = "PNCP (portal federal de contratos)";
	const reg = (...evs: EventoEtapa[]) => evs.reduce(registrarEtapa, ETAPAS_INICIAIS);

	it("nenhum site respondeu = 'não respondeu' (com o motivo); parte respondeu = 'respondeu em parte'", () => {
		const fora = reg({ fonte: "pncp", estado: "falhou", origem: PNCP_NOME, detalhe: "demorou demais para responder" });
		expect(statusDaFonte(fora, "pncp", true)).toBe("fora");
		expect(notaDaFonte(fora, "pncp", "fora")).toBe("PNCP (portal federal de contratos): demorou demais para responder");
		expect(problemasDeConexao(fora, true)).toEqual([{ fonte: "pncp", nome: "PNCP e contratos", texto: "PNCP (portal federal de contratos): demorou demais para responder", gravidade: "fora" }]);
		const parcial = registrarEtapa(fora, { fonte: "pncp", estado: "concluida", origem: PNCP_NOME, detalhe: "61 contratos: Governo (Distrito Federal)" });
		expect(statusDaFonte(parcial, "pncp", true)).toBe("parcial");
		expect(notaDaFonte(parcial, "pncp", "parcial")).toBe("PNCP (portal federal de contratos): demorou demais para responder; o restante respondeu");
	});

	it("lenta enquanto roda; ao responder sai da lista de lentas; resultado mostra o detalhe", () => {
		const lenta = reg({ fonte: "casa", estado: "lenta", origem: "Câmara dos Deputados", detalhe: "estava com erro no próprio site; tentando de novo" });
		expect(statusDaFonte(lenta, "casa", true)).toBe("slow");
		expect(notaDaFonte(lenta, "casa", "slow")).toBe("Câmara dos Deputados: estava com erro no próprio site; tentando de novo");
		const ok = registrarEtapa(registrarEtapa(lenta, { fonte: "casa", estado: "respondeu", origem: "Câmara dos Deputados" }), { fonte: "casa", estado: "concluida", detalhe: "31 gastos da verba indenizatória" });
		expect(statusDaFonte(ok, "casa", true)).toBe("ok");
		expect(notaDaFonte(ok, "casa", "ok")).toBe("31 gastos da verba indenizatória");
	});

	it("resultados: dois 'concluída' somam; 'vazia' não rebaixa 'concluída'; 'não se aplica' e fonte desconhecida", () => {
		const s = reg(
			{ fonte: "pncp", estado: "vazia", detalhe: "Prefeitura (X): nenhum contrato no PNCP em 12 meses" },
			{ fonte: "pncp", estado: "concluida", detalhe: "61 contratos: Governo (Distrito Federal)" },
			{ fonte: "pncp", estado: "concluida", detalhe: "95 contratos: Câmara Legislativa do DF" },
			{ fonte: "pncp", estado: "vazia", detalhe: "outra coisa" },
			{ fonte: "emendas", estado: "nao_se_aplica", detalhe: "só para deputado federal e senador" },
			{ fonte: "inexistente" as never, estado: "concluida" },
		);
		expect(statusDaFonte(s, "pncp", true)).toBe("ok");
		expect(notaDaFonte(s, "pncp", "ok")).toBe("61 contratos: Governo (Distrito Federal) · 95 contratos: Câmara Legislativa do DF");
		expect(statusDaFonte(s, "emendas", true)).toBe("na");
		expect(statusDaFonte(reg({ fonte: "diarios", estado: "vazia", detalhe: "nada" }), "diarios", true)).toBe("vazio");
	});

	it("fonte com problema conta como terminada no progresso; ao concluir, 'lenta' não fica pendurada", () => {
		const s = reg({ fonte: "tse", estado: "falhou", origem: "TSE (Justiça Eleitoral)", detalhe: "recusou o acesso" }, { fonte: "casa", estado: "lenta", origem: "Câmara dos Deputados", detalhe: "x" });
		expect(calcularProgresso(s, true)).toBeGreaterThan(0);
		expect(statusDaFonte(marcarConcluida(s), "casa", false)).toBe("ok");
		expect(statusDaFonte(marcarConcluida(s), "tse", false)).toBe("fora");
	});

	it("dossiê e painel: o evento ETAPA chega à lista de fontes, ao quadro de problemas e ao log sem etiqueta", () => {
		let dossie = iniciarDossie({ label: "Alice", uf: "DF" });
		dossie = aplicarEventos(dossie, [
			{ tipo: "STATUS", payload: { msg: "[PNCP] Governo (Distrito Federal): 61 contrato(s) nos últimos 12 meses." } },
			{ tipo: "ETAPA", payload: { fonte: "pncp", estado: "concluida", origem: PNCP_NOME, detalhe: "61 contratos: Governo (Distrito Federal)" } },
			{ tipo: "ETAPA", payload: { fonte: "tse", estado: "falhou", origem: "TSE (Justiça Eleitoral)", detalhe: "recusou o acesso" } },
		]);
		const v = jobView({ ...STORE_INICIAL, alvo: { nome: "Alice" }, dossie, inicio: 0 }, { nome: "Alice" });
		expect(v.etapas.find((e) => e.id === "pncp")).toMatchObject({ status: "ok", texto: "ok", nota: "61 contratos: Governo (Distrito Federal)" });
		expect(v.etapas.find((e) => e.id === "tse")).toMatchObject({ status: "fora", texto: "não respondeu", nota: "TSE (Justiça Eleitoral): recusou o acesso" });
		expect(v.problemas).toEqual([{ fonte: "tse", nome: "TSE", texto: "TSE (Justiça Eleitoral): recusou o acesso", gravidade: "fora" }]);
		expect(v.log).toBe("PNCP · Governo (Distrito Federal): 61 contrato(s) nos últimos 12 meses.");
		expect(textoDoLog("[POLÍGRAFO IA]: Analisando")).toBe("POLÍGRAFO IA · Analisando");
		expect(textoDoLog("Sem etiqueta")).toBe("Sem etiqueta");
	});
});

describe("ETAPA nos módulos (pipe)", () => {
	it("cruzamentos: 'consultando' no começo e o resultado (inclusive 'nenhuma coincidência') no fim", async () => {
		const { emitirCruzamentos } = await import("@/services/cruzamentos");
		const etapas: any[] = [];
		await emitirCruzamentos(
			{
				pessoaId: "p", casa: "CAMARA", doadores: [], empresasDoPolitico: [], despesasMandato: [], nos: [],
				buscarContas: async () => null, buscarSancoes: async () => [], buscarQsa: async () => null, buscarFuncoes: async () => [], explicar: async () => [],
			},
			(tipo, payload) => (tipo === "ETAPA" ? etapas.push(payload) : null),
		);
		expect(etapas).toEqual([
			{ fonte: "cruzamentos", estado: "consultando" },
			{ fonte: "cruzamentos", estado: "concluida", detalhe: "nenhuma coincidência entre 0 fatos" },
		]);
		vi.restoreAllMocks();
	});
});
