/**
 * Deputados estaduais em exercício pelas bases das próprias assembleias no Banco de
 * Perfil: `alerj_deputados` (DOCIGP) e `alesp_deputados` (dados abertos da ALESP).
 *
 * A busca de candidatos de SP e RJ só consultava o DivulgaCand ao vivo, que recusa a
 * Vercel (403), e a base tse_eleitos não tem quem o TSE marca "NÃO ELEITO" (Rodrigo
 * Bacellar, presidente da ALERJ, em 12/10/2026): em produção "Nenhum político
 * encontrado". A lista da assembleia diz quem recebe verba de gabinete hoje.
 */
import { escolherPorNome, nomesBatem } from "@/lib/nome-parlamentar";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export type CasaEstadual = "ALERJ" | "ALESP";

export interface CandidatoAssembleia<C extends CasaEstadual = CasaEstadual> {
	ref: string;
	id: string;
	nome: string;
	cargo: string;
	uf: string;
	casa: C;
}

interface LinhaDeputado {
	deputado: string;
	ultimo_ano: number;
}

const CASAS: Record<CasaEstadual, { visao: string; uf: string }> = {
	ALERJ: { visao: "alerj_deputados", uf: "RJ" },
	ALESP: { visao: "alesp_deputados", uf: "SP" },
};

type ClienteSupabase = Pick<typeof supabasePerfilAdmin, "from">;

/** "Rodrigo Da Silva Bacellar (Rodrigo Bacellar)" → ["…civil…", "…urna…"]. */
function formas(nome: string): string[] {
	const apelido = nome.match(/\(([^)]+)\)/)?.[1];
	return [nome.replace(/\s*\([^)]*\)\s*/g, " ").trim(), apelido].filter((x): x is string => Boolean(x));
}

function bateComBusca(nomeCasa: string, busca: string): boolean {
	return formas(nomeCasa).some((f) => nomesBatem(f, busca));
}

/** Candidato no formato de ref que o pipe já entende (sem documento: a assembleia não publica CPF). */
export function candidatoDaAssembleia<C extends CasaEstadual>(casa: C, deputado: string): CandidatoAssembleia<C> {
	const [civil] = formas(deputado);
	const nome = civil.toUpperCase();
	const uf = CASAS[casa].uf;
	return { ref: `${casa}:DEPUTADO_ESTADUAL:${encodeURIComponent(nome)}:`, id: nome, nome: deputado.toUpperCase(), cargo: `Deputado Estadual (${uf})`, uf, casa };
}

/** Deputados com verba no ano passado ou neste e com o nome buscado. Base fora do ar: []. */
export async function deputadosDaAssembleiaNaBase<C extends CasaEstadual>(
	casa: C,
	busca: string,
	agora = new Date(),
	cliente: ClienteSupabase = supabasePerfilAdmin,
): Promise<CandidatoAssembleia<C>[]> {
	const { data, error } = await cliente.from(CASAS[casa].visao).select("deputado,ultimo_ano");
	if (error) {
		console.warn(`[${casa}] Lista de deputados indisponível (${error.message}); seguindo sem ela.`);
		return [];
	}
	const recentes = ((data ?? []) as LinhaDeputado[]).filter((d) => d.ultimo_ano >= agora.getFullYear() - 1);
	const batem = recentes.filter((d) => bateComBusca(d.deputado, busca));
	// Com um nome exato entre vários parecidos, fica só ele (mesma regra das despesas).
	const exato = escolherPorNome(batem, busca, (d) => d.deputado);
	return (exato ? [exato] : batem).slice(0, 5).map((d) => candidatoDaAssembleia(casa, d.deputado));
}

/**
 * Junta o resultado do TSE ao vivo (com CPF, quando responde) com o da assembleia,
 * sem repetir a mesma pessoa: o do TSE vence, porque traz o documento.
 */
export function juntarCandidatosEstaduais<T extends { nome: string }>(doTse: T[], daBase: T[]): T[] {
	const novos = daBase.filter((b) => !doTse.some((t) => formas(t.nome).some((f) => bateComBusca(b.nome, f))));
	return [...doTse, ...novos];
}
