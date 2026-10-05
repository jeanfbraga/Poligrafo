/* ==========================================================================
   Votos nominais em plenário — texto e sentido do voto. Puro (tela e dossiê).
   ========================================================================== */

/** O nome da votação vem com o placar colado ("... Sim: 300; Não: 100"): fica só o projeto. */
export function limparNomeProjeto(nome?: string): string {
	if (!nome) return "Votação sem nome";
	return nome.split(/\.\s*Sim:/i)[0];
}

export type SentidoVoto = "sim" | "nao" | "outro";

export function sentidoDoVoto(voto?: string): SentidoVoto {
	const v = voto?.trim().toLowerCase();
	if (v === "sim") return "sim";
	if (v === "não" || v === "nao") return "nao";
	return "outro";
}

/**
 * Proposição principal do voto. O id da votação na Câmara é "{idProposicaoPrincipal}-{seq}"
 * (ex.: "2580259-24" → PLP 230/2025); já `id_proposicao` costuma apontar para o parecer ou a
 * emenda votada (ex.: um PEP). Sem o padrão, cai no `id_proposicao`.
 */
export function idProposicaoPrincipal(v: { id_votacao?: unknown; id_proposicao?: unknown }): string | null {
	const m = /^(\d+)-\d+$/.exec(String(v.id_votacao ?? ""));
	if (m) return m[1];
	const id = String(v.id_proposicao ?? "");
	return /^\d+$/.test(id) ? id : null;
}

/** Ficha de tramitação da proposição na Câmara (traz o inteiro teor e todo o histórico). */
export function urlFichaCamara(idProposicao: string | number): string {
	return `https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=${encodeURIComponent(String(idProposicao))}`;
}
