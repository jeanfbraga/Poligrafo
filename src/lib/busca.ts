/* ==========================================================================
   Busca global de políticos — lógica pura (sem React).
   Extraída do antigo SearchBar. Regras preservadas:
   - Alçada obrigatória (agora pré-selecionada em FEDERAL).
   - FEDERAL não filtra por UF; uma UF filtra pela sigla e exclui presidentes.
   - Todos os termos digitados precisam estar no nome (sem acento/caixa).
   ========================================================================== */
import congressoIndex from "@/services/integrations/data/congresso-index.json";
import municipaisIndex from "@/services/integrations/data/municipais-index.json";
import { normalizarNome, type PoliticoIndexado } from "@/lib/investigacao/alvo";

export const ALCADA_PADRAO = "FEDERAL";

export const UFS = [
	"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
	"PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const NOMES_UF: Record<string, string> = {
	AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
	DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso",
	MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
	PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
	RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
	SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

/** Presidentes (VIPs) não estão no índice do Congresso. */
export const VIPS: PoliticoIndexado[] = [
	{ id: "lula", nome: "Luiz Inácio Lula da Silva", casa: "PRESIDENCIA_DA_REPUBLICA", uf: "BR", partido: "PT", isPresidente: true },
	{ id: "bolsonaro", nome: "Jair Messias Bolsonaro", casa: "PRESIDENCIA_DA_REPUBLICA", uf: "BR", partido: "PL", isPresidente: true },
	{ id: "dilma", nome: "Dilma Vana Rousseff", casa: "PRESIDENCIA_DA_REPUBLICA", uf: "BR", partido: "PT", isPresidente: true },
	{ id: "temer", nome: "Michel Miguel Elias Temer Lulia", casa: "PRESIDENCIA_DA_REPUBLICA", uf: "BR", partido: "MDB", isPresidente: true },
];

export const INDICE_COMPLETO: PoliticoIndexado[] = [
	...VIPS,
	...(congressoIndex as PoliticoIndexado[]),
	...(municipaisIndex as PoliticoIndexado[]),
];

export function termosDe(q: string): string[] {
	return normalizarNome(q.trim()).split(/\s+/).filter(Boolean);
}

export function combinaComAlcada(p: PoliticoIndexado, alcada: string): boolean {
	if (!alcada || alcada === ALCADA_PADRAO) return true;
	if (p.isPresidente) return false;
	return p.uf === alcada;
}

/** Nomes que começam pelo primeiro termo vêm antes dos que apenas o contêm. */
function prioridade(nome: string, primeiroTermo: string): number {
	return normalizarNome(nome).startsWith(primeiroTermo) ? 0 : 1;
}

export function buscarPoliticos(
	q: string,
	alcada: string,
	indice: readonly PoliticoIndexado[] = INDICE_COMPLETO,
	limite = 8,
): PoliticoIndexado[] {
	const termos = termosDe(q);
	if (termos.length === 0) return [];
	const achados = indice.filter((p) => {
		const nome = normalizarNome(p.nome);
		return termos.every((t) => nome.includes(t)) && combinaComAlcada(p, alcada);
	});
	const unicos = Array.from(new Map(achados.map((p) => [String(p.id ?? p.nome), p])).values());
	return unicos
		.map((p, i) => ({ p, i }))
		.sort((a, b) => prioridade(a.p.nome, termos[0]) - prioridade(b.p.nome, termos[0]) || a.i - b.i)
		.slice(0, limite)
		.map(({ p }) => p);
}

export interface TrechoNome {
	texto: string;
	destaque: boolean;
}

/** Divide o nome em trechos para destacar o primeiro termo encontrado. */
export function destacarNome(nome: string, q: string): TrechoNome[] {
	const termos = termosDe(q);
	const norm = normalizarNome(nome);
	let melhor = -1;
	let tam = 0;
	for (const t of termos) {
		const i = norm.indexOf(t);
		if (i >= 0 && (melhor < 0 || i < melhor)) {
			melhor = i;
			tam = t.length;
		}
	}
	if (melhor < 0) return [{ texto: nome, destaque: false }];
	return [
		{ texto: nome.slice(0, melhor), destaque: false },
		{ texto: nome.slice(melhor, melhor + tam), destaque: true },
		{ texto: nome.slice(melhor + tam), destaque: false },
	].filter((t) => t.texto !== "");
}

const ABREVIACOES: Record<string, string> = {
	SOLIDARIEDADE: "SD",
	REPUBLICANOS: "REP",
	CIDADANIA: "CID",
	PATRIOTA: "PATRI",
	PROGRESSISTAS: "PP",
	PODEMOS: "PODE",
	"UNIÃO BRASIL": "UNIÃO",
};

export function abreviarPartido(p?: string): string {
	if (!p) return "—";
	const n = p.trim().toUpperCase();
	return ABREVIACOES[n] ?? n;
}

/** Rótulo do cargo/casa mostrado abaixo do nome. */
export function rotuloCargo(p: PoliticoIndexado): string {
	if (p.isPresidente) return "Presidência da República";
	const casas: Record<string, string> = {
		CAMARA: "Deputado federal · Câmara",
		SENADO: "Senador · Senado",
		CAMARA_MUNICIPAL: "Vereador · Câmara municipal",
		GOVERNO_ESTADUAL: "Governador",
		GOVERNADOR: "Governador",
		PREFEITO: "Prefeito",
		PREFEITURA: "Prefeito",
	};
	return casas[p.casa ?? ""] ?? p.cargo ?? "Político";
}

/* ---- recentes (localStorage) ---- */

export const CHAVE_RECENTES = "pg:recentes";
export const CHAVE_ALCADA = "pg:alcada";

export function mesclarRecente(atuais: PoliticoIndexado[], novo: PoliticoIndexado, max = 4): PoliticoIndexado[] {
	const chave = (p: PoliticoIndexado) => String(p.id ?? p.nome);
	return [novo, ...atuais.filter((p) => chave(p) !== chave(novo))].slice(0, max);
}
