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
	} catch (e) {
		console.error(`[CÂMARA] Tempo esgotado ou erro ao buscarPolitico:`, e);
		return null;
	}
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

		const match = senadoresArray.find(
			(s: any) =>
				normalizeString(s.IdentificacaoParlamentar.NomeParlamentar).includes(
					termoBusca,
				) ||
				normalizeString(
					s.IdentificacaoParlamentar.NomeCompletoParlamentar,
				).includes(termoBusca),
		);

		if (!match) return null;

		const mandatos = Array.isArray(match.Mandatos?.Mandato)
			? match.Mandatos.Mandato
			: [match.Mandatos?.Mandato];
		const uf = mandatos[0]?.UfParlamentar || "DF";

		const exercicios = Array.isArray(mandatos[0]?.Exercicios?.Exercicio)
			? mandatos[0].Exercicios.Exercicio
			: [mandatos[0]?.Exercicios?.Exercicio];
		const afastado = exercicios.find(
			(ex: any) => ex?.SiglaCausaAfastamento && !ex?.DataFim,
		);
		let afastamentoDados;

		if (afastado) {
			const suplentes = Array.isArray(mandatos[0]?.Suplentes?.Suplente)
				? mandatos[0].Suplentes.Suplente
				: [mandatos[0]?.Suplentes?.Suplente];
			const suplenteNome = suplentes[0]?.NomeParlamentar || null;
			afastamentoDados = {
				motivo: afastado.DescricaoCausaAfastamento || "Afastado",
				suplente: suplenteNome,
			};
		}

		const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uvzynmgwfmdsdrwvgbsy.supabase.co";

		return {
			id: match.IdentificacaoParlamentar.CodigoParlamentar,
			uri: match.IdentificacaoParlamentar.UrlPaginaParlamentar,
			nome: match.IdentificacaoParlamentar.NomeParlamentar,
			uf: uf,
			idLegislatura: 57,
			casa: "SENADO",
			urlFoto: `${SUPABASE_URL}/storage/v1/object/public/fotos-politicos/${match.IdentificacaoParlamentar.CodigoParlamentar}.jpg`,
			urlFotoFallback: match.IdentificacaoParlamentar.UrlFotoParlamentar || `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${match.IdentificacaoParlamentar.CodigoParlamentar}.jpg`,
			...(afastamentoDados && { afastamento: afastamentoDados }),
		};
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
			timeout: 30000,
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
		return matches.slice(0, 5).map((m: any) => {
			const mandatos = Array.isArray(m.Mandatos?.Mandato)
				? m.Mandatos.Mandato
				: [m.Mandatos?.Mandato];
			const uf = mandatos[0]?.UfParlamentar || "DF";

			const exercicios = Array.isArray(mandatos[0]?.Exercicios?.Exercicio)
				? mandatos[0].Exercicios.Exercicio
				: [mandatos[0]?.Exercicios?.Exercicio];
			const afastado = exercicios.find(
				(ex: any) => ex?.SiglaCausaAfastamento && !ex?.DataFim,
			);
			let afastamentoDados;

			if (afastado) {
				const suplentes = Array.isArray(mandatos[0]?.Suplentes?.Suplente)
					? mandatos[0].Suplentes.Suplente
					: [mandatos[0]?.Suplentes?.Suplente];
				const suplenteNome = suplentes[0]?.NomeParlamentar || null;
				afastamentoDados = {
					motivo: afastado.DescricaoCausaAfastamento || "Afastado",
					suplente: suplenteNome,
				};
			}

			const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://uvzynmgwfmdsdrwvgbsy.supabase.co";
			return {
				id: m.IdentificacaoParlamentar.CodigoParlamentar,
				uri: m.IdentificacaoParlamentar.UrlPaginaParlamentar,
				nome: m.IdentificacaoParlamentar.NomeParlamentar,
				uf: uf,
				idLegislatura: 57,
				casa: "SENADO" as const,
				urlFoto: `${SUPABASE_URL}/storage/v1/object/public/fotos-politicos/${m.IdentificacaoParlamentar.CodigoParlamentar}.jpg`,
				urlFotoFallback: m.IdentificacaoParlamentar.UrlFotoParlamentar || `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${m.IdentificacaoParlamentar.CodigoParlamentar}.jpg`,
				...(afastamentoDados && { afastamento: afastamentoDados }),
			};
		});
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
