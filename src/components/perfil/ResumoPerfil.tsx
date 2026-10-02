"use client";

import type { ItemResumo } from "@/lib/perfil-resumo";

export function irParaSecao(id: string) {
	document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Cinco números "de relance" logo abaixo da identidade; cada um leva à seção que o detalha. */
export function ResumoPerfil({ itens }: { itens: ItemResumo[] }) {
	return (
		<div className="pg-resumo" role="list" aria-label="Resumo do perfil">
			{itens.map((i) => (
				<button key={i.key} type="button" role="listitem" className="pg-resumo__item" onClick={() => irParaSecao(i.secao)} title={`Ir para ${i.label}`}>
					<span className="pg-label">{i.label}</span>
					<b>{i.valor}</b>
					<small>{i.sub}</small>
				</button>
			))}
		</div>
	);
}
