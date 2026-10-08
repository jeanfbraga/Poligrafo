/* ==========================================================================
   Controlador da investigação — conversa com a API (SSE) e alimenta o store.
   Sem React: testável com fetch falso. Complexidade ≤ 10 por função.
   ========================================================================== */
import { type Alvo, identidadeInicial, type PoliticoIndexado } from "./alvo";
import { type DossieNode, iniciarDossie, PESSOA_PLACEHOLDER_ID } from "./dossie-state";
import { consumirSse, type SseEvent } from "./sse";
import type { Store } from "./store";

export interface Notificador {
	sucesso: (msg: string) => void;
	info: (msg: string) => void;
	aviso: (msg: string) => void;
	erro: (msg: string) => void;
}

export interface DependenciasControlador {
	store: Store;
	notificar: Notificador;
	indexados: readonly PoliticoIndexado[];
	fetchFn?: typeof fetch;
	agora?: () => number;
	/** Intervalo de agrupamento de eventos (evita re-render a cada nó). */
	flushMs?: number;
}

export interface Controlador {
	iniciar: (alvo: Alvo) => Promise<void>;
	cancelar: () => void;
	recomecar: () => Promise<void>;
	limpar: () => void;
	pivotarCnpj: (cnpj: string, origemId: string) => Promise<void>;
	buscaReversa: (nomeSocio: string, origemId: string) => Promise<void>;
	investigarContratos: (cnpj: string, origemId: string) => Promise<void>;
}

type Motivo = "usuario" | "substituida";

interface Execucao {
	ctrl: AbortController;
	motivo: Motivo | null;
}

export function urlApiInvestigar(alvo: Alvo): string {
	const q = new URLSearchParams({ nome: alvo.nome });
	if (alvo.ref) q.set("ref", alvo.ref);
	if (alvo.uf && alvo.uf !== "FEDERAL") q.set("uf", alvo.uf);
	return `/api/investigar?${q.toString()}`;
}

function ehAbort(err: unknown): boolean {
	return (err as { name?: string })?.name === "AbortError";
}

function mensagemDe(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export function criarControlador(deps: DependenciasControlador): Controlador {
	const { store, notificar, indexados } = deps;
	const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
	const agora = deps.agora ?? Date.now;
	const flushMs = deps.flushMs ?? 400;
	let atual: Execucao | null = null;
	let pivoAtual: Execucao | null = null;

	function abortarPrincipal(motivo: Motivo) {
		if (!atual) return;
		atual.motivo = motivo;
		atual.ctrl.abort();
	}

	/** Lê o stream agrupando eventos em lotes. Devolve os eventos que pedem ação do controlador. */
	async function lerStream(res: Response, aoEvento: (ev: SseEvent) => void): Promise<void> {
		let fila: SseEvent[] = [];
		const despachar = () => {
			if (fila.length === 0) return;
			const lote = fila;
			fila = [];
			store.dispatch({ t: "EVENTOS", eventos: lote });
		};
		const timer = setInterval(despachar, flushMs);
		try {
			await consumirSse(res, (ev) => {
				fila.push(ev);
				aoEvento(ev);
			});
		} finally {
			clearInterval(timer);
			despachar();
		}
	}

	function aoEventoPrincipal(ev: SseEvent, seguir: { candidato: Alvo | null }, alvo: Alvo) {
		if (ev.tipo === "ERROR") notificar.erro(`Falha na extração: ${ev.payload?.mensagem ?? "erro no pipeline"}`);
		if (ev.tipo === "GRAPH_ANALYSIS_SCORES") avisarSuspeitos(ev.payload);
		if (ev.tipo === "CANDIDATOS_ENCONTRADOS" && ev.payload?.candidatos?.length === 1) {
			const c = ev.payload.candidatos[0];
			seguir.candidato = { nome: c.nome, ref: c.ref, uf: alvo.uf };
		}
	}

	function avisarSuspeitos(scores: Record<string, { suspicious?: boolean }> | undefined) {
		const total = Object.values(scores ?? {}).filter((m) => m?.suspicious).length;
		if (total > 0) notificar.aviso(`Matemática de rede: ${total} nó(s) apontados como pontes discretas.`);
	}

	async function iniciar(alvo: Alvo): Promise<void> {
		abortarPrincipal("substituida");
		const exec: Execucao = { ctrl: new AbortController(), motivo: null };
		atual = exec;

		const id = identidadeInicial(alvo, indexados);
		store.dispatch({
			t: "START",
			alvo,
			agora: agora(),
			dossie: iniciarDossie({
				label: alvo.nome,
				cargo: id.cargo,
				uf: id.uf ?? alvo.uf,
				urlFoto: id.urlFoto,
				urlFotoFallback: id.urlFotoFallback,
			}),
		});

		const seguir: { candidato: Alvo | null } = { candidato: null };
		try {
			const res = await fetchFn(urlApiInvestigar(alvo), { signal: exec.ctrl.signal });
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				throw new Error(body?.error || `Falha na requisição (HTTP ${res.status})`);
			}
			await lerStream(res, (ev) => aoEventoPrincipal(ev, seguir, alvo));
		} catch (err) {
			tratarFalhaPrincipal(err, exec);
			return;
		} finally {
			if (atual === exec) atual = null;
		}

		if (seguir.candidato) return iniciar(seguir.candidato);
		encerrar();
	}

	function encerrar() {
		store.dispatch({ t: "FIM", agora: agora() });
		if (store.getState().dossie.status === "done") notificar.sucesso("Dossiê completo gerado com sucesso.");
	}

	function tratarFalhaPrincipal(err: unknown, exec: Execucao) {
		if (ehAbort(err)) {
			if (exec.motivo === "usuario") {
				store.dispatch({ t: "INTERROMPER", agora: agora() });
				notificar.aviso("Investigação interrompida. Os nós encontrados foram preservados.");
			}
			return;
		}
		store.dispatch({ t: "FALHA", msg: mensagemDe(err), agora: agora() });
		notificar.erro(`Erro de conexão: ${mensagemDe(err)}`);
	}

	/* ---- Pivôs ---- */

	function podePivotar(): boolean {
		if (store.getState().dossie.status === "running") {
			notificar.aviso("Aguarde a investigação principal terminar para aprofundar um nó.");
			return false;
		}
		if (store.getState().pivotando) {
			notificar.aviso("Já existe um aprofundamento em andamento.");
			return false;
		}
		return true;
	}

	async function executarPivo(
		url: string,
		origemId: string,
		aoEvento: (ev: SseEvent) => void,
		mensagemInicial: string,
	): Promise<void> {
		if (!podePivotar()) return;
		const exec: Execucao = { ctrl: new AbortController(), motivo: null };
		pivoAtual = exec;
		store.dispatch({ t: "PIVOTANDO", ligado: true });
		store.dispatch({ t: "BUSCANDO", id: origemId, ligado: true, msg: mensagemInicial });
		try {
			const res = await fetchFn(url, { signal: exec.ctrl.signal });
			await consumirSse(res, (ev) => {
				if (ev.tipo === "STATUS") store.dispatch({ t: "BUSCANDO", id: origemId, ligado: true, msg: ev.payload?.msg });
				if (ev.tipo === "ERROR") notificar.erro(ev.payload?.mensagem ?? "Erro no aprofundamento.");
				aoEvento(ev);
			});
		} catch (err) {
			if (ehAbort(err)) notificar.aviso("Aprofundamento cancelado.");
			else notificar.erro(`Erro no aprofundamento: ${mensagemDe(err)}`);
		} finally {
			store.dispatch({ t: "BUSCANDO", id: origemId, ligado: false });
			store.dispatch({ t: "PIVOTANDO", ligado: false });
			if (pivoAtual === exec) pivoAtual = null;
		}
	}

	const nodeDe = (ev: SseEvent): DossieNode => ({ position: { x: 0, y: 0 }, ...ev.payload });

	async function pivotarCnpj(cnpj: string, origemId: string) {
		const url = `/api/investigar/cnpj?cnpj=${encodeURIComponent(cnpj)}&origemId=${encodeURIComponent(origemId)}`;
		await executarPivo(
			url,
			origemId,
			(ev) => {
				if (ev.tipo === "NODE_NOVO") store.dispatch({ t: "PIVO_CNPJ", node: nodeDe(ev) });
			},
			`Quebrando sigilo societário do CNPJ ${cnpj}...`,
		);
	}

	function resumoBuscaReversa(nome: string) {
		const { total, novas } = store.getState().reversa;
		if (total === 0) notificar.info(`Busca reversa: nenhuma empresa adicional de ${nome} foi encontrada publicamente.`);
		else if (novas === 0) notificar.info(`Busca reversa: ${total} empresa(s) de ${nome} já estavam no painel.`);
		else notificar.sucesso(`Busca reversa concluída: ${novas} nova(s) conexão(ões) de ${nome}.`);
	}

	async function buscaReversa(nomeSocio: string, origemId: string) {
		const url = `/api/investigar/socio?nome=${encodeURIComponent(nomeSocio)}&origemId=${encodeURIComponent(origemId)}`;
		await executarPivo(
			url,
			origemId,
			(ev) => {
				if (ev.tipo === "NODE_NOVO") store.dispatch({ t: "PIVO_SOCIO", node: nodeDe(ev) });
				if (ev.tipo === "DONE") resumoBuscaReversa(nomeSocio);
			},
			`Varrendo malha reversa para o sócio ${nomeSocio}...`,
		);
	}

	async function investigarContratos(cnpj: string, origemId: string) {
		if (!podePivotar()) return;
		const pessoa = store.getState().dossie.nodes.find((n) => n.type === "PESSOA");
		const politico = String(pessoa?.data?.label ?? "");
		store.dispatch({ t: "PIVOTANDO", ligado: true });
		store.dispatch({ t: "BUSCANDO", id: origemId, ligado: true, msg: "Buscando histórico de licitações no PNCP..." });
		try {
			const res = await fetchFn(`/api/investigar/licitacoes?cnpj=${encodeURIComponent(cnpj)}&politico=${encodeURIComponent(politico)}`);
			const data = await res.json();
			if (data?.hasContracts && data.contracts?.length > 0) {
				store.dispatch({ t: "PIVO_CONTRATOS", origemId, contratos: data.contracts, analise: data.aiAnalysis });
				notificar.sucesso(`PNCP: ${data.contracts.length} contratos integrados.`);
			} else {
				notificar.info("PNCP: nenhum contrato relevante encontrado nos últimos 8 anos.");
			}
		} catch (err) {
			notificar.erro(`Erro no PNCP: ${mensagemDe(err)}`);
		} finally {
			store.dispatch({ t: "BUSCANDO", id: origemId, ligado: false });
			store.dispatch({ t: "PIVOTANDO", ligado: false });
		}
	}

	return {
		iniciar,
		cancelar: () => {
			abortarPrincipal("usuario");
			if (pivoAtual) pivoAtual.ctrl.abort();
		},
		recomecar: async () => {
			const alvo = store.getState().alvo;
			if (alvo) await iniciar(alvo);
		},
		limpar: () => {
			abortarPrincipal("substituida");
			if (pivoAtual) pivoAtual.ctrl.abort();
			store.dispatch({ t: "RESET" });
		},
		pivotarCnpj,
		buscaReversa,
		investigarContratos,
	};
}
