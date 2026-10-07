/**
 * Consulta à base `tse_eleitos` (BANCO DE PERFIL), carregada do CSV nacional do
 * TSE por scripts/etl/tse-eleitos-sync.ts. Ver nota 31 do Obsidian.
 *
 * Serve para achar prefeitos, vereadores, deputados estaduais e governadores
 * das 27 UFs numa consulta só, sem varrer centenas de municípios no
 * DivulgaCand (que bloqueou o IP local com 403 em 06/10/2026).
 *
 * Base fora do ar ou tabela ainda não criada (migração não rodada): as funções
 * devolvem null e o pipe segue pelo caminho antigo.
 */
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";
import { cpfValido, soDigitos } from "@/lib/documento";
import { casaDoVereador } from "@/services/core/alcada";
import type { Candidato } from "@/services/core/busca-candidatos";

export interface Eleito {
	sq_candidato: string;
	ano_eleicao: number;
	cd_cargo: string;
	ds_cargo: string | null;
	sg_uf: string;
	nm_ue: string | null;
	municipio_slug: string | null;
	cd_municipio_ibge: string | null;
	nm_candidato: string;
	nm_urna_candidato: string | null;
	nr_cpf_candidato: string | null;
	sg_partido: string | null;
	ds_sit_tot_turno: string | null;
}

/** Prefixo do número do candidato na ref, para nunca ser confundido com CPF. */
export const PREFIXO_SQ = "SQ-";

/** "SQ-250001234567" → "250001234567"; qualquer outra coisa → null. */
export function sqDaRef(valor: unknown): string | null {
	const s = String(valor ?? "");
	return s.startsWith(PREFIXO_SQ) && /^\d+$/.test(s.slice(PREFIXO_SQ.length)) ? s.slice(PREFIXO_SQ.length) : null;
}

const COLUNAS = "sq_candidato,ano_eleicao,cd_cargo,ds_cargo,sg_uf,nm_ue,municipio_slug,cd_municipio_ibge,nm_candidato,nm_urna_candidato,nr_cpf_candidato,sg_partido,ds_sit_tot_turno";
/** Cargos procurados na busca: governador, dep. estadual/distrital, prefeito, vereador. */
export const CARGOS_BUSCA = ["3", "7", "8", "11", "13"];
const LIMITE_BUSCA = 30;
const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Palavras do nome sem acento, em minúsculas (como em `nomes_busca`). */
export function palavrasBusca(nome: string): string[] {
	return nome
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((p) => p.length > 1 && !PALAVRAS_VAZIAS.has(p));
}

export function ufValida(uf: string | null | undefined): uf is string {
	return Boolean(uf && /^[A-Z]{2}$/.test(uf) && uf !== "BR");
}

type ClienteSupabase = Pick<typeof supabasePerfilAdmin, "from">;

let avisouIndisponivel = false;
/** Testes: o aviso de base indisponível sai uma vez por processo. */
export function reiniciarAvisoEleitos() {
	avisouIndisponivel = false;
}
function avisar(mensagem: string) {
	if (!avisouIndisponivel) console.warn(`[TSE ELEITOS] Base indisponível (${mensagem}); seguindo sem ela.`);
	avisouIndisponivel = true;
}

/**
 * Eleitos cujo nome civil ou de urna contém TODAS as palavras buscadas
 * (palavra inteira, em qualquer ordem). null = base indisponível.
 */
export async function buscarEleitosPorNome(
	nome: string,
	opcoes: { uf?: string | null; cargos?: string[] } = {},
	cliente: ClienteSupabase = supabasePerfilAdmin,
): Promise<Eleito[] | null> {
	const palavras = palavrasBusca(nome);
	if (palavras.length === 0) return [];
	let consulta = cliente.from("tse_eleitos").select(COLUNAS).in("cd_cargo", opcoes.cargos ?? CARGOS_BUSCA);
	for (const p of palavras) consulta = consulta.filter("nomes_busca", "imatch", `\\m${p}\\M`);
	if (ufValida(opcoes.uf)) consulta = consulta.eq("sg_uf", opcoes.uf);
	const { data, error } = await consulta.order("ano_eleicao", { ascending: false }).limit(LIMITE_BUSCA);
	if (error) {
		avisar(error.message);
		return null;
	}
	return (data ?? []) as unknown as Eleito[];
}

/** O eleito do documento da ref: "SQ-…" (número do candidato) ou CPF válido. */
export async function buscarEleitoDaRef(doc: unknown, cliente: ClienteSupabase = supabasePerfilAdmin): Promise<Eleito | null> {
	const sq = sqDaRef(doc);
	const cpf = cpfValido(doc) ? soDigitos(doc) : null;
	if (!sq && !cpf) return null;
	const { data, error } = await cliente
		.from("tse_eleitos")
		.select(COLUNAS)
		.eq(sq ? "sq_candidato" : "nr_cpf_candidato", sq ?? cpf)
		.order("ano_eleicao", { ascending: false })
		.limit(1);
	if (error) {
		avisar(error.message);
		return null;
	}
	return ((data ?? [])[0] as unknown as Eleito) ?? null;
}

/** "SÃO JOÃO DE MERITI" → "São João de Meriti" (o CSV do TSE vem em maiúsculas). */
export function nomeLocal(nome: string | null): string {
	return String(nome ?? "")
		.toLowerCase()
		.split(" ")
		.map((p) => (PALAVRAS_VAZIAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
		.join(" ")
		.trim();
}

export interface AlvoEleito {
	id: unknown;
	cpfOficial?: string | null;
	/** Reserva por nome: só nome EXATO (civil ou de urna) + cargo + UF, com resultado único. */
	nome?: string | null;
	uf?: string | null;
	cargoTse?: string | null;
}

/** Eleito achado por nome: identidade média — o número do candidato serve, o CPF não é adotado. */
export type EleitoDoAlvo = Eleito & { porNome?: boolean };

function nomeExato(e: Eleito, nome: string): boolean {
	const alvo = palavrasBusca(nome).join(" ");
	return [e.nm_candidato, e.nm_urna_candidato].some((n) => n && palavrasBusca(n).join(" ") === alvo);
}

async function porNomeCargoUf(alvo: AlvoEleito, cliente: ClienteSupabase): Promise<EleitoDoAlvo | null> {
	if (!alvo.nome || !alvo.cargoTse || !ufValida(alvo.uf)) return null;
	const lista = await buscarEleitosPorNome(alvo.nome, { uf: alvo.uf, cargos: [alvo.cargoTse] }, cliente);
	const exatos = (lista ?? []).filter((e) => nomeExato(e, String(alvo.nome)));
	return exatos.length === 1 ? { ...exatos[0], porNome: true } : null;
}

/**
 * Eleito do alvo, nesta ordem: documento da ref (SQ- ou CPF); CPF oficial da
 * casa (deputado federal: a ref traz o id da Câmara); por último nome exato +
 * cargo + UF, se o resultado for único (senador: a API do Senado não dá CPF).
 */
export async function buscarEleitoDoAlvo(alvo: AlvoEleito, cliente: ClienteSupabase = supabasePerfilAdmin): Promise<EleitoDoAlvo | null> {
	const daRef = await buscarEleitoDaRef(alvo.id, cliente);
	if (daRef) return daRef;
	const porCpf = alvo.cpfOficial ? await buscarEleitoDaRef(alvo.cpfOficial, cliente) : null;
	return porCpf ?? porNomeCargoUf(alvo, cliente);
}

function documentoDaRef(e: Eleito): string {
	return e.nr_cpf_candidato || `${PREFIXO_SQ}${e.sq_candidato}`;
}

type Montador = (e: Eleito) => Pick<Candidato, "ref" | "casa" | "cargo" | "uri">;

/** SP e RJ têm caminho próprio no pipe (despesas da ALESP e do DOCIGP): mesmo formato de ref de alesp.ts/alerj.ts. */
const ASSEMBLEIA_PROPRIA: Record<string, "ALESP" | "ALERJ"> = { SP: "ALESP", RJ: "ALERJ" };

function deputadoEstadual(e: Eleito): ReturnType<Montador> {
	const propria = ASSEMBLEIA_PROPRIA[e.sg_uf];
	if (!propria) return { ref: `ESTADUAL:${e.sg_uf}:${documentoDaRef(e)}`, casa: "ASSEMBLEIA_LEGISLATIVA", cargo: "Deputado Estadual" };
	return {
		ref: `${propria}:DEPUTADO_ESTADUAL:${encodeURIComponent(e.nm_candidato.toUpperCase())}:${documentoDaRef(e)}`,
		casa: propria,
		cargo: `Deputado Estadual (${e.sg_uf})`,
	};
}

const MONTADORES: Record<string, Montador> = {
	"3": (e) => ({ ref: `GOVERNADOR:${e.sg_uf}:${e.nm_candidato}`, casa: "GOVERNO_ESTADUAL", cargo: "Governador de Estado" }),
	"7": deputadoEstadual,
	"8": (e) => ({ ref: `ESTADUAL:${e.sg_uf}:${documentoDaRef(e)}`, casa: "ASSEMBLEIA_LEGISLATIVA", cargo: "Deputado Distrital" }),
	"11": (e) => ({
		ref: `${e.sg_uf}:PREFEITO:${e.municipio_slug ?? ""}:${documentoDaRef(e)}`,
		casa: "PREFEITURA",
		cargo: `Prefeito de ${nomeLocal(e.nm_ue)}`.trim(),
		uri: e.municipio_slug ?? undefined,
	}),
	"13": (e) => ({
		ref: `${e.sg_uf}:VEREADOR:${e.municipio_slug ?? ""}:${documentoDaRef(e)}`,
		casa: casaDoVereador(e.municipio_slug),
		cargo: `Vereador em ${nomeLocal(e.nm_ue)}`.trim(),
		uri: e.municipio_slug ?? undefined,
	}),
};

/** Eleito → candidato da busca (ref no formato que o orquestrador já entende). */
export function eleitoParaCandidato(e: Eleito): Candidato | null {
	const montar = MONTADORES[e.cd_cargo];
	if (!montar) return null;
	const urnaDiferente = e.nm_urna_candidato && e.nm_urna_candidato !== e.nm_candidato;
	return {
		...montar(e),
		id: e.nr_cpf_candidato || e.sq_candidato,
		nome: urnaDiferente ? `${e.nm_candidato} (${e.nm_urna_candidato})` : e.nm_candidato,
		uf: e.sg_uf,
		idLegislatura: e.ano_eleicao,
		suplente: /suplente/i.test(e.ds_sit_tot_turno ?? ""),
		partido: e.sg_partido ?? undefined,
		fonteIdentidade: "tse_eleitos",
	};
}

/** Dependência `eleitos` da busca de candidatos. null = base indisponível. */
export async function candidatosDaBaseEleitos(nome: string, uf: string | null, cargos?: string[]): Promise<Candidato[] | null> {
	const eleitos = await buscarEleitosPorNome(nome, { uf, cargos });
	if (eleitos === null) return null;
	return eleitos.map(eleitoParaCandidato).filter((c): c is Candidato => c !== null);
}
