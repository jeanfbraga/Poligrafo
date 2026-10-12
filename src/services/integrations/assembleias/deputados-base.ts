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
	/** false = sem verba de gabinete nos últimos meses da base (ex.: mandato cassado). */
	emExercicio?: boolean;
}

interface LinhaDeputado {
	deputado: string;
	ultimo_ano: number;
	/** Último mês com despesa (visão atualizada em 12/10/2026); ausente nas bases antigas. */
	ultimo_mes?: string | null;
}

/** Sem verba há mais que isto (contando do mês mais recente da base) = fora do exercício. */
const MESES_SEM_VERBA = 3;

function mesesEntre(de: string, ate: string): number {
	const [a, b] = [new Date(de), new Date(ate)];
	return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/** Exercício pelo último mês com verba; sem a coluna (base antiga), vale como antes. */
function emExercicio(d: LinhaDeputado, maisRecente: string | null): boolean {
	if (!d.ultimo_mes || !maisRecente) return true;
	return mesesEntre(d.ultimo_mes, maisRecente) <= MESES_SEM_VERBA;
}

function mesAno(data: string): string {
	const d = new Date(data);
	return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
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

/**
 * Candidato no formato de ref que o pipe já entende (sem documento: a assembleia não publica CPF).
 * Fora do exercício, o cargo diz desde quando não há verba (a busca põe atrás de quem está no mandato).
 */
export function candidatoDaAssembleia<C extends CasaEstadual>(casa: C, deputado: string, semVerbaDesde?: string): CandidatoAssembleia<C> {
	const [civil] = formas(deputado);
	const nome = civil.toUpperCase();
	const uf = CASAS[casa].uf;
	const base = { ref: `${casa}:DEPUTADO_ESTADUAL:${encodeURIComponent(nome)}:`, id: nome, nome: deputado.toUpperCase(), uf, casa };
	if (!semVerbaDesde) return { ...base, cargo: `Deputado Estadual (${uf})` };
	return { ...base, cargo: `Ex-deputado estadual (${uf}) — sem verba de gabinete desde ${mesAno(semVerbaDesde)}`, emExercicio: false };
}

function maisRecenteDaBase(linhas: LinhaDeputado[]): string | null {
	return linhas.reduce<string | null>((m, d) => (d.ultimo_mes && (!m || d.ultimo_mes > m) ? d.ultimo_mes : m), null);
}

/** Deputados com verba no ano passado ou neste e com o nome buscado. Base fora do ar: []. */
export async function deputadosDaAssembleiaNaBase<C extends CasaEstadual>(
	casa: C,
	busca: string,
	agora = new Date(),
	cliente: ClienteSupabase = supabasePerfilAdmin,
): Promise<CandidatoAssembleia<C>[]> {
	const { data, error } = await cliente.from(CASAS[casa].visao).select("deputado,ultimo_ano,ultimo_mes");
	if (error) {
		console.warn(`[${casa}] Lista de deputados indisponível (${error.message}); seguindo sem ela.`);
		return [];
	}
	const linhas = (data ?? []) as LinhaDeputado[];
	const maisRecente = maisRecenteDaBase(linhas);
	const recentes = linhas.filter((d) => d.ultimo_ano >= agora.getFullYear() - 1);
	const batem = recentes.filter((d) => bateComBusca(d.deputado, busca));
	// Com um nome exato entre vários parecidos, fica só ele (mesma regra das despesas).
	const exato = escolherPorNome(batem, busca, (d) => d.deputado);
	return (exato ? [exato] : batem)
		.slice(0, 5)
		.map((d) => candidatoDaAssembleia(casa, d.deputado, emExercicio(d, maisRecente) ? undefined : (d.ultimo_mes ?? undefined)));
}

/**
 * Junta o resultado do TSE ao vivo (com CPF, quando responde) com o da assembleia,
 * sem repetir a mesma pessoa: o do TSE vence, porque traz o documento.
 */
export function juntarCandidatosEstaduais<T extends { nome: string }>(doTse: T[], daBase: T[]): T[] {
	const novos = daBase.filter((b) => !doTse.some((t) => formas(t.nome).some((f) => bateComBusca(b.nome, f))));
	return [...doTse, ...novos];
}
