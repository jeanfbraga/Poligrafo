/**
 * Busca de candidatos (modo sem ref): quem é o político que o usuário digitou?
 *
 * Antes era uma cascata: Câmara/Senado primeiro e, só se viesse vazio,
 * assembleias e depois municípios. Qualquer parlamentar federal com nome
 * parecido "ganhava" — a matriz de alçadas de 06/10/2026 mostrou deputado
 * estadual de SP virando senador, de GO virando deputado federal e vereador
 * do Rio virando deputado federal.
 *
 * Agora:
 *  - federal e estadual da UF pedida rodam em paralelo;
 *  - a varredura municipal (cara) só roda se ninguém cobrir todas as
 *    palavras do nome buscado;
 *  - a lista volta ordenada pela cobertura do nome (e UF igual à pedida).
 *
 * Funções pequenas e dependências injetáveis (testes sem rede).
 */
import { normalizeString } from "@/app/api/investigar/tse";

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

type ResultadoTse = {
	documentoPrincipal?: string;
	cpf?: string;
	idTse?: number;
	idEleicao?: string;
	anoEleicao?: number;
	nome?: string;
	nomeUrna?: string | null;
	municipio?: string;
	isCnpj?: boolean;
} | null;

export interface DependenciasBusca {
	camara: (nome: string, uf: string | null) => Promise<any[]>;
	senado: (nome: string) => Promise<any[]>;
	tse: (nome: string, uf: string, cargo: string) => Promise<ResultadoTse>;
	alesp: (nome: string) => Promise<any[]>;
	alerj: (nome: string) => Promise<any[]>;
	municipal: (uf: string, nome: string) => Promise<any[]>;
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
	houveErroApi: boolean;
}

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e"]);
const UFS_SEM_UF_PADRAO = ["SP", "RJ", "PE", "CE", "PB", "SE"];

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

/**
 * Cobertura das palavras (peso 2) + nome exato (civil ou urna) + mesma UF.
 * Candidatura que só existe no TSE (ex.: candidato ao Senado em 2026) fica
 * atrás do mandato atual numa casa oficial — senão um deputado estadual
 * candidato a senador aparecia como "Senador".
 */
function pontuacao(c: Candidato, nome: string, uf: string | null): number {
	const exato = variantesNome(c.nome).includes(normalizeString(nome)) ? 0.5 : 0;
	const mesmaUf = uf && c.uf === uf ? 0.25 : 0;
	const soCandidatura = c.casa === "CANDIDATO_TSE" ? 1 : 0;
	return coberturaNome(nome, c.nome) * 2 + exato + mesmaUf - soCandidatura;
}

/** Ordena pela cobertura do nome (e UF igual) e remove refs repetidas. */
export function ordenarCandidatos(lista: Candidato[], nome: string, uf: string | null): Candidato[] {
	const unicos = Array.from(new Map(lista.map((c) => [c.ref, c])).values());
	return unicos
		.map((c, i) => ({ c, i, p: pontuacao(c, nome, uf) }))
		.sort((a, b) => b.p - a.p || a.i - b.i)
		.map((x) => x.c);
}

/**
 * Melhor cobertura entre mandatos em casas oficiais. Candidatura que só existe
 * no TSE não conta: um vereador candidato a deputado federal em 2026 fazia a
 * busca municipal ser pulada e ele aparecia como "Deputado Federal".
 */
function melhorCobertura(lista: Candidato[], nome: string): number {
	return lista
		.filter((c) => c.casa !== "CANDIDATO_TSE")
		.reduce((m, c) => Math.max(m, coberturaNome(nome, c.nome)), 0);
}

function urlTse(t: NonNullable<ResultadoTse>, uf: string): string {
	return `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${t.anoEleicao}/${t.idEleicao}/${uf}/${t.idTse}`;
}

function candidatoTse(t: ResultadoTse, uf: string, nome: string, casa: string, cargo: string, ref: (doc: string) => string): Candidato[] {
	if (!t) return [];
	const doc = String(t.documentoPrincipal || t.idTse || "");
	return [{
		id: doc,
		uri: urlTse(t, uf),
		nome: t.nomeUrna || t.nome || nome,
		uf,
		casa,
		cargo,
		ref: ref(doc),
		cpfOuCnpj: t.documentoPrincipal,
		isCnpj: t.isCnpj,
	}];
}

async function coletar(promessas: Promise<Candidato[]>[]): Promise<{ lista: Candidato[]; erro: boolean }> {
	const res = await Promise.allSettled(promessas);
	const lista = res.flatMap((r) => (r.status === "fulfilled" ? r.value ?? [] : []));
	return { lista, erro: res.some((r) => r.status === "rejected") };
}

interface PerfilExecutivo {
	cargoTse: string;
	casa: string;
	cargo: string;
	ref: (uf: string, nome: string, municipio: string, doc: string) => string;
}

const EXECUTIVOS: Record<string, PerfilExecutivo> = {
	GOVERNADOR: {
		cargoTse: "3",
		casa: "GOVERNO_ESTADUAL",
		cargo: "Governador de Estado",
		ref: (uf, nome) => `GOVERNADOR:${uf}:${nome}`,
	},
	PREFEITO: {
		cargoTse: "11",
		casa: "PREFEITURA",
		cargo: "Prefeito Municipal",
		ref: (uf, _nome, municipio, doc) => `${uf}:PREFEITO:${municipio}:${doc}`,
	},
};

/** Governador/prefeito pedidos explicitamente: direto na base do TSE. */
async function buscarExecutivo(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]> {
	const perfil = EXECUTIVOS[p.cargo];
	deps.status(`Buscando ${p.cargo} diretamente na base eleitoral (TSE)...`);
	const uf = p.uf || "BR";
	const t = await deps.tse(p.nome, uf, perfil.cargoTse);
	const doc = String(t?.documentoPrincipal || t?.cpf || "").replace(/\D/g, "");
	if (!t || !doc) return [];
	const nome = t.nome || p.nome;
	const municipio = t.municipio || "";
	return [{
		id: doc,
		uri: municipio,
		nome,
		uf,
		idLegislatura: t.anoEleicao || 2024,
		casa: perfil.casa,
		cargo: perfil.cargo,
		ref: perfil.ref(uf, nome, municipio, doc),
	}];
}
function federais(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]>[] {
	return [
		deps.camara(p.nome, p.uf).then((l) => (l ?? []).map((c) => ({ ...c, ref: `FEDERAL:CAMARA:${c.id}`, cargo: "Deputado Federal" }))),
		deps.senado(p.nome).then((l) => (l ?? []).map((c) => ({ ...c, ref: `FEDERAL:SENADO:${c.id}`, cargo: "Senador da República" }))),
	];
}

function estaduais(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]>[] {
	if (p.somenteFederal || !p.uf) return [];
	if (p.uf === "SP") return [deps.alesp(p.nome)];
	if (p.uf === "RJ") return [deps.alerj(p.nome)];
	const uf = p.uf;
	// DF: deputado distrital é o cargo 8 no TSE.
	const [cargoTse, rotulo] = uf === "DF" ? ["8", "Deputado Distrital"] : ["7", "Deputado Estadual"];
	return [deps.tse(p.nome, uf, cargoTse).then((t) =>
		candidatoTse(t, uf, p.nome, "ASSEMBLEIA_LEGISLATIVA", rotulo, (doc) => `ESTADUAL:${uf}:${doc}`))];
}

/** Federais que só existem no TSE (não eleitos, ou Câmara/Senado fora do ar). */
function federaisTse(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]>[] {
	const uf = p.uf;
	if (!uf || uf === "FEDERAL" || uf === "BR") return [];
	return [
		deps.tse(p.nome, uf, "6").then((t) => candidatoTse(t, uf, p.nome, "CANDIDATO_TSE", "Deputado Federal (TSE)", (d) => `FEDERAL:CAMARA:${d}`)),
		deps.tse(p.nome, uf, "5").then((t) => candidatoTse(t, uf, p.nome, "CANDIDATO_TSE", "Senador (TSE)", (d) => `FEDERAL:SENADO:${d}`)),
	];
}

async function governadorSugerido(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]> {
	if (!p.refGovernadorSugerida) return [];
	const [, ufRef, nomeRef] = p.refGovernadorSugerida.split(":");
	const uf = ufRef || p.uf || "BR";
	const nome = nomeRef || p.nome;
	deps.status(`Buscando Governador "${nome}" na base eleitoral TSE (${uf})...`);
	const t = await deps.tse(nome, uf, "3");
	if (!t) return [];
	return [{
		id: String(t.documentoPrincipal || t.idTse || nome),
		uri: "",
		nome: t.nome || nome,
		uf,
		idLegislatura: t.anoEleicao || 2023,
		casa: "GOVERNO_ESTADUAL",
		cargo: "Governador de Estado",
		ref: `GOVERNADOR:${uf}:${nome}`,
	}];
}

function municipais(p: ParametrosBusca, deps: DependenciasBusca): Promise<Candidato[]>[] {
	const ufs = p.uf ? [p.uf] : UFS_SEM_UF_PADRAO;
	return ufs.map((uf) => deps.municipal(uf, p.nome));
}

async function buscarLegislativosEMunicipais(p: ParametrosBusca, deps: DependenciasBusca): Promise<ResultadoBusca> {
	deps.status(`Buscando nas esferas Federal${p.uf && !p.somenteFederal ? ` e Estadual (${p.uf})` : ""}...`);
	const g1 = await coletar([...federais(p, deps), ...estaduais(p, deps)]);
	let lista = g1.lista;
	let erro = g1.erro;
	// Reserva do TSE para federais (não eleitos ou Câmara/Senado fora do ar): só sem nenhum resultado.
	if (lista.length === 0) {
		const g2 = await coletar(federaisTse(p, deps));
		lista = g2.lista;
	}
	if (lista.length === 0) lista = await governadorSugerido(p, deps);
	if (!p.somenteFederal && melhorCobertura(lista, p.nome) < 1) {
		deps.status("Buscando na malha Municipal (Prefeitos e Vereadores)...");
		const g3 = await coletar(municipais(p, deps));
		lista = [...lista, ...g3.lista];
		erro = erro || g3.erro;
	}
	return { candidatos: ordenarCandidatos(lista, p.nome, p.uf), houveErroApi: erro };
}

export async function buscarCandidatos(p: ParametrosBusca, deps: DependenciasBusca): Promise<ResultadoBusca> {
	if (EXECUTIVOS[p.cargo]) {
		const candidatos = await buscarExecutivo(p, deps);
		return { candidatos, houveErroApi: false };
	}
	return buscarLegislativosEMunicipais(p, deps);
}
