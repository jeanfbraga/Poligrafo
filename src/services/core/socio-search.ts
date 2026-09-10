// lib/services/socio-search.ts

function normalizeStringLocal(str: string): string {
	if (!str) return "";
	return str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.trim();
}

const USER_AGENT_CHROME =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function scrapeCnpjsFromUrl(
	url: string,
	headers?: HeadersInit,
): Promise<string[]> {
	try {
		const res = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(6000),
		});
		if (!res.ok) return [];
		const html = await res.text();
		const matches = html.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g) || [];
		return matches.map((m) => m.replace(/\D/g, ""));
	} catch (e: any) {
		console.log(`[OSINT QSA] Scrape skip:`, e?.message || e);
		return [];
	}
}

async function coletarCnpjsMotoresBusca(nomeSocio: string): Promise<string[]> {
	const query = encodeURIComponent(`${nomeSocio} cnpj`);
	const engines: Array<{ url: string; headers: Record<string, string> }> = [
		{
			url: `https://html.duckduckgo.com/html/?q=${query}`,
			headers: {
				"User-Agent": USER_AGENT_CHROME,
				"Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
			},
		},
		{
			url: `https://www.bing.com/search?q=${query}`,
			headers: {
				"User-Agent": USER_AGENT_CHROME,
				"Accept-Language": "pt-BR,pt;q=0.9",
			},
		},
		{
			url: `https://search.yahoo.com/search?p=${query}`,
			headers: {
				"User-Agent": USER_AGENT_CHROME,
			},
		},
	];

	const cnpjs = new Set<string>();
	for (const engine of engines) {
		const encontrados = await scrapeCnpjsFromUrl(engine.url, engine.headers);
		encontrados.forEach((c) => cnpjs.add(c));
		if (cnpjs.size > 0) break;
	}
	return Array.from(cnpjs);
}

async function fetchCompanyData(cnpj: string): Promise<any> {
	try {
		const mrRes = await fetch(`https://minhareceita.org/${cnpj}`, {
			signal: AbortSignal.timeout(5000),
		});
		if (mrRes.ok) return await mrRes.json();
	} catch {}

	try {
		const bRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
			signal: AbortSignal.timeout(5000),
		});
		if (bRes.ok) return await bRes.json();
	} catch {}

	return null;
}

function verificarEhSocio(
	qsa: any[],
	nomeNorm: string,
	socioWords: string[],
): boolean {
	if (!qsa || qsa.length === 0) return true;
	return qsa.some((s: any) => {
		const sNome = normalizeStringLocal(
			s.nome_socio || s.nome_socio_razao_social || "",
		);
		if (sNome.includes(nomeNorm) || nomeNorm.includes(sNome)) return true;
		const matchCount = socioWords.filter((w) => sNome.includes(w)).length;
		return matchCount >= 2;
	});
}

function formatarEmpresaValidada(cnpj: string, companyData: any) {
	return {
		cnpj,
		razao_social:
			companyData.razao_social ||
			companyData.nome_fantasia ||
			"Empresa Localizada",
		situacao:
			companyData.descricao_situacao_cadastral ||
			companyData.situacao_cadastral ||
			"ATIVA",
		cnae:
			companyData.cnae_fiscal_descricao ||
			companyData.cnae_fiscal ||
			"Não informado",
	};
}

async function validarCnpjSocio(
	cnpj: string,
	nomeNorm: string,
	socioWords: string[],
) {
	const companyData = await fetchCompanyData(cnpj);
	if (!companyData) return null;
	const ehSocio = verificarEhSocio(companyData.qsa, nomeNorm, socioWords);
	return ehSocio ? formatarEmpresaValidada(cnpj, companyData) : null;
}

/**
 * Busca empresas vinculadas ao nome de um sócio usando scraping multi-motor gratuito
 * (DuckDuckGo, Bing, Yahoo) e validação em APIs públicas abertas (MinhaReceita / BrasilAPI).
 * 100% Gratuito e sem necessidade de chaves de API pagas.
 */
export async function buscarEmpresasDoSocio(nomeSocio: string) {
	const nomeNorm = normalizeStringLocal(nomeSocio);
	console.log(
		`[OSINT QSA] Iniciando busca OSINT aberta (sem chaves) para: ${nomeNorm}...`,
	);

	const cnpjsList = await coletarCnpjsMotoresBusca(nomeSocio);
	console.log(
		`[OSINT QSA] Extraídos ${cnpjsList.length} CNPJs potenciais da busca pública.`,
	);

	if (cnpjsList.length === 0) {
		return [];
	}

	const socioWords = nomeNorm.split(" ").filter((w) => w.length > 2);
	const resultados = await Promise.all(
		cnpjsList
			.slice(0, 6)
			.map((cnpj) => validarCnpjSocio(cnpj, nomeNorm, socioWords)),
	);

	const empresasValidadas = resultados.filter(Boolean);
	console.log(
		`[OSINT QSA] ${empresasValidadas.length} empresa(s) confirmada(s) no QSA.`,
	);
	return empresasValidadas;
}
