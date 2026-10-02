"use client";

import { useEffect, useRef } from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";
import { ALCADA_PADRAO, NOMES_UF, UFS } from "@/lib/busca";
import { ResultadosBusca } from "./ResultadosBusca";
import { useBusca } from "./useBusca";

/** Busca em tela cheia (mobile): campo grande, alçadas em chips e resultados em linhas de 60px. */
export function MobileSearchOverlay({ onFechar }: { onFechar: () => void }) {
	const busca = useBusca(onFechar);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		busca.abrir(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const aoTeclar = (e: KeyboardEvent) => {
			if (e.key === "Escape") onFechar();
		};
		window.addEventListener("keydown", aoTeclar);
		return () => window.removeEventListener("keydown", aoTeclar);
	}, [onFechar]);

	return (
		<div className="pg-mover" role="dialog" aria-modal="true" aria-label="Buscar político">
			<div className="pg-mover__h">
				<button type="button" className="pg-btn pg-btn--icon" aria-label="Fechar busca" onClick={onFechar}>
					<PixelIcon name="back" size={16} />
				</button>
				<div className="pg-mover__in">
					<input
						ref={inputRef}
						placeholder="nome do político"
						autoComplete="off"
						aria-label="Nome do político"
						value={busca.q}
						onChange={(e) => busca.setQ(e.target.value)}
						onKeyDown={busca.onKeyDown}
					/>
				</div>
			</div>
			<div className="pg-mscopes" role="group" aria-label="Alçada">
				<button type="button" aria-pressed={busca.alcada === ALCADA_PADRAO} onClick={() => busca.setAlcada(ALCADA_PADRAO)}>
					FEDERAL
				</button>
				{UFS.map((u) => (
					<button key={u} type="button" title={NOMES_UF[u]} aria-pressed={busca.alcada === u} onClick={() => busca.setAlcada(u)}>
						{u}
					</button>
				))}
			</div>
			<div className="pg-mover__res" role="listbox">
				<ResultadosBusca busca={busca} />
			</div>
		</div>
	);
}
