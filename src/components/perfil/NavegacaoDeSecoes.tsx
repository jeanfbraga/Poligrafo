"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type PosicaoSecao, secaoAtiva } from "@/lib/secao-ativa";
import { irParaSecao } from "./ResumoPerfil";

export interface SecaoNav {
	id: string;
	rotulo: string;
}

/** Linha de leitura: a seção cujo topo passou dos primeiros 96px da área rolável. */
const LINHA_LEITURA = 96;

function medirPosicoes(ids: string[], area: HTMLElement): PosicaoSecao[] {
	const base = area.getBoundingClientRect().top;
	return ids
		.map((id) => ({ id, el: document.getElementById(id) }))
		.filter((s): s is { id: string; el: HTMLElement } => s.el !== null)
		.map((s) => ({ id: s.id, topo: s.el.getBoundingClientRect().top - base }));
}

function noFimDaPagina(area: HTMLElement): boolean {
	return area.scrollTop + area.clientHeight >= area.scrollHeight - 4;
}

/** Acompanha a rolagem da área `.pg-view` e devolve a seção atual. */
function useSecaoAtual(ids: string[]) {
	const [atual, setAtual] = useState<string>(ids[0] ?? "");
	const quadro = useRef<number | null>(null);

	const atualizar = useCallback(
		(area: HTMLElement) => {
			const id = secaoAtiva(medirPosicoes(ids, area), LINHA_LEITURA, noFimDaPagina(area));
			if (id) setAtual(id);
		},
		[ids],
	);

	useEffect(() => {
		const area = document.querySelector<HTMLElement>(".pg-view");
		if (!area) return;
		const aoRolar = () => {
			if (quadro.current !== null) return;
			quadro.current = requestAnimationFrame(() => {
				quadro.current = null;
				atualizar(area);
			});
		};
		area.addEventListener("scroll", aoRolar, { passive: true });
		aoRolar();
		return () => {
			area.removeEventListener("scroll", aoRolar);
			if (quadro.current !== null) cancelAnimationFrame(quadro.current);
			quadro.current = null; // sem isso o guarda acima bloquearia todas as rolagens seguintes
		};
	}, [atualizar]);

	return [atual, setAtual] as const;
}

/**
 * Navegação por seções do Perfil: fixa no topo (desktop e mobile), com a seção
 * atual destacada conforme a rolagem. No celular a faixa rola na horizontal.
 */
export default function NavegacaoDeSecoes({ secoes }: { secoes: SecaoNav[] }) {
	// `secoes` deve vir memoizada do pai: o hook reage à identidade da lista.
	const ids = useMemo(() => secoes.map((s) => s.id), [secoes]);
	const [atual, setAtual] = useSecaoAtual(ids);
	const faixa = useRef<HTMLDivElement>(null);

	// Mantém o botão ativo visível na faixa horizontal (sem rolar a página).
	useEffect(() => {
		const f = faixa.current;
		const b = f?.querySelector<HTMLElement>('[aria-current="true"]');
		if (!f || !b) return;
		f.scrollTo?.({ left: b.offsetLeft - (f.clientWidth - b.clientWidth) / 2, behavior: "smooth" });
	}, [atual]);

	return (
		<nav className="pg-msec pg-secnav" aria-label="Seções do perfil">
			<div className="pg-secnav__faixa" ref={faixa}>
				{secoes.map((s) => (
					<button
						key={s.id}
						type="button"
						aria-current={atual === s.id}
						onClick={() => {
							setAtual(s.id);
							irParaSecao(s.id);
						}}
					>
						{s.rotulo}
					</button>
				))}
			</div>
		</nav>
	);
}
