/**
 * Busca de candidatos (modo sem ref): quem é o político que o usuário digitou?
 *
 * Só quem tem mandato no período atual (e presidentes), pela janela de mandato
 * (src/lib/janela-mandato.ts, decisão de 12/10/2026). Fontes, todas nossas ou oficiais
 * que respondem à Vercel — o TSE ao vivo (DivulgaCand) recusa servidores de nuvem:
 *  - Câmara e Senado (legislatura vigente);
 *  - base de eleitos `tse_eleitos` (governadores, assembleias, prefeitos e vereadores
 *    das 27 UFs), já filtrada pela janela e sem suplentes que nunca assumiram;
 *  - em SP e RJ, a lista da própria assembleia, que marca quem saiu no mandato.
 *
 * A lista volta ordenada pela cobertura do nome (e UF igual à pedida); quem saiu no
 * meio do mandato (cassado, afastado) fica atrás de quem está no exercício.
 * Funções pequenas e dependências injetáveis (testes sem rede).
 */
import { normalizeString } from "@/app/api/investigar/tse";
import { legislaturaVigente } from "@/lib/janela-mandato";
import { juntarComAssembleia } from "@/services/integrations/assembleias/deputados-base";

export interface Candidato {
	id?: string;
	uri?: string;
	nome: string;
	uf?: string;
	casa?: string;
	cargo?: string;
	ref: string;
	idLegislatura?: number;
	cpfOuCnpj?: string | null;
	isCnpj?: boolean;
	[k: string]: unknown;
}

export interface DependenciasBusca {
	camara: (nome: string, uf: string | null) => Promise<any[]>;
	senado: (nome: string) => Promise<any[]>;
	/** Listas das assembleias de SP e RJ (incluem quem saiu no mandato, marcado). */
	alesp: (nome: string) => Promise<any[]>;
	alerj: (nome: string) => Promise<any[]>;
	/** Base `tse_eleitos` do Banco de Perfil, já na janela de mandato. null = base indisponível. */
	eleitos?: (nome: string, uf: string | null, cargos?: string[]) => Promise<Candidato[] | null>;
	status: (msg: string) => void;
}

export interface ParametrosBusca {
	nome: string;
	uf: string | null;
	cargo: string;
	/** Usuário escolheu explicitamente a alçada FEDERAL. */
	somenteFederal: boolean;
	/** Ref de governador sugerida por correção de nome (ex.: "tarcisio"). */
	refGovernadorSugerida?: string;
}

export interface ResultadoBusca {
	candidatos: Candidato[];
	/** Alguma fonte falhou (ou a base de eleitos está fora do ar): lista vazia não é "fora da janela". */
	houveErroApi: boolean;
}

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e"]);
/** Legislatura vigente da Câmara (57ª: 2023–2027), pela janela de mandato. */
export const LEGISLATURA_ATUAL = legislaturaVigente();

const deLegislaturaPassada = (c: Candidato) => c.casa === "CAMARA" && c.idLegislatura !== undefined && c.idLegislatura < LEGISLATURA_ATUAL;

/**
 * No exercício do mandato hoje? Quem saiu no meio do mandato (emExercicio false, ex.:
 * cassado) continua na busca, mas atrás de quem está no exercício.
 */
export function mandatoAtual(c: Candidato): boolean {
	if (c.suplente === true || c.emExercicio === false) return false;
	return !deLegislaturaPassada(c);
}

/** Entra na lista: mandato no período atual. Fora: deputado de legislatura passada e suplente que não assumiu. */
export function naJanelaDaBusca(c: Candidato): boolean {
	return c.suplente !== true && !deLegislaturaPassada(c);
}

function tokens(nome: string): string[] {
	return normalizeString(nome)
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((t) => t && !PALAVRAS_VAZIAS.has(t));
}

/** Fração das palavras buscadas presentes (inteiras) no nome do candidato. */
export function coberturaNome(buscado: string, candidato: string): number {
	const alvo = tokens(buscado);
	if (alvo.length === 0) return 0;
	const doCandidato = new Set(tokens(candidato));
	return alvo.filter((t) => doCandidato.has(t)).length / alvo.length;
}

/** "ANDRE LUIS DO PRADO (ANDRÉ DO PRADO)" → nome civil e nome de urna. */
function variantesNome(nome: string): string[] {
	const urna = nome.match(/\(([^)]+)\)/)?.[1];
	const civil = nome.replace(/\s*\([^)]*\)\s*/g, " ").trim();
	return [civil, urna].filter((v): v is string => Boolean(v)).map(normalizeString);
}

/** Cobertura das palavras (peso 2) + nome exato (civil ou urna) + mesma UF; fora do exercício vai para trás. */
function pontuacao(c: Candidato, nome: string, uf: string | null): number {
	const exato = variantesNome(c.nome).includes(normalizeString(nome)) ? 0.5 : 0;
	const mesmaUf = uf && c.uf === uf ? 0.25 : 0;
	const foraDoExercicio = mandatoAtual(c) ? 0 : 1;
	return coberturaNome(nome, c.nome) * 2 + exato + mesmaUf - foraDoExercicio;
}

/** Uma linha por ref; a Câmara devolve uma por legislatura — fica a mais recente. */
function semRepetir(lista: Candidato[]): Candidato[] {
	const porRef = new Map<string, Candidato>();
	for (const c of lista) {
		const atual = porRef.get(c.ref);
		if (!atual || (c.idLegislatura ?? 0) > (atual.idLegislatura ?? 0)) porRef.set(c.ref, c);
	}
	return [...porRef.values()];
}

/** Ordena pela cobertura do nome (e UF igual) e remove refs repetidas. */
export function ordenarCandidatos(lista: Candidato[], nome: string, uf: string | null): Candidato[] {
	const unicos = semRepetir(lista);
	return unicos
		.map((c, i) => ({ c, i, p: pontuacao(c, nome, uf) }))
		.sort((a, b) => b.p - a.p || a.i - b.i)
		.map((x) => x.c);
}

async function coletar(promessas: Promise<Candidato[]>[]): Promise<{ lista: Candidato[]; erro: boolean }> {
	const res = await Promise.allSettled(promessas);
	const lista = res.flatMap((r) => (r.status === "fulfilled" ? r.value ?? [] : []));
	return { lista, erro: res.some((r) => r.status === "rejected") };
}

/** Cargo pedido explicitamente na URL → código do TSE na base de eleitos. */
const EXECUTIVOS: Record<string, string> = { GOVERNADOR: "3", PREFEITO: "11" };

/** Consulta a base de eleitos; sem a dependência, ou sem resposta, devolve null. */
async function daBaseEleitos(deps: DependenciasBusca, nome: string, uf: string | null, cargos?: string[]): Promise<Candidato[] | null> {
	if (!deps.eleitos) return null;
	try {
		return await deps.eleitos(nome, uf, cargos);
	} catch {
		return null;
	}
}

function resultado(lista: Candidato[], p: ParametrosBusca, erro: boolean): ResultadoBusca {
	return { candidatos: ordenarCandidatos(lista.filter(naJanelaDaBusca), p.nome, p.uf), houveErroApi: erro };
}

/** Governador/prefeito pedidos explicitamente: só a base de eleitos, no cargo pedido. */
async function buscarExecutivo(p: ParametrosBusca, deps: DependenciasBusca): Promise<ResultadoBusca> {
	const daBase = await daBaseEleitos(deps, p.nome, p.uf, [EXECUTIVOS[p.cargo]]);
	return resultado(daBase ?? [], p, daBase === null);
}

function federais(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]>[] {
	return [
		deps.camara(p.nome, p.uf).then((l) => (l ?? []).map((c) => ({ ...c, ref: `FEDERAL:CAMARA:${c.id}`, cargo: "Deputado Federal" }))),
		deps.senado(p.nome).then((l) => (l ?? []).map((c) => ({ ...c, ref: `FEDERAL:SENADO:${c.id}`, cargo: "Senador da República" }))),
	];
}

/** Lista da assembleia (SP e RJ): quem saiu no mandato só aparece por ela. */
function daAssembleia(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]>[] {
	if (p.uf === "SP") return [deps.alesp(p.nome)];
	if (p.uf === "RJ") return [deps.alerj(p.nome)];
	return [];
}

/** Ref de governador sugerida pela correção de nome ("tarcisio"): o governador da UF na base. */
async function governadorSugerido(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]> {
	if (!p.refGovernadorSugerida) return [];
	const [, ufRef, nomeRef] = p.refGovernadorSugerida.split(":");
	const uf = ufRef || p.uf;
	const nome = nomeRef || p.nome;
	deps.status(`Buscando Governador "${nome}" na base de eleitos (${uf ?? "BR"})...`);
	return (await daBaseEleitos(deps, nome, uf, [EXECUTIVOS.GOVERNADOR])) ?? [];
}

/** Estadual e municipal: base de eleitos + lista da assembleia (SP/RJ). */
async function estaduaisEMunicipais(p: ParametrosBusca, deps: DependenciasBusca) {
	if (p.somenteFederal) return { lista: [] as Candidato[], erro: false };
	const [daBase, assembleia] = await Promise.all([daBaseEleitos(deps, p.nome, p.uf), coletar(daAssembleia(p, deps))]);
	return { lista: juntarComAssembleia(daBase ?? [], assembleia.lista), erro: daBase === null || assembleia.erro };
}

async function buscarLegislativosEMunicipais(p: ParametrosBusca, deps: DependenciasBusca): Promise<ResultadoBusca> {
	deps.status(`Buscando nas esferas Federal${p.uf && !p.somenteFederal ? `, Estadual e Municipal (${p.uf})` : ""}...`);
	const [federal, locais] = await Promise.all([coletar(federais(p, deps)), estaduaisEMunicipais(p, deps)]);
	let lista = [...federal.lista, ...locais.lista];
	if (lista.length === 0) lista = await governadorSugerido(p, deps);
	return resultado(lista, p, federal.erro || locais.erro);
}

export async function buscarCandidatos(p: ParametrosBusca, deps: DependenciasBusca): Promise<ResultadoBusca> {
	if (EXECUTIVOS[p.cargo]) return buscarExecutivo(p, deps);
	return buscarLegislativosEMunicipais(p, deps);
}
