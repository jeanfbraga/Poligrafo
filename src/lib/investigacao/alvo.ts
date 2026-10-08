/* ==========================================================================
   Alvo da investigação: refs, rotas e identidade inicial.
   Extraído do antigo handleSearch (page.tsx) e do SearchBar.
   ========================================================================== */

/** Um político tal como indexado (congresso-index / municipais-index / VIPs). */
export interface PoliticoIndexado {
	id?: string | number;
	nome: string;
	casa?: string;
	uf?: string;
	partido?: string;
	cargo?: string;
	municipio?: string;
	orgao?: string;
	isPresidente?: boolean;
}

export interface Alvo {
	nome: string;
	/** Ref estruturada: FEDERAL:CAMARA:123, GOVERNADOR:SP:x, ESTADUAL:RJ... */
	ref?: string;
	/** Alçada: "FEDERAL" ou sigla da UF. */
	uf?: string;
}

const SUPABASE_FALLBACK = "https://uvzynmgwfmdsdrwvgbsy.supabase.co";

function fotoSupabase(id: string | number): string {
	const base = process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_FALLBACK;
	return `${base}/storage/v1/object/public/fotos-politicos/${id}.jpg`;
}

const FOTO_CAMARA = (id: string | number) =>
	`https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg`;
const FOTO_SENADO = (id: string | number) =>
	`https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${id}.jpg`;

function refLegislativa(p: PoliticoIndexado): string | undefined {
	if (p.casa === "CAMARA") return `FEDERAL:CAMARA:${p.id}`;
	if (p.casa === "SENADO") return `FEDERAL:SENADO:${p.id}`;
	return undefined;
}

function refMunicipal(p: PoliticoIndexado): string | undefined {
	if (p.casa !== "CAMARA_MUNICIPAL" && p.casa !== "VEREADOR") return undefined;
	const uf = p.uf || "SE";
	const mun = p.municipio || "aracaju";
	return `${uf}:VEREADOR:${mun}:${p.id || p.nome}`;
}

function refExecutiva(p: PoliticoIndexado): string | undefined {
	const uf = p.uf || "BR";
	const idOuNome = p.id || p.nome;
	if (p.casa === "GOVERNO_ESTADUAL" || p.casa === "GOVERNADOR") return `GOVERNADOR:${uf}:${idOuNome}`;
	if (p.casa === "PREFEITO" || p.casa === "PREFEITURA") return `PREFEITO:${uf}:${idOuNome}`;
	return undefined;
}

/** Monta a ref estruturada de um político indexado (undefined se não houver id/casa conhecida). */
export function montarRef(p: PoliticoIndexado): string | undefined {
	if (!p?.id) return undefined;
	return refLegislativa(p) ?? refExecutiva(p) ?? refMunicipal(p);
}

/** Casa o termo digitado com um político indexado, ignorando acentos e caixa. */
export function normalizarNome(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");
}

export function acharPorNomeExato(
	termo: string,
	indexados: readonly PoliticoIndexado[],
): PoliticoIndexado | undefined {
	const alvo = normalizarNome(termo.trim());
	return indexados.find((p) => normalizarNome(p.nome) === alvo);
}

export interface IdentidadeInicial {
	cargo?: string;
	uf?: string;
	urlFoto?: string;
	urlFotoFallback?: string;
}

function identidadeFederal(casa: string, id: string): IdentidadeInicial {
	if (casa === "CAMARA") {
		return { cargo: "DEPUTADO FEDERAL", urlFoto: fotoSupabase(id), urlFotoFallback: FOTO_CAMARA(id) };
	}
	return { cargo: "SENADOR", urlFoto: fotoSupabase(id), urlFotoFallback: FOTO_SENADO(id) };
}

/**
 * Id do deputado na Câmara ("FEDERAL:CAMARA:204554" → "204554"). Um fluxo grava o CPF nessa
 * posição quando o deputado vem do TSE: 11 dígitos não são id da Câmara e voltam null.
 */
export function idCamaraDaRef(ref?: string): string | null {
	const m = /^FEDERAL:CAMARA:(\d{1,7})$/.exec(ref?.trim() ?? "");
	return m ? m[1] : null;
}

function identidadeDaRef(ref: string): IdentidadeInicial {
	const [a, b, c] = ref.split(":");
	if (a === "FEDERAL" && (b === "CAMARA" || b === "SENADO") && c) return identidadeFederal(b, c);
	if (a === "GOVERNADOR" || a === "PREFEITO") return { cargo: a, uf: b };
	if (b === "VEREADOR" || b === "CAMARA_MUNICIPAL") return { cargo: "VEREADOR", uf: a };
	return {};
}

function cargoDoIndexado(p: PoliticoIndexado): string | undefined {
	if (p.casa === "CAMARA") return "DEPUTADO FEDERAL";
	if (p.casa === "SENADO") return "SENADOR";
	if (p.casa === "CAMARA_MUNICIPAL" || p.cargo === "Vereador") return "VEREADOR";
	return p.cargo || undefined;
}

function fotosDoIndexado(p: PoliticoIndexado): Pick<IdentidadeInicial, "urlFoto" | "urlFotoFallback"> {
	if (!p.id) return {};
	if (p.casa === "CAMARA") return { urlFoto: fotoSupabase(p.id), urlFotoFallback: FOTO_CAMARA(p.id) };
	if (p.casa === "SENADO") return { urlFoto: fotoSupabase(p.id), urlFotoFallback: FOTO_SENADO(p.id) };
	return {};
}

/**
 * Pré-popula cargo, UF e foto antes de a API responder (o card "carregando"
 * já mostra a pessoa certa). Prioridade: ref explícita > match no índice.
 */
export function identidadeInicial(
	alvo: Alvo,
	indexados: readonly PoliticoIndexado[],
): IdentidadeInicial {
	const doRef: IdentidadeInicial = alvo.ref ? identidadeDaRef(alvo.ref) : {};
	const ufAlcada = alvo.uf && alvo.uf !== "FEDERAL" ? alvo.uf : undefined;
	const match = acharPorNomeExato(alvo.nome, indexados);
	const doIndice: IdentidadeInicial = match
		? { cargo: cargoDoIndexado(match), uf: match.uf, ...fotosDoIndexado(match) }
		: {};

	return {
		cargo: doRef.cargo ?? doIndice.cargo,
		uf: doRef.uf ?? ufAlcada ?? doIndice.uf,
		urlFoto: doRef.urlFoto ?? doIndice.urlFoto,
		urlFotoFallback: doRef.urlFotoFallback ?? doIndice.urlFotoFallback,
	};
}

/** Ref inferida quando o usuário digita só o nome (sem escolher no autocomplete). */
export function inferirRef(alvo: Alvo, indexados: readonly PoliticoIndexado[]): string | undefined {
	if (alvo.ref) return alvo.ref;
	const match = acharPorNomeExato(alvo.nome, indexados);
	if (match) return montarRef(match);
	if (alvo.uf) return `ESTADUAL:${alvo.uf}`;
	return undefined;
}

/** URL do Dossiê para um alvo (rota nova; links antigos `/?alvo=` são redirecionados). */
export function urlDossie(alvo: Alvo): string {
	const q = new URLSearchParams();
	if (alvo.ref) q.set("alvo", alvo.ref);
	q.set("nome", alvo.nome);
	if (alvo.uf) q.set("uf", alvo.uf);
	return `/dossie?${q.toString()}`;
}

/** Lê o alvo dos query params do Dossiê (aceita também o formato legado `?alvo=Nome&ref=`). */
export function alvoDosParams(params: URLSearchParams): Alvo | null {
	const alvoParam = params.get("alvo") || params.get("ref");
	const nome = params.get("nome") || params.get("alvo");
	if (!alvoParam || !nome) return null;
	const refLegado = params.get("ref");
	const ref = refLegado || (alvoParam.includes(":") ? alvoParam : undefined);
	return { nome, ref, uf: params.get("uf") || undefined };
}

export interface RotaDoPolitico {
	href: string;
	/** "perfil" quando existe página de Perfil; "dossie" quando vai direto ao grafo. */
	tipo: "perfil" | "dossie";
}

/**
 * Para onde ir ao escolher um político.
 * Só deputados federais e presidentes têm Perfil; os demais vão direto ao Dossiê.
 */
function ufDossiePolitico(ufIndexado?: string, ufFiltro?: string): string | undefined {
	const ufValida = ufIndexado && ufIndexado !== "BR" ? ufIndexado : undefined;
	const ufFiltroValida = ufFiltro && ufFiltro !== "FEDERAL" ? ufFiltro : undefined;
	return ufFiltroValida ?? ufValida ?? ufFiltro;
}

function urlPerfilDeputado(p: PoliticoIndexado): string {
	const q = new URLSearchParams({ nome: p.nome });
	if (p.partido) q.set("partido", p.partido);
	if (p.uf) q.set("uf", p.uf);
	return `/perfil/deputado/${p.id}?${q.toString()}`;
}

export function rotaDoPolitico(p: PoliticoIndexado, uf?: string): RotaDoPolitico {
	if (p.isPresidente || p.casa === "PRESIDENCIA_DA_REPUBLICA") {
		return { tipo: "perfil", href: `/perfil/presidente/${p.id}` };
	}
	if (p.casa === "CAMARA" && p.id) {
		return { tipo: "perfil", href: urlPerfilDeputado(p) };
	}
	return { tipo: "dossie", href: urlDossie({ nome: p.nome, ref: montarRef(p), uf: ufDossiePolitico(p.uf, uf) }) };
}
