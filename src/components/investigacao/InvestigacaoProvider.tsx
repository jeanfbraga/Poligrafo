"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import type { EdgeChange, NodeChange } from "@xyflow/react";
import congressoIndex from "@/services/integrations/data/congresso-index.json";
import municipaisIndex from "@/services/integrations/data/municipais-index.json";
import type { Alvo, PoliticoIndexado } from "@/lib/investigacao/alvo";
import { type Controlador, criarControlador, type Notificador } from "@/lib/investigacao/controlador";
import type { DossieNode } from "@/lib/investigacao/dossie-state";
import {
	CHAVE_SESSAO,
	criarStore,
	desserializar,
	mesmoAlvo,
	serializar,
	temConteudoDossie,
	type Store,
	type StoreState,
} from "@/lib/investigacao/store";

const notificador: Notificador = {
	sucesso: (m) => toast.success(m),
	info: (m) => toast.info(m),
	aviso: (m) => toast.warning(m),
	erro: (m) => toast.error(m),
};

export interface InvestigacaoApi {
	state: StoreState;
	iniciar: (alvo: Alvo) => Promise<void>;
	cancelar: () => void;
	recomecar: () => Promise<void>;
	limpar: () => void;
	/** Restaura do sessionStorage se o alvo coincidir. Retorna true se restaurou. */
	restaurar: (alvo: Alvo) => boolean;
	pivotarCnpj: (cnpj: string, origemId: string) => Promise<void>;
	buscaReversa: (nome: string, origemId: string) => Promise<void>;
	investigarContratos: (cnpj: string, origemId: string) => Promise<void>;
	alternarEmendas: (hubId: string) => void;
	evidenciaParaCanvas: (id: string, posicao?: { x: number; y: number }) => void;
	descartarAviso: (fonte: string) => void;
	limparCandidatos: () => void;
	limparErro: () => void;
	onNodesChange: (changes: NodeChange[]) => void;
	onEdgesChange: (changes: EdgeChange[]) => void;
	setNodes: (nodes: DossieNode[]) => void;
}

const Ctx = createContext<InvestigacaoApi | null>(null);

/** Índice usado para pré-popular identidade e inferir refs. */
const INDEXADOS = [...congressoIndex, ...municipaisIndex] as PoliticoIndexado[];

function salvarSessao(state: StoreState) {
	try {
		const raw = serializar(state);
		if (raw) sessionStorage.setItem(CHAVE_SESSAO, raw);
	} catch {
		/* quota cheia ou storage bloqueado: o dossiê só não sobrevive ao reload */
	}
}

function lerSessao() {
	try {
		return desserializar(sessionStorage.getItem(CHAVE_SESSAO));
	} catch {
		return null;
	}
}

/**
 * Guarda a investigação ACIMA das rotas: ao sair do Perfil ou do Dossiê, o
 * stream continua rodando e o estado fica disponível ao voltar.
 */
export function InvestigacaoProvider({
	children,
	storeInicial,
}: {
	children: ReactNode;
	/** Permite injetar um store pré-populado (testes e fixtures). */
	storeInicial?: Store;
}) {
	const storeRef = useRef<Store | null>(null);
	if (!storeRef.current) storeRef.current = storeInicial ?? criarStore();
	const store = storeRef.current;

	const controlador = useMemo<Controlador>(
		() => criarControlador({ store, notificar: notificador, indexados: INDEXADOS }),
		[store],
	);

	const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

	// Persiste só nas transições de status (não a cada arrasto de nó).
	const status = state.dossie.status;
	useEffect(() => {
		if (status === "done" || status === "partial") salvarSessao(store.getState());
	}, [status, store]);

	const restaurar = useCallback(
		(alvo: Alvo) => {
			const atual = store.getState();
			if (mesmoAlvo(atual.alvo, alvo) && temConteudoDossie(atual.dossie)) return true;
			const p = lerSessao();
			if (!p || !mesmoAlvo(p.alvo, alvo) || !temConteudoDossie(p.dossie)) return false;
			store.dispatch({ t: "RESTAURAR", alvo: p.alvo, dossie: p.dossie, inicio: p.inicio, fim: p.fim });
			return true;
		},
		[store],
	);

	const api = useMemo<InvestigacaoApi>(
		() => ({
			state,
			iniciar: controlador.iniciar,
			cancelar: controlador.cancelar,
			recomecar: controlador.recomecar,
			limpar: () => {
				controlador.limpar();
				try {
					sessionStorage.removeItem(CHAVE_SESSAO);
				} catch {
					/* ignorado */
				}
			},
			restaurar,
			pivotarCnpj: controlador.pivotarCnpj,
			buscaReversa: controlador.buscaReversa,
			investigarContratos: controlador.investigarContratos,
			alternarEmendas: (hubId) => store.dispatch({ t: "EMENDAS", hubId }),
			evidenciaParaCanvas: (id, posicao) => store.dispatch({ t: "EVIDENCIA", id, posicao }),
			descartarAviso: (fonte) => store.dispatch({ t: "AVISO_FECHAR", fonte }),
			limparCandidatos: () => store.dispatch({ t: "LIMPAR_CANDIDATOS" }),
			limparErro: () => store.dispatch({ t: "LIMPAR_ERRO" }),
			onNodesChange: (changes) => store.dispatch({ t: "NODES", changes }),
			onEdgesChange: (changes) => store.dispatch({ t: "EDGES", changes }),
			setNodes: (nodes) => store.dispatch({ t: "SET_NODES", nodes }),
		}),
		[state, controlador, restaurar, store],
	);

	return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useInvestigacao(): InvestigacaoApi {
	const v = useContext(Ctx);
	if (!v) throw new Error("useInvestigacao precisa estar dentro de <InvestigacaoProvider>.");
	return v;
}

/** Segundos decorridos da investigação (congela quando termina). Atualiza 1x por segundo. */
export function useRelogio(): number {
	const { state } = useInvestigacao();
	const { inicio, fim } = state;
	const rodando = state.dossie.status === "running";
	const [agora, setAgora] = useState(() => Date.now());

	useEffect(() => {
		if (!rodando) return;
		setAgora(Date.now());
		const t = setInterval(() => setAgora(Date.now()), 1000);
		return () => clearInterval(t);
	}, [rodando]);

	if (!inicio) return 0;
	return Math.max(0, ((rodando ? agora : (fim ?? agora)) - inicio) / 1000);
}
