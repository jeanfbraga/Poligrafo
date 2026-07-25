// lib/services/socio-search.ts

function normalizeStringLocal(str: string): string {
	if (!str) return "";
	return str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase()
		.trim();
}

/**
 * Busca empresas vinculadas ao nome de um sócio usando scraping multi-motor gratuito
 * (DuckDuckGo, Bing, Yahoo) e validação em APIs públicas abertas (MinhaReceita / BrasilAPI).
 * 100% Gratuito e sem necessidade de chaves de API pagas.
 */
export async function buscarEmpresasDoSocio(nomeSocio: string) {
	const nomeNorm = normalizeStringLocal(nomeSocio);
	console.log(`[OSINT QSA] Iniciando busca OSINT aberta (sem chaves) para: ${nomeNorm}...`);

	const cnpjsEncontrados = new Set<string>();
	const regexCnpjFormatted = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;

	const parseCNPJsFromHTML = (html: string) => {
		const matches = html.match(regexCnpjFormatted) || [];
		matches.forEach((m) => cnpjsEncontrados.add(m.replace(/\D/g, "")));
	};

	// 1. DuckDuckGo HTML Search
	try {
		const query = `${nomeSocio} cnpj`;
		const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
		const res = await fetch(ddgUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
				"Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
			},
			signal: AbortSignal.timeout(6000),
		});
		if (res.ok) {
			const html = await res.text();
			parseCNPJsFromHTML(html);
		}
	} catch (e: any) {
		console.log(`[OSINT QSA] DuckDuckGo fallback skip:`, e?.message || e);
	}

	// 2. Bing HTML Search (se o DuckDuckGo não retornar o bastante)
	if (cnpjsEncontrados.size === 0) {
		try {
			const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(`${nomeSocio} cnpj`)}`;
			const res = await fetch(bingUrl, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
					"Accept-Language": "pt-BR,pt;q=0.9",
				},
				signal: AbortSignal.timeout(6000),
			});
			if (res.ok) {
				const html = await res.text();
				parseCNPJsFromHTML(html);
			}
		} catch (e: any) {
			console.log(`[OSINT QSA] Bing fallback skip:`, e?.message || e);
		}
	}

	// 3. Yahoo Search (Fallback final)
	if (cnpjsEncontrados.size === 0) {
		try {
			const yahooUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(`${nomeSocio} cnpj`)}`;
			const res = await fetch(yahooUrl, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
				},
				signal: AbortSignal.timeout(6000),
			});
			if (res.ok) {
				const html = await res.text();
				parseCNPJsFromHTML(html);
			}
		} catch (e: any) {
			console.log(`[OSINT QSA] Yahoo fallback skip:`, e?.message || e);
		}
	}

	const cnpjsList = Array.from(cnpjsEncontrados);
	console.log(`[OSINT QSA] Extraídos ${cnpjsList.length} CNPJs potenciais da busca pública.`);

	if (cnpjsList.length === 0) {
		return [];
	}

	// 4. Validação em APIs Públicas Abertas (MinhaReceita com fallback para BrasilAPI)
	const empresasValidadas: any[] = [];
	const socioWords = nomeNorm.split(" ").filter((w) => w.length > 2);

	await Promise.all(
		cnpjsList.slice(0, 6).map(async (cnpj) => {
			let companyData: any = null;

			// Tenta MinhaReceita (sem rate limit agressivo)
			try {
				const mrRes = await fetch(`https://minhareceita.org/${cnpj}`, {
					signal: AbortSignal.timeout(5000),
				});
				if (mrRes.ok) {
					companyData = await mrRes.json();
				}
			} catch (_e) {
				// MinhaReceita falhou, tenta BrasilAPI
			}

			// Fallback: BrasilAPI
			if (!companyData) {
				try {
					const bRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
						signal: AbortSignal.timeout(5000),
					});
					if (bRes.ok) {
						companyData = await bRes.json();
					}
				} catch (_e) {
					// Ignora
				}
			}

			if (companyData) {
				const qsa = companyData.qsa || [];
				// Verifica se o sócio aparece no QSA (por palavra chave ou nome completo)
				const ehSocio = qsa.some((s: any) => {
					const sNome = normalizeStringLocal(s.nome_socio || s.nome_socio_razao_social || "");
					if (sNome.includes(nomeNorm) || nomeNorm.includes(sNome)) return true;
					const matchCount = socioWords.filter((w) => sNome.includes(w)).length;
					return matchCount >= 2;
				});

				// Se for sócio confirmado ou se for MEI/EIRELI sem QSA listado
				if (ehSocio || qsa.length === 0) {
					empresasValidadas.push({
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
					});
				}
			}
		}),
	);

	console.log(`[OSINT QSA] ${empresasValidadas.length} empresa(s) confirmada(s) no QSA.`);
	return empresasValidadas;
}
