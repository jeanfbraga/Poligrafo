"use client";

import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { ALCADA_PADRAO, NOMES_UF, UFS } from "@/lib/busca";
import { ResultadosBusca } from "./ResultadosBusca";
import { useBusca } from "./useBusca";

function PopoverAlcada({ atual, onEscolher }: { atual: string; onEscolher: (a: string) => void }) {
	return (
		<div className="pg-scopepop" role="dialog" aria-label="Escolher alçada">
			<button type="button" className="pg-scopepop__fed" aria-pressed={atual === ALCADA_PADRAO} onClick={() => onEscolher(ALCADA_PADRAO)}>
				<span>FEDERAL</span>
				<span className="pg-label" style={{ color: "inherit" }}>
					Governo federal · Câmara, Senado, Presidência
				</span>
			</button>
			<span className="pg-label">Estados</span>
			<div className="pg-scopegrid">
				{UFS.map((u) => (
					<button key={u} type="button" title={NOMES_UF[u]} aria-pressed={atual === u} onClick={() => onEscolher(u)}>
						{u}
					</button>
				))}
			</div>
		</div>
	);
}

/**
 * Barra de busca de comando do desktop: alçada (pré-selecionada) + nome.
 * Teclas: ↑↓ navegar · Enter abrir · Esc fechar · Tab alçada · "/" foca.
 */
export function CommandSearch() {
	const busca = useBusca();
	const inputRef = useRef<HTMLInputElement>(null);
	const raizRef = useRef<HTMLDivElement>(null);
	const [popAberto, setPopAberto] = useState(false);

	// "/" foca a busca de qualquer lugar (fora de campos de texto)
	useEffect(() => {
		const aoTeclar = (e: KeyboardEvent) => {
			const alvo = e.target as HTMLElement | null;
			const digitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
			if (e.key === "/" && !digitando) {
				e.preventDefault();
				inputRef.current?.focus();
			}
		};
		window.addEventListener("keydown", aoTeclar);
		return () => window.removeEventListener("keydown", aoTeclar);
	}, []);

	// Clique fora fecha dropdown e popover
	useEffect(() => {
		const aoClicar = (e: MouseEvent) => {
			if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
				busca.abrir(false);
				setPopAberto(false);
			}
		};
		document.addEventListener("mousedown", aoClicar);
		return () => document.removeEventListener("mousedown", aoClicar);
	}, [busca]);

	return (
		<div ref={raizRef} className={`pg-cmd${busca.aberto ? " pg-cmd--open" : ""}`}>
			<div className="pg-cmd__box">
				<button
					type="button"
					className="pg-scope"
					aria-haspopup="listbox"
					aria-label={`Alçada: ${busca.alcada}`}
					onClick={() => {
						busca.abrir(false);
						setPopAberto((v) => !v);
					}}
				>
					<span>{busca.alcada}</span>
					<PixelIcon name="chevd" size={12} />
				</button>
				<span className="pg-cmd__p">&gt;</span>
				<input
					ref={inputRef}
					className="pg-cmd__in"
					placeholder="nome do político"
					autoComplete="off"
					role="combobox"
					aria-expanded={busca.aberto}
					aria-controls="pg-sd"
					aria-label="Buscar político"
					value={busca.q}
					onFocus={() => {
						setPopAberto(false);
						busca.abrir(true);
					}}
					onChange={(e) => busca.setQ(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Tab" && !e.shiftKey && !busca.aberto) return;
						if (e.key === "Tab") {
							e.preventDefault();
							setPopAberto(true);
							busca.abrir(false);
							return;
						}
						busca.onKeyDown(e);
					}}
				/>
				<span className="pg-kbd" aria-hidden="true">
					/
				</span>
				<button type="button" className="pg-cmd__go" disabled={!busca.q.trim()} onClick={() => (busca.itens[0] ? busca.escolher(busca.itens[0]) : busca.buscarAoVivo())}>
					Buscar
				</button>
			</div>
			{busca.aberto ? (
				<div id="pg-sd" className="pg-sd" role="listbox">
					<ResultadosBusca busca={busca} />
					<div className="pg-sd__foot">
						<span>
							<b>↑↓</b> navegar
						</span>
						<span>
							<b>↵</b> abrir
						</span>
						<span>
							<b>esc</b> fechar
						</span>
						<span>
							<b>tab</b> alçada
						</span>
						<span style={{ marginLeft: "auto" }}>
							Alçada: <b>{busca.alcada}</b>
						</span>
					</div>
				</div>
			) : null}
			{popAberto ? (
				<PopoverAlcada
					atual={busca.alcada}
					onEscolher={(a) => {
						busca.setAlcada(a);
						setPopAberto(false);
						inputRef.current?.focus();
					}}
				/>
			) : null}
		</div>
	);
}
