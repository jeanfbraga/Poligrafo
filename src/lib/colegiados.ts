/* ==========================================================================
   Comissões e frentes parlamentares: busca e filtro por tema.
   ========================================================================== */
import { type ComissaoFormatada, type FrenteFormatada, formatarComissao, formatarNomeFrente } from "@/lib/parlamentar-utils";

export type TemaFiltro = "todos" | string;

function contem(texto: string | undefined, termo: string): boolean {
	return (texto ?? "").toLowerCase().includes(termo);
}

export function frentesFormatadas(frentes: unknown[] | null | undefined): FrenteFormatada[] {
	return (frentes ?? [])
		.filter(Boolean)
		.map(formatarNomeFrente)
		.sort((a, b) => a.label.localeCompare(b.label));
}

export function comissoesFormatadas(comissoes: unknown[] | null | undefined): ComissaoFormatada[] {
	return (comissoes ?? [])
		.filter(Boolean)
		.map(formatarComissao)
		.sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.nome.localeCompare(b.nome));
}

/** Frentes de um tema (ou todas) que casam com o texto digitado (nome, sigla ou tema). */
export function filtrarFrentes(frentes: FrenteFormatada[], tema: TemaFiltro, busca: string): FrenteFormatada[] {
	const termo = busca.trim().toLowerCase();
	return frentes.filter((f) => {
		if (tema !== "todos" && f.tema !== tema) return false;
		return !termo || contem(f.label, termo) || contem(f.raw, termo) || contem(f.sigla, termo) || contem(f.tema, termo);
	});
}

export function filtrarComissoes(comissoes: ComissaoFormatada[], busca: string): ComissaoFormatada[] {
	const termo = busca.trim().toLowerCase();
	if (!termo) return comissoes;
	return comissoes.filter((c) => contem(c.nome, termo) || contem(c.raw, termo) || contem(c.sigla, termo) || contem(c.cargo, termo));
}

export interface ContagemTema {
	tema: string;
	quantidade: number;
}

/** Temas com ao menos uma frente (para os chips de filtro), do maior para o menor. */
export function contagemPorTema(frentes: FrenteFormatada[]): ContagemTema[] {
	const mapa = new Map<string, number>();
	for (const f of frentes) mapa.set(f.tema, (mapa.get(f.tema) ?? 0) + 1);
	return [...mapa.entries()].map(([tema, quantidade]) => ({ tema, quantidade })).sort((a, b) => b.quantidade - a.quantidade || a.tema.localeCompare(b.tema));
}
