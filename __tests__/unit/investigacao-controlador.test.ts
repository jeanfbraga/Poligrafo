import { describe, expect, it, vi } from "vitest";
import { criarControlador, urlApiInvestigar } from "@/lib/investigacao/controlador";
import {
	criarStore,
	desserializar,
	devePersistir,
	mesmoAlvo,
	reduzirStore,
	serializar,
	STORE_INICIAL,
} from "@/lib/investigacao/store";

const enc = new TextEncoder();
const bloco = (tipo: string, payload: unknown) => `data: ${JSON.stringify({ tipo, payload })}\n\n`;

/** fetch falso que devolve um stream SSE com os blocos dados. */
function fetchSse(...blocos: string[]) {
	return vi.fn(async () => {
		const stream = new ReadableStream({
			start(c) {
				blocos.forEach((b) => c.enqueue(enc.encode(b)));
				c.close();
			},
		});
		return new Response(stream);
	}) as unknown as typeof fetch;
}

/** fetch que só termina quando abortado. */
function fetchPendente() {
	return vi.fn((_url: unknown, init?: RequestInit) => {
		return new Promise<Response>((_, reject) => {
			init?.signal?.addEventListener("abort", () => {
				const e = new Error("abortado");
				e.name = "AbortError";
				reject(e);
			});
		});
	}) as unknown as typeof fetch;
}

const notif = () => ({ sucesso: vi.fn(), info: vi.fn(), aviso: vi.fn(), erro: vi.fn() });
const pessoa = { id: "p1", type: "PESSOA", data: { label: "ALICE" } };

function montar(fetchFn: typeof fetch) {
	const store = criarStore();
	const notificar = notif();
	const c = criarControlador({ store, notificar, indexados: [], fetchFn, flushMs: 5, agora: () => 1000 });
	return { store, notificar, c };
}

describe("urlApiInvestigar", () => {
	it("inclui ref e uf, exceto FEDERAL", () => {
		expect(urlApiInvestigar({ nome: "A B", ref: "FEDERAL:CAMARA:1", uf: "FEDERAL" })).toBe(
			"/api/investigar?nome=A+B&ref=FEDERAL%3ACAMARA%3A1",
		);
		expect(urlApiInvestigar({ nome: "X", uf: "RJ" })).toBe("/api/investigar?nome=X&uf=RJ");
	});
});

describe("controlador — investigação principal", () => {
	it("roda o stream até o DONE e conclui com toast de sucesso", async () => {
		const { store, notificar, c } = montar(
			fetchSse(
				bloco("STATUS", { msg: "Puxando financiadores de campanha no TSE..." }),
				bloco("NODE_NOVO", pessoa),
				bloco("NODE_NOVO", { id: "d1", type: "DESPESA", data: { score_letalidade: 90, valor: 1 } }),
				bloco("DONE", { msg: "ok" }),
			),
		);
		await c.iniciar({ nome: "Alice", ref: "FEDERAL:CAMARA:1", uf: "FEDERAL" });
		const s = store.getState();
		expect(s.dossie.status).toBe("done");
		expect(s.dossie.nodes.map((n) => n.id)).toEqual(["p1", "d1"]);
		expect(s.fim).toBe(1000);
		expect(notificar.sucesso).toHaveBeenCalledWith("Dossiê completo gerado com sucesso.");
	});

	it("stream que termina sem DONE também conclui", async () => {
		const { store, c } = montar(fetchSse(bloco("NODE_NOVO", pessoa)));
		await c.iniciar({ nome: "Alice" });
		expect(store.getState().dossie.status).toBe("done");
	});

	it("ERROR do servidor deixa o job em erro e avisa", async () => {
		const { store, notificar, c } = montar(fetchSse(bloco("ERROR", { mensagem: "sem dados" })));
		await c.iniciar({ nome: "Alice" });
		expect(store.getState().dossie.status).toBe("error");
		expect(notificar.erro).toHaveBeenCalledWith(expect.stringContaining("sem dados"));
		expect(notificar.sucesso).not.toHaveBeenCalled();
	});

	it("falha de rede vira erro com toast", async () => {
		const fetchFn = vi.fn(async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch;
		const { store, notificar, c } = montar(fetchFn);
		await c.iniciar({ nome: "Alice" });
		expect(store.getState().dossie.status).toBe("error");
		expect(store.getState().dossie.erro).toBe("offline");
		expect(notificar.erro).toHaveBeenCalled();
	});

	it("cancelar interrompe e deixa o dossiê parcial preservando os nós", async () => {
		const { store, notificar, c } = montar(fetchPendente());
		const p = c.iniciar({ nome: "Alice" });
		expect(store.getState().dossie.status).toBe("running");
		c.cancelar();
		await p;
		expect(store.getState().dossie.status).toBe("partial");
		expect(store.getState().dossie.nodes).toHaveLength(1);
		expect(notificar.aviso).toHaveBeenCalled();
	});

	it("iniciar outro alvo substitui o anterior sem marcá-lo como parcial", async () => {
		let n = 0;
		const fetchFn = vi.fn((_u: unknown, init?: RequestInit) => {
			n++;
			if (n === 1) {
				return new Promise<Response>((_, reject) => {
					init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("x"), { name: "AbortError" })));
				});
			}
			return Promise.resolve(new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(bloco("DONE", {}))); c.close(); } })));
		}) as unknown as typeof fetch;
		const { store, c } = montar(fetchFn);
		const primeiro = c.iniciar({ nome: "A" });
		await c.iniciar({ nome: "B" });
		await primeiro;
		expect(store.getState().alvo?.nome).toBe("B");
		expect(store.getState().dossie.status).toBe("done");
	});

	it("um único homônimo reinicia automaticamente com a ref encontrada", async () => {
		const urls: string[] = [];
		const fetchFn = vi.fn(async (u: unknown) => {
			urls.push(String(u));
			const corpo = urls.length === 1
				? bloco("CANDIDATOS_ENCONTRADOS", { candidatos: [{ nome: "Alice Ribeiro", ref: "FEDERAL:CAMARA:7" }] })
				: bloco("DONE", {});
			return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(corpo)); c.close(); } }));
		}) as unknown as typeof fetch;
		const { store, c } = montar(fetchFn);
		await c.iniciar({ nome: "Alice", uf: "FEDERAL" });
		expect(urls).toHaveLength(2);
		expect(urls[1]).toContain("ref=FEDERAL%3ACAMARA%3A7");
		expect(store.getState().alvo?.ref).toBe("FEDERAL:CAMARA:7");
	});

	it("vários homônimos ficam na lista para escolha", async () => {
		const { store, c } = montar(
			fetchSse(bloco("CANDIDATOS_ENCONTRADOS", { candidatos: [{ nome: "A", ref: "1" }, { nome: "B", ref: "2" }] })),
		);
		await c.iniciar({ nome: "Alice", uf: "FEDERAL" });
		expect(store.getState().dossie.candidatos).toHaveLength(2);
	});

	it("recomeçar reexecuta o último alvo; limpar zera o store", async () => {
		const { store, c } = montar(fetchSse(bloco("DONE", {})));
		await c.iniciar({ nome: "Alice" });
		await c.recomecar();
		expect(store.getState().alvo?.nome).toBe("Alice");
		c.limpar();
		expect(store.getState()).toEqual(STORE_INICIAL);
	});

	it("análise de grafo com suspeitos gera aviso", async () => {
		const { notificar, c } = montar(fetchSse(bloco("GRAPH_ANALYSIS_SCORES", { a: { suspicious: true }, b: { suspicious: true } })));
		await c.iniciar({ nome: "Alice" });
		expect(notificar.aviso).toHaveBeenCalledWith(expect.stringContaining("2 nó(s)"));
	});
});

describe("controlador — pivôs", () => {
	const comPessoa = (fetchFn: typeof fetch) => {
		const ctx = montar(fetchFn);
		ctx.store.dispatch({ t: "RESTAURAR", alvo: { nome: "Alice" }, inicio: 1, fim: 2, dossie: { ...reduzirStore(STORE_INICIAL, { t: "EVENTOS", eventos: [] }).dossie, status: "done", nodes: [{ id: "emp-1", type: "EMPRESA", position: { x: 0, y: 0 }, data: { label: "ACME" } }, { id: "p1", type: "PESSOA", position: { x: 0, y: 0 }, data: { label: "ALICE" } }] } });
		return ctx;
	};

	it("pivô por CNPJ adiciona nós ligados à origem e desliga o loading", async () => {
		const { store, c } = comPessoa(
			fetchSse(
				bloco("STATUS", { msg: "Extraindo QSA..." }),
				bloco("NODE_NOVO", { id: "s1", type: "SOCIO", data: { label: "Rui" }, _origemId: "emp-1" }),
				bloco("DONE", {}),
			),
		);
		await c.pivotarCnpj("12345678000190", "emp-1");
		const s = store.getState();
		expect(s.dossie.nodes.map((n) => n.id)).toContain("s1");
		expect(s.dossie.edges.find((e) => e.target === "s1")?.source).toBe("emp-1");
		expect(s.dossie.nodes.find((n) => n.id === "emp-1")?.data.isSearching).toBe(false);
		expect(s.pivotando).toBe(false);
	});

	it("não aprofunda enquanto a investigação principal roda", async () => {
		const { store, notificar, c } = comPessoa(fetchSse(bloco("DONE", {})));
		store.dispatch({ t: "RESTAURAR", alvo: { nome: "A" }, inicio: 1, fim: null, dossie: { ...store.getState().dossie, status: "running" } });
		await c.pivotarCnpj("1", "emp-1");
		expect(notificar.aviso).toHaveBeenCalledWith(expect.stringContaining("Aguarde"));
		expect(store.getState().dossie.nodes.some((n) => n.id === "s1")).toBe(false);
	});

	it("busca reversa avisa quando as empresas já estavam no painel", async () => {
		const { store, notificar, c } = comPessoa(
			fetchSse(
				bloco("NODE_NOVO", { id: "e2", type: "EMPRESA", data: { cnpj: "12345678000190" }, _origemId: "s1" }),
				bloco("DONE", {}),
			),
		);
		store.dispatch({ t: "PIVO_CNPJ", node: { id: "x", type: "EMPRESA", position: { x: 0, y: 0 }, data: { cnpj: "12.345.678/0001-90" } } });
		await c.buscaReversa("Rui", "s1");
		expect(notificar.info).toHaveBeenCalledWith(expect.stringContaining("já estavam no painel"));
	});

	it("busca reversa sem empresas informa que nada foi encontrado", async () => {
		const { notificar, c } = comPessoa(fetchSse(bloco("DONE", {})));
		await c.buscaReversa("Rui", "s1");
		expect(notificar.info).toHaveBeenCalledWith(expect.stringContaining("nenhuma empresa adicional"));
	});

	it("contratos do PNCP viram nós e geram toast", async () => {
		const fetchFn = vi.fn(async () =>
			new Response(JSON.stringify({ hasContracts: true, contracts: [{ numeroControlePNCP: "9", valorInicial: 5 }], aiAnalysis: {} })),
		) as unknown as typeof fetch;
		const { store, notificar, c } = comPessoa(fetchFn);
		await c.investigarContratos("12345678000190", "emp-1");
		expect(store.getState().dossie.nodes.some((n) => n.id === "pncp-9")).toBe(true);
		expect(notificar.sucesso).toHaveBeenCalledWith(expect.stringContaining("1 contratos"));
	});

	it("contratos: resposta vazia informa e não cria nós", async () => {
		const fetchFn = vi.fn(async () => new Response(JSON.stringify({ hasContracts: false }))) as unknown as typeof fetch;
		const { notificar, c } = comPessoa(fetchFn);
		await c.investigarContratos("1", "emp-1");
		expect(notificar.info).toHaveBeenCalled();
	});
});

describe("store — persistência e comparação de alvo", () => {
	it("só persiste dossiês concluídos/parciais com nós", () => {
		expect(devePersistir(STORE_INICIAL)).toBe(false);
		const s = reduzirStore(STORE_INICIAL, {
			t: "RESTAURAR",
			alvo: { nome: "A" },
			inicio: 1,
			fim: 2,
			dossie: { ...STORE_INICIAL.dossie, status: "done", nodes: [{ id: "p", type: "PESSOA", position: { x: 0, y: 0 }, data: {} }] },
		});
		expect(devePersistir(s)).toBe(true);
		const raw = serializar(s);
		expect(desserializar(raw)?.alvo.nome).toBe("A");
	});

	it("desserializar descarta o resumo da cota de sessões antigas (hoje calculado no front)", () => {
		const no = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, data: {} });
		const raw = JSON.stringify({
			alvo: { nome: "A" },
			inicio: 1,
			fim: 2,
			dossie: { ...STORE_INICIAL.dossie, status: "done", nodes: [no("p", "PESSOA"), no("r", "CEAP_RESUMO")], evidencias: [no("r2", "CEAP_RESUMO"), no("d", "DESPESA")] },
		});
		const p = desserializar(raw)!;
		expect(p.dossie.nodes.map((n) => n.id)).toEqual(["p"]);
		expect(p.dossie.evidencias.map((n) => n.id)).toEqual(["d"]);
	});

	it("desserializar tolera lixo", () => {
		expect(desserializar(null)).toBeNull();
		expect(desserializar("{nao-json")).toBeNull();
		expect(desserializar('{"foo":1}')).toBeNull();
	});

	it("mesmoAlvo compara por ref ou por nome", () => {
		expect(mesmoAlvo({ nome: "A", ref: "r1" }, { nome: "B", ref: "r1" })).toBe(true);
		expect(mesmoAlvo({ nome: "A", ref: "r1" }, { nome: "A", ref: "r2" })).toBe(false);
		expect(mesmoAlvo({ nome: " alice " }, { nome: "ALICE" })).toBe(true);
		expect(mesmoAlvo(null, { nome: "A" })).toBe(false);
	});

	it("o store externo notifica assinantes a cada dispatch", () => {
		const store = criarStore();
		const fn = vi.fn();
		const off = store.subscribe(fn);
		store.dispatch({ t: "PIVOTANDO", ligado: true });
		off();
		store.dispatch({ t: "PIVOTANDO", ligado: false });
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
