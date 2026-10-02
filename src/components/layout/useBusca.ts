"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { acharPorNomeExato, type PoliticoIndexado, rotaDoPolitico, urlDossie } from "@/lib/investigacao/alvo";
import {
	ALCADA_PADRAO,
	buscarPoliticos,
	CHAVE_ALCADA,
	CHAVE_RECENTES,
	INDICE_COMPLETO,
	mesclarRecente,
} from "@/lib/busca";

function lerJson<T>(chave: string, padrao: T): T {
	try {
		const raw = localStorage.getItem(chave);
		return raw ? (JSON.parse(raw) as T) : padrao;
	} catch {
		return padrao;
	}
}

function gravar(chave: string, valor: unknown) {
	try {
		localStorage.setItem(chave, typeof valor === "string" ? valor : JSON.stringify(valor));
	} catch {
		/* storage indisponível: só não lembra entre sessões */
	}
}

let cachePopulares: Promise<PoliticoIndexado[]> | null = null;

/** "Mais investigados" (mesma fonte do painel da Home), resolvidos no índice local. */
export function carregarPopulares(): Promise<PoliticoIndexado[]> {
	if (!cachePopulares) {
		cachePopulares = fetch("/api/dashboard/home")
			.then((r) => r.json())
			.then((d: { pesquisas?: { termo: string }[] }) =>
				(d.pesquisas ?? [])
					.map((p) => acharPorNomeExato(p.termo, INDICE_COMPLETO))
					.filter((p): p is PoliticoIndexado => Boolean(p))
					.slice(0, 4),
			)
			.catch(() => []);
	}
	return cachePopulares;
}

export interface BuscaApi {
	q: string;
	setQ: (v: string) => void;
	alcada: string;
	setAlcada: (a: string) => void;
	aberto: boolean;
	abrir: (v: boolean) => void;
	idx: number;
	recentes: PoliticoIndexado[];
	populares: PoliticoIndexado[];
	/** Itens navegáveis (resultados, ou recentes+populares quando vazio). */
	itens: PoliticoIndexado[];
	modo: "resultados" | "sugestoes";
	escolher: (p: PoliticoIndexado) => void;
	buscarAoVivo: () => void;
	onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

type Teclas = Record<string, (e: KeyboardEvent<HTMLInputElement>) => void>;

export function useBusca(aoNavegar?: () => void): BuscaApi {
	const router = useRouter();
	const [q, setQ] = useState("");
	const [alcada, setAlcadaState] = useState(ALCADA_PADRAO);
	const [aberto, abrir] = useState(false);
	const [idx, setIdx] = useState(0);
	const [recentes, setRecentes] = useState<PoliticoIndexado[]>([]);
	const [populares, setPopulares] = useState<PoliticoIndexado[]>([]);

	useEffect(() => {
		setRecentes(lerJson<PoliticoIndexado[]>(CHAVE_RECENTES, []));
		const salva = lerJson<string>(CHAVE_ALCADA, ALCADA_PADRAO);
		setAlcadaState(typeof salva === "string" && salva ? salva : ALCADA_PADRAO);
	}, []);

	useEffect(() => {
		if (aberto) carregarPopulares().then(setPopulares);
	}, [aberto]);

	const setAlcada = useCallback((a: string) => {
		setAlcadaState(a);
		gravar(CHAVE_ALCADA, a);
	}, []);

	const resultados = useMemo(() => buscarPoliticos(q, alcada), [q, alcada]);
	const modo = q.trim() ? "resultados" : "sugestoes";
	const itens = useMemo(
		() => (modo === "resultados" ? resultados : [...recentes, ...populares]),
		[modo, resultados, recentes, populares],
	);

	const escolher = useCallback(
		(p: PoliticoIndexado) => {
			const proximos = mesclarRecente(recentes, p);
			setRecentes(proximos);
			gravar(CHAVE_RECENTES, proximos);
			abrir(false);
			setQ("");
			aoNavegar?.();
			router.push(rotaDoPolitico(p, alcada).href);
		},
		[recentes, alcada, router, aoNavegar],
	);

	const buscarAoVivo = useCallback(() => {
		const nome = q.trim();
		if (!nome) return;
		abrir(false);
		aoNavegar?.();
		router.push(urlDossie({ nome, uf: alcada }));
	}, [q, alcada, router, aoNavegar]);

	const confirmar = useCallback(() => {
		const sel = itens[idx];
		if (sel) escolher(sel);
		else buscarAoVivo();
	}, [itens, idx, escolher, buscarAoVivo]);

	const teclas: Teclas = {
		ArrowDown: (e) => {
			e.preventDefault();
			setIdx((i) => Math.min(i + 1, Math.max(0, itens.length - 1)));
		},
		ArrowUp: (e) => {
			e.preventDefault();
			setIdx((i) => Math.max(i - 1, 0));
		},
		Enter: (e) => {
			e.preventDefault();
			confirmar();
		},
		Escape: () => abrir(false),
	};

	return {
		q,
		setQ: (v) => {
			setQ(v);
			setIdx(0);
			abrir(true);
		},
		alcada,
		setAlcada,
		aberto,
		abrir,
		idx,
		recentes,
		populares,
		itens,
		modo,
		escolher,
		buscarAoVivo,
		onKeyDown: (e) => teclas[e.key]?.(e),
	};
}
