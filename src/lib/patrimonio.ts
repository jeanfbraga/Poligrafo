/* ==========================================================================
   Patrimônio declarado (TSE): composição por tipo de bem.
   O TSE usa ~80 tipos ("Outros bens imóveis", "Fundos: Ações, Mútuos…").
   Para o leitor, eles viram 6 categorias e um ranking dos maiores bens.
   ========================================================================== */

export interface BemItem {
	descricao?: string;
	descricaoDeTipoDeBem?: string;
	tipoBem?: string;
	valor?: number;
}

export type CategoriaBem = "imoveis" | "veiculos" | "aplicacoes" | "participacoes" | "dinheiro" | "outros";

export const ROTULO_CATEGORIA: Record<CategoriaBem, string> = {
	imoveis: "Imóveis",
	veiculos: "Veículos",
	aplicacoes: "Aplicações e fundos",
	participacoes: "Participações em empresas",
	dinheiro: "Dinheiro e contas",
	outros: "Outros bens",
};

/** Ordem importa: "Fundos: Ações…" é aplicação, não participação societária. */
const REGRAS: readonly [CategoriaBem, RegExp][] = [
	["aplicacoes", /fundo|cdb|rdb|poupanc|investiment|aplicac|titulo|renda fixa|\blci\b|\blca\b|previd|consorcio|seguro/],
	["participacoes", /participac|quota|quinh|acoes|capital social|empresa/],
	["veiculos", /veicul|automovel|moto|caminh|embarcac|aeronave|barco|lancha/],
	["imoveis", /terreno|casa|apartamento|sala|loja|galpa|imovel|imoveis|terra nua|predio|benfeitoria|fazenda|sitio|rural|urbano/],
	["dinheiro", /dinheiro|deposito|conta corrente|moeda|especie|saldo/],
];

function normalizar(texto: string): string {
	return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function categoriaDoBem(tipo?: string | null): CategoriaBem {
	const t = normalizar(String(tipo ?? ""));
	return REGRAS.find(([, re]) => re.test(t))?.[0] ?? "outros";
}

export interface GrupoBens {
	categoria: CategoriaBem;
	rotulo: string;
	total: number;
	quantidade: number;
	/** Parte do total dos bens listados (0–100). */
	percentual: number;
}

const valorDe = (b: BemItem): number => Number(b.valor ?? 0) || 0;

/** Categorias com bens, da maior para a menor soma. */
export function agruparBens(bens: BemItem[]): GrupoBens[] {
	const soma = bens.reduce((s, b) => s + valorDe(b), 0);
	const porCategoria = new Map<CategoriaBem, { total: number; quantidade: number }>();
	for (const b of bens) {
		const cat = categoriaDoBem(b.descricaoDeTipoDeBem || b.tipoBem);
		const atual = porCategoria.get(cat) ?? { total: 0, quantidade: 0 };
		porCategoria.set(cat, { total: atual.total + valorDe(b), quantidade: atual.quantidade + 1 });
	}
	return [...porCategoria.entries()]
		.map(([categoria, g]) => ({ categoria, rotulo: ROTULO_CATEGORIA[categoria], total: g.total, quantidade: g.quantidade, percentual: soma > 0 ? (g.total / soma) * 100 : 0 }))
		.sort((a, b) => b.total - a.total);
}

/** Os N bens de maior valor. */
export function maioresBens(bens: BemItem[], n: number): BemItem[] {
	return [...bens].sort((a, b) => valorDe(b) - valorDe(a)).slice(0, n);
}
