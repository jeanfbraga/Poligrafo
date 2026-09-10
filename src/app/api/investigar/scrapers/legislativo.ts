import { fetchWithTimeout, normalizeString } from "../tse";

export interface ParlamentarBasico {
	id: number | string;
	uri: string;
	nome: string;
	uf: string;
	idLegislatura: number;
	casa:
		| "CAMARA"
		| "SENADO"
		| "ALERJ"
		| "ALESP"
		| "GOVERNO_ESTADUAL"
		| "PREFEITURA"
		| "PRESIDENCIA_DA_REPUBLICA"
		| `CAMARA_MUNICIPAL_${string}`;
	afastamento?: { motivo: string; suplente: string | null };
	urlFoto?: string;
	urlFotoFallback?: string;
}

export interface DetalhesDeputado {
	cpf: string;
	nomeCivil: string;
	sexo: string;
	dataNascimento: string;
}

export async function buscarPolitico(
	query: string,
): Promise<ParlamentarBasico | null> {
	try {
		const url = `https://dadosabertos.camara.leg.br/api/v2/deputados?${query}&idLegislatura=57&idLegislatura=56&idLegislatura=55&idLegislatura=54`;
		const response = await fetchWithTimeout(url, { timeout: 15000 });
		if (!response.ok) return null;
		const json = await response.json();
		const dados = json.dados;
		if (!dados || dados.length === 0) return null;
		const deputado = dados[0];
		return {
			id: deputado.id,
			uri: deputado.uri,
			nome: deputado.nome,
			uf: deputado.siglaUf,
			idLegislatura: deputado.idLegislatura,
			casa: "CAMARA",
			urlFoto: deputado.urlFoto,
		};
	} catch (e: any) {
		if (e.name === "AbortError" || e.code === "UND_ERR_CONNECT_TIMEOUT" || e.message?.includes("timeout") || e.message?.includes("fetch failed")) {
			console.warn(`[CÂMARA] Timeout ao buscarPolitico.`);
		} else {
			console.error(`[CÂMARA] Tempo esgotado ou erro ao buscarPolitico:`, e);
		}
		return null;
	}
}

function extrairAfastamento(mandato: any) {
	const exercicios = Array.isArray(mandato?.Exercicios?.Exercicio)
		? mandato.Exercicios.Exercicio
		: [mandato?.Exercicios?.Exercicio];
	const afastado = exercicios.find(
		(ex: any) => ex?.SiglaCausaAfastamento && !ex?.DataFim,
	);
	if (!afastado) return undefined;
	const suplentes = Array.isArray(mandato?.Suplentes?.Suplente)
		? mandato.Suplentes.Suplente
		: [mandato?.Suplentes?.Suplente];
	return {
		motivo: afastado.DescricaoCausaAfastamento || "Afastado",
		suplente: suplentes[0]?.NomeParlamentar || null,
	};
}

function extrairDadosSenador(match: any, supabaseUrl: string): ParlamentarBasico {
	const mandatos = Array.isArray(match.Mandatos?.Mandato)
		? match.Mandatos.Mandato
		: [match.Mandatos?.Mandato];
	const primeiroMandato = mandatos[0];
	const uf = primeiroMandato?.UfParlamentar || "DF";
	const afastamento = extrairAfastamento(primeiroMandato);
	const cod = match.IdentificacaoParlamentar.CodigoParlamentar;

	return {
		id: cod,
		uri: match.IdentificacaoParlamentar.UrlPaginaParlamentar,
		nome: match.IdentificacaoParlamentar.NomeParlamentar,
		uf,
		idLegislatura: 57,
		casa: "SENADO",
		urlFoto: `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${cod}.jpg`,
		urlFotoFallback: match.IdentificacaoParlamentar.UrlFotoParlamentar || `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${cod}.jpg`,
		...(afastamento && { afastamento }),
	};
}

export async function buscarSenador(
	query: string,
): Promise<ParlamentarBasico | null> {
	try {
		const termoBusca = normalizeString(query);
		const url = `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/57`;
		const res = await fetchWithTimeout(url, {
			timeout: 4500,
			headers: { Accept: "application/json" },
		});

		if (!res.ok) return null;

		const data = await res.json();
		const listaSenadores =
			data?.ListaParlamentarLegislatura?.Parlamentares?.Parlamentar || [];

		const senadoresArray = Array.isArray(listaSenadores)
			? listaSenadores
			: [listaSenadores];

		const match = senadoresArray.find((s: any) => {
			const idParl = s.IdentificacaoParlamentar;
			return normalizeString(idParl?.NomeParlamentar || "").includes(termoBusca) ||
				normalizeString(idParl?.NomeCompletoParlamentar || "").includes(termoBusca);
		});

		if (!match) return null;

		const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uvzynmgwfmdsdrwvgbsy.supabase.co";
		return extrairDadosSenador(match, SUPABASE_URL);
	} catch (_e) {
		return null;
	}
}

export async function buscarPoliticosCamaraLista(
	nome: string,
	ufScope?: string | null,
): Promise<ParlamentarBasico[]> {
	try {
		let url = `https://dadosabertos.camara.leg.br/api/v2/deputados?nome=${encodeURIComponent(nome)}&idLegislatura=57&idLegislatura=56&idLegislatura=55&idLegislatura=54&ordem=ASC&ordenarPor=nome`;
		if (ufScope && ufScope !== "FEDERAL" && ufScope !== "BR") {
			url += `&siglaUf=${ufScope}`;
		}
		const response = await fetchWithTimeout(url, {
			timeout: 10000,
			headers: {
				Accept: "application/json",
				"User-Agent": "PoligrafoBot/1.0",
				"Cache-Control": "no-cache",
			},
		});
		if (!response.ok) {
			console.error(`[CÂMARA] Erro ao buscar ${nome}: HTTP ${response.status}`);
			return [];
		}
		const json = await response.json();
		const dados = json.dados;
		if (!dados || dados.length === 0) return [];
		const termoNorm = normalizeString(nome);
		const dadosOrdenados = dados.sort((a: any, b: any) => {
			const nomeA = normalizeString(a.nome);
			const nomeB = normalizeString(b.nome);
			if (nomeA === termoNorm && nomeB !== termoNorm) return -1;
			if (nomeB === termoNorm && nomeA !== termoNorm) return 1;
			return 0;
		});
		const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uvzynmgwfmdsdrwvgbsy.supabase.co";
		return dadosOrdenados.slice(0, 5).map((dep: any) => ({
			id: dep.id,
			uri: dep.uri,
			nome: dep.nome,
			uf: dep.siglaUf,
			idLegislatura: dep.idLegislatura,
			casa: "CAMARA" as const,
			urlFoto: `${SUPABASE_URL}/storage/v1/object/public/fotos-politicos/${dep.id}.jpg`,
			urlFotoFallback: dep.urlFoto || `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`,
		}));
	} catch (e) {
		console.error(`[CÂMARA] Catch Error ao buscar ${nome}:`, e);
		return [];
	}
}

export async function buscarSenadoresLista(
	nome: string,
	ufScope?: string | null,
): Promise<ParlamentarBasico[]> {
	try {
		const termoBusca = normalizeString(nome);
		const url = `https://legis.senado.leg.br/dadosabertos/senador/lista/legislatura/57`;
		const res = await fetchWithTimeout(url, {
			timeout: 4500,
			headers: { Accept: "application/json" },
		});
		if (!res.ok) return [];
		const data = await res.json();
		const listaSenadores =
			data?.ListaParlamentarLegislatura?.Parlamentares?.Parlamentar || [];
		const senadoresArray = Array.isArray(listaSenadores)
			? listaSenadores
			: [listaSenadores];
		const matches = senadoresArray.filter((s: any) => {
			const matchNome =
				normalizeString(
					s.IdentificacaoParlamentar?.NomeParlamentar || "",
				).includes(termoBusca) ||
				normalizeString(
					s.IdentificacaoParlamentar?.NomeCompletoParlamentar || "",
				).includes(termoBusca);
			if (!matchNome) return false;

			if (ufScope && ufScope !== "FEDERAL" && ufScope !== "BR") {
				return s.IdentificacaoParlamentar?.UfParlamentar === ufScope;
			}
			return true;
		});
		const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uvzynmgwfmdsdrwvgbsy.supabase.co";
		return matches.slice(0, 5).map((m: any) => extrairDadosSenador(m, SUPABASE_URL));
	} catch (_e) {
		return [];
	}
}

export async function buscarDetalhesPolitico(
	id: number,
): Promise<DetalhesDeputado | null> {
	const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`;
	const response = await fetchWithTimeout(url);
	if (!response.ok)
		throw new Error(`Erro na API (Detalhes): status ${response.status}`);
	const json = await response.json();
	const dados = json.dados;
	if (!dados) return null;
	return {
		cpf: dados.cpf,
		nomeCivil: dados.nomeCivil,
		sexo: dados.sexo,
		dataNascimento: dados.dataNascimento,
	};
}

export async function buscarProjetosLeiCamara(idDeputado: number | string) {
	try {
		const url = `https://dadosabertos.camara.leg.br/api/v2/proposicoes?idAutor=${idDeputado}&ordem=DESC&ordenarPor=id&itens=4`;
		const res = await fetchWithTimeout(url, { timeout: 4000 });
		if (!res.ok) return [];
		const json = await res.json();
		return (json.dados || []).map((p: any) => ({
			ementa: p.ementa,
			tipo: p.siglaTipo,
			ano: p.ano,
		}));
	} catch {
		return [];
	}
}
