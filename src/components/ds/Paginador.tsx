"use client";

import { useCallback, useMemo, useState } from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";

export interface PaginaApi<T> {
	pagina: number;
	paginas: number;
	fatia: T[];
	total: number;
	/** 1-based: primeiro e último item exibidos. */
	de: number;
	ate: number;
	proxima: () => void;
	anterior: () => void;
	reset: () => void;
}

/** Paginação em memória. A página é limitada ao intervalo válido quando a lista encolhe. */
export function usePagina<T>(itens: T[], porPagina = 10): PaginaApi<T> {
	const [bruta, setBruta] = useState(1);
	const total = itens.length;
	const paginas = Math.max(1, Math.ceil(total / porPagina));
	const pagina = Math.min(bruta, paginas);
	const fatia = useMemo(() => itens.slice((pagina - 1) * porPagina, pagina * porPagina), [itens, pagina, porPagina]);
	const proxima = useCallback(() => setBruta(Math.min(paginas, pagina + 1)), [paginas, pagina]);
	const anterior = useCallback(() => setBruta(Math.max(1, pagina - 1)), [pagina]);
	const reset = useCallback(() => setBruta(1), []);
	return {
		pagina,
		paginas,
		fatia,
		total,
		de: total === 0 ? 0 : (pagina - 1) * porPagina + 1,
		ate: Math.min(pagina * porPagina, total),
		proxima,
		anterior,
		reset,
	};
}

/** Rodapé de paginação: "1–10 de 40" e botões ‹ ›. Some quando cabe numa página só. */
export function Paginador<T>({ p }: { p: PaginaApi<T> }) {
	if (p.paginas <= 1) return null;
	return (
		<div className="pg-pager">
			<span>
				{p.de}–{p.ate} de {p.total}
			</span>
			<span style={{ display: "flex", gap: 6 }}>
				<button type="button" className="pg-btn pg-btn--icon" style={{ height: 28 }} aria-label="Página anterior" disabled={p.pagina === 1} onClick={p.anterior}>
					<PixelIcon name="back" size={12} />
				</button>
				<button type="button" className="pg-btn pg-btn--icon" style={{ height: 28 }} aria-label="Próxima página" disabled={p.pagina >= p.paginas} onClick={p.proxima}>
					<PixelIcon name="chev" size={12} />
				</button>
			</span>
		</div>
	);
}
