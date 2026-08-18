export function normalizeString(str: string): string {
	if (!str) return "";
	return str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

/**
 * Verifica se `palavra` existe como palavra INTEIRA dentro de `texto`.
 * Evita falsos positivos como "marotto" matchando dentro de "camarotto".
 */
export function matchPalavraInteira(texto: string, palavra: string): boolean {
	if (!texto || !palavra) return false;
	// Usa word boundary regex para garantir match de palavra inteira
	const regex = new RegExp(
		`(?:^|\\s|-)${palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|-|$)`,
	);
	return regex.test(texto);
}

export async function fetchWithTimeout(
	resource: string | URL | RequestInfo,
	options: RequestInit & { timeout?: number } = {},
) {
	const { timeout = 8000, ...fetchOptions } = options;
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(resource as URL, {
			...fetchOptions,
			signal: controller.signal,
			cache: "no-store",
		});
		clearTimeout(id);
		return response;
	} catch (e) {
		clearTimeout(id);
		throw e;
	}
}

export interface ItemHistoricoTse {
	ano: number;
	idEleicao: string;
	cargo: string;
	partido?: string;
	patrimonioTotal: number;
	bensDeclarados: any[];
	idTse?: number;
	nomeUrna?: string;
	nomeCompleto?: string;
	urlFoto?: string;
}

export interface TseCandidateResult {
	cpf: string;
	documentoPrincipal: string;
	cnpjCampanha: string | null;
	isCnpj: boolean;
	municipio: string;
	idUe: string;
	nome?: string;
	nomeUrna?: string | null;
	idTse?: number;
	anoEleicao?: number;
	idEleicao?: string;
	patrimonioTotal?: number;
	bensDeclarados?: any[];
	partido?: string;
	urlFoto?: string;
	historicoPatrimonio?: ItemHistoricoTse[];
	patrimonioAnterior?: number;
	anoPatrimonioAnterior?: number;
	variacaoPatrimonio?: number;
	variacaoPatrimonioPercentual?: number;
}

export const CAMPANHAS_GERAIS = [
	{ ano: "2026", idEleicao: "20322002026" }, // Eleições Gerais 2026
	{ ano: "2022", idEleicao: "2040602022" }, // Eleições Gerais 2022
	{ ano: "2018", idEleicao: "2022802018" }, // Eleições Gerais 2018
	{ ano: "2014", idEleicao: "680" },        // Eleições Gerais 2014
];

export const CAMPANHAS_MUNICIPAIS = [
	{ ano: "2024", idEleicao: "2045202024" }, // Eleições Municipais 2024
	{ ano: "2020", idEleicao: "2030402020" }, // Eleições Municipais 2020
	{ ano: "2016", idEleicao: "2" },          // Eleições Municipais 2016
];

// NOVA FUNÇÃO: Busca o CPF real do político no TSE caso a casa legislativa o censure
// Exportada para uso nos módulos estaduais/municipais
export async function buscarCpfNoTSE(
	nomePolitico: string,
	uf: string,
	cargoCodigo: string = "5",
): Promise<TseCandidateResult | null> {
	console.log(
		`[>> TSE ENTRY] buscarCpfNoTSE chamado: ${nomePolitico} UF:${uf} Cargo:${cargoCodigo}`,
	);
	try {
		// Cargo 1 = Pres, 3 = Gov, 5 = Senador, 6 = Dep. Federal, 7 = Dep. Estadual, 11 = Prefeito, 13 = Vereador
		const isMunicipal = ["11", "12", "13"].includes(cargoCodigo);
		const campanhas = isMunicipal ? CAMPANHAS_MUNICIPAIS : CAMPANHAS_GERAIS;

		for (const eleicao of campanhas) {
			try {
				if (!isMunicipal) {
					console.log(
						`[TSE DEBUG] Buscando "listar" TODOS os candidatos para ${uf} (eleição ${eleicao.ano}, cargo ${cargoCodigo})...`,
					);
					const urlListagem = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/${cargoCodigo}/candidatos`;

					let resListagem;
					try {
						resListagem = await fetchWithTimeout(urlListagem, {
							timeout: 6000,
						});
					} catch (_e) {
						continue;
					}
					if (!resListagem?.ok) continue;

					let dataListagem;
					try {
						dataListagem = await resListagem.json();
					} catch (_e) {
						continue;
					}

					const candidatos = dataListagem.candidatos || [];

					if (candidatos.length > 0) {
						const termoNorm = normalizeString(nomePolitico);
						// ETAPA 1: Busca apenas correspondência EXATA
						let match = candidatos.find((c: any) => {
							const cUrna = normalizeString(c.nomeUrna || "");
							const cNome = normalizeString(c.nomeCompleto || "");
							return cUrna === termoNorm || cNome === termoNorm;
						});
						// ETAPA 2: Se não encontrou o exato, faz fallback para o PARCIAL
						// Usa word-boundary para evitar falsos positivos (ex: "marotto" em "camarotto")
						if (!match) {
							const parts = termoNorm
								.split(/\s+/)
								.filter(
									(p: string) => !["de", "da", "do", "dos", "das"].includes(p),
								);
							match = candidatos.find((c: any) => {
								const cUrna = normalizeString(c.nomeUrna || "");
								const cNome = normalizeString(c.nomeCompleto || "");
								return parts.every(
									(p: string) =>
										matchPalavraInteira(cUrna, p) ||
										matchPalavraInteira(cNome, p),
								);
							});
						}

						if (match?.id) {
							return await extrairDetalhesDoTSE(
								eleicao,
								uf,
								match,
								uf,
								nomePolitico,
							);
						}
					}
				} else {
					// Para municipal, usamos "listar" na capital primeiro (maior chance), depois interior
					const urlMuni = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/eleicao/buscar/${uf}/${eleicao.idEleicao}/municipios`;
					const resMuni = await fetchWithTimeout(urlMuni, { timeout: 10000 });
					if (!resMuni.ok) continue;

					let dataMuni;
					try {
						dataMuni = await resMuni.json();
					} catch (_e) {
						continue;
					}
					if (!dataMuni.municipios) continue;

					const locais = dataMuni.municipios
						.sort((a: any, _b: any) =>
							a.codigo === "71072" || a.codigo === "60011" ? -1 : 1,
						)
						.map((m: any) => m.codigo);

					console.log(
						`[TSE DEBUG] Buscando "listar" "${nomePolitico}"... Capital separada, restante em chunks.`,
					);

					// Separa a capital (primeiro elemento ordenado) para busca isolada com timeout maior
					// A maioria das buscas ocorre na capital e a concorrência pode causar timeout
					const capitalLocal = locais[0];
					const locaisRestantes = locais.slice(1);

					// 1. Busca isolada na Capital
					if (capitalLocal) {
						try {
							console.log(
								`[TSE DEBUG] Buscando na capital (${capitalLocal}) isoladamente...`,
							);
							const urlListagemCap = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${capitalLocal}/${eleicao.idEleicao}/${cargoCodigo}/candidatos`;
							const resListagemCap = await fetchWithTimeout(urlListagemCap, {
								timeout: 15000,
							});
							if (resListagemCap.ok) {
								let dataListagemCap;
								try {
									dataListagemCap = await resListagemCap.json();
								} catch (_e) {}
								const candidatosCap = dataListagemCap?.candidatos || [];
								if (candidatosCap.length > 0) {
									const termoNorm = normalizeString(nomePolitico);
									let match = candidatosCap.find((c: any) => {
										const cUrna = normalizeString(c.nomeUrna || "");
										const cNome = normalizeString(c.nomeCompleto || "");
										return cUrna === termoNorm || cNome === termoNorm;
									});
									if (!match) {
										const parts = termoNorm
											.split(/\s+/)
											.filter(
												(p: string) =>
													!["de", "da", "do", "dos", "das"].includes(p),
											);
										match = candidatosCap.find((c: any) => {
											const cUrna = normalizeString(c.nomeUrna || "");
											const cNome = normalizeString(c.nomeCompleto || "");
											return parts.every(
												(p: string) =>
													matchPalavraInteira(cUrna, p) ||
													matchPalavraInteira(cNome, p),
											);
										});
									}
									if (match?.id) {
										console.log(
											`[TSE DEBUG] Alvo encontrado na capital (${capitalLocal}).`,
										);
										const finalResult = await extrairDetalhesDoTSE(
											eleicao,
											capitalLocal,
											match,
											uf,
											nomePolitico,
										);
										if (finalResult) return finalResult;
									}
								}
							}
						} catch (e) {
							console.warn(
								`[TSE DEBUG] Timeout/Erro na busca isolada da capital:`,
								e,
							);
						}
					}

					// 2. Busca no interior em chunks
					const chunkSize = 20; // Reduzido de 30 para 20 para aliviar a API
					for (let i = 0; i < locaisRestantes.length; i += chunkSize) {
						const chunk = locaisRestantes.slice(i, i + chunkSize);
						console.log(
							`[TSE DEBUG] Processando chunk ${Math.floor(i / chunkSize) + 1} (${chunk.length} municípios)...`,
						);

						const chunkPromises = chunk.map(async (localidade: string) => {
							try {
								const urlListagem = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${localidade}/${eleicao.idEleicao}/${cargoCodigo}/candidatos`;
								const resListagem = await fetchWithTimeout(urlListagem, {
									timeout: 3500,
								});
								if (resListagem.ok) {
									let dataListagem;
									try {
										dataListagem = await resListagem.json();
									} catch (_e) {
										return null;
									}
									const candidatos = dataListagem.candidatos || [];
									if (candidatos.length > 0) {
										const termoNorm = normalizeString(nomePolitico);
										// ETAPA 1: Busca apenas correspondência EXATA
										let match = candidatos.find((c: any) => {
											const cUrna = normalizeString(c.nomeUrna || "");
											const cNome = normalizeString(c.nomeCompleto || "");
											return cUrna === termoNorm || cNome === termoNorm;
										});
										// ETAPA 2: Se não encontrou o exato, faz fallback para o PARCIAL
										// Usa word-boundary para evitar falsos positivos (ex: "marotto" em "camarotto")
										if (!match) {
											const parts = termoNorm
												.split(/\s+/)
												.filter(
													(p: string) =>
														!["de", "da", "do", "dos", "das"].includes(p),
												);
											match = candidatos.find((c: any) => {
												const cUrna = normalizeString(c.nomeUrna || "");
												const cNome = normalizeString(c.nomeCompleto || "");
												return parts.every(
													(p: string) =>
														matchPalavraInteira(cUrna, p) ||
														matchPalavraInteira(cNome, p),
												);
											});
										}

										if (match?.id) return { match, localidade };
									}
								}
							} catch (_e) {}
							return null;
						});

						const chunkResults = await Promise.all(chunkPromises);
						const resultFound = chunkResults.find((r) => r !== null);

						if (resultFound) {
							console.log(
								`[TSE DEBUG] Alvo encontrado no município ${resultFound.localidade}.`,
							);
							const finalResult = await extrairDetalhesDoTSE(
								eleicao,
								resultFound.localidade,
								resultFound.match,
								uf,
								nomePolitico,
							);
							if (finalResult) return finalResult;
						}
					}
				}
			} catch (e) {
				console.warn(
					`[TSE] Falha iterando eleicao ${eleicao.ano} para CPF de ${nomePolitico}:`,
					e,
				);
			}
		}

		return null;
	} catch (e) {
		console.warn(
			`[TSE] Erro principal tentar resgatar o CPF de ${nomePolitico}:`,
			e,
		);
		return null;
	}
}

async function buscarHistoricoPatrimonioTse(
	nomePolitico: string,
	uf: string,
	isMunicipal: boolean,
	registroAtual: ItemHistoricoTse,
): Promise<{
	historico: ItemHistoricoTse[];
	patrimonioAnterior?: number;
	anoPatrimonioAnterior?: number;
	variacaoPatrimonio?: number;
	variacaoPatrimonioPercentual?: number;
}> {
	const termoNorm = normalizeString(nomePolitico);
	const parts = termoNorm
		.split(/\s+/)
		.filter((p: string) => !["de", "da", "do", "dos", "das"].includes(p));

	const todasCampanhas = isMunicipal ? CAMPANHAS_MUNICIPAIS : CAMPANHAS_GERAIS;
	const outrasCampanhas = todasCampanhas.filter((c) => Number(c.ano) !== registroAtual.ano);

	const cargosGeraisParaBuscar = ["6", "5", "3", "7", "1"];
	const cargosMunicipaisParaBuscar = ["11", "12", "13"];

	const historico: ItemHistoricoTse[] = [registroAtual];

	const promessas = outrasCampanhas.map(async (eleicao) => {
		try {
			if (!isMunicipal) {
				for (const cargo of cargosGeraisParaBuscar) {
					const urlListagem = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/${cargo}/candidatos`;
					const res = await fetchWithTimeout(urlListagem, { timeout: 3500 });
					if (!res?.ok) continue;

					let data;
					try {
						data = await res.json();
					} catch (_e) {
						continue;
					}

					const candidatos = data.candidatos || [];
					let match = candidatos.find((c: any) => {
						const cUrna = normalizeString(c.nomeUrna || "");
						const cNome = normalizeString(c.nomeCompleto || "");
						return cUrna === termoNorm || cNome === termoNorm;
					});

					if (!match) {
						match = candidatos.find((c: any) => {
							const cUrna = normalizeString(c.nomeUrna || "");
							const cNome = normalizeString(c.nomeCompleto || "");
							return parts.every(
								(p: string) =>
									matchPalavraInteira(cUrna, p) ||
									matchPalavraInteira(cNome, p),
							);
						});
					}

					if (match?.id) {
						const urlDet = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/candidato/${match.id}`;
						const resDet = await fetchWithTimeout(urlDet, { timeout: 3500 });
						if (resDet?.ok) {
							let det;
							try {
								det = await resDet.json();
							} catch (_e) {
								continue;
							}
							let total = det.totalDeBens || 0;
							let bens = det.bens || [];

							if (total === 0) {
								const urlBens = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/candidato/${eleicao.ano}/${uf}/${eleicao.idEleicao}/candidato/${match.id}/bens`;
								const resBens = await fetchWithTimeout(urlBens, {
									timeout: 3000,
								});
								if (resBens?.ok) {
									try {
										const dataBens = await resBens.json();
										total = dataBens.totalDeBens || 0;
										bens = dataBens.bens || [];
									} catch (_e) {}
								}
							}

							historico.push({
								ano: Number(eleicao.ano),
								idEleicao: eleicao.idEleicao,
								cargo: det.cargo?.nome || match.cargo?.nome || `Cargo ${cargo}`,
								partido: det.partido?.sigla || match.partido?.sigla,
								patrimonioTotal: total,
								bensDeclarados: bens,
								idTse: match.id,
								nomeUrna: match.nomeUrna,
								nomeCompleto: det.nomeCompleto || match.nomeCompleto,
								urlFoto: det.fotoUrl || match.fotoUrl,
							});
							break; // Encontrou neste ano
						}
					}
				}
			}
		} catch (e) {
			console.warn(`[TSE HISTORICO] Falha ao coletar ano ${eleicao.ano}:`, e);
		}
	});

	await Promise.allSettled(promessas);
	historico.sort((a, b) => b.ano - a.ano);

	let patrimonioAnterior: number | undefined;
	let anoPatrimonioAnterior: number | undefined;
	let variacaoPatrimonio: number | undefined;
	let variacaoPatrimonioPercentual: number | undefined;

	if (historico.length >= 2) {
		const maisRecente = historico[0];
		const anterior = historico[1];
		patrimonioAnterior = anterior.patrimonioTotal;
		anoPatrimonioAnterior = anterior.ano;
		variacaoPatrimonio = maisRecente.patrimonioTotal - anterior.patrimonioTotal;
		if (anterior.patrimonioTotal > 0) {
			variacaoPatrimonioPercentual =
				((maisRecente.patrimonioTotal - anterior.patrimonioTotal) /
					anterior.patrimonioTotal) *
				100;
		} else if (maisRecente.patrimonioTotal > 0) {
			variacaoPatrimonioPercentual = 100;
		} else {
			variacaoPatrimonioPercentual = 0;
		}
	}

	return {
		historico,
		patrimonioAnterior,
		anoPatrimonioAnterior,
		variacaoPatrimonio,
		variacaoPatrimonioPercentual,
	};
}

async function extrairDetalhesDoTSE(
	eleicao: any,
	localidade: string,
	match: any,
	uf: string,
	nomePolitico: string,
): Promise<TseCandidateResult | null> {
	console.log(
		`[TSE DEBUG] ID encontrado: ${match.id} (${match.nomeUrna}). Buscando detalhes em ${localidade}...`,
	);
	const urlDetalhes = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${eleicao.ano}/${localidade}/${eleicao.idEleicao}/candidato/${match.id}`;
	let resDetalhes = await fetchWithTimeout(urlDetalhes, { timeout: 4000 });

	let jsonCpf = null;
	if (resDetalhes.ok) {
		try {
			const t1 = await resDetalhes.text();
			if (t1) jsonCpf = JSON.parse(t1);
		} catch (_e) {}
	}

	if (!jsonCpf) {
		const urlAlt = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/${eleicao.ano}/${uf}/${eleicao.idEleicao}/candidato/${match.id}`;
		resDetalhes = await fetchWithTimeout(urlAlt, { timeout: 4000 });
		if (resDetalhes.ok) {
			try {
				const t2 = await resDetalhes.text();
				if (t2) jsonCpf = JSON.parse(t2);
			} catch (_e) {}
		}
	}

	const cpfReal = jsonCpf?.cpf ? jsonCpf.cpf.replace(/\D/g, "") : null;
	const cnpjCampanha = jsonCpf?.cnpjcampanha
		? jsonCpf.cnpjcampanha.replace(/\D/g, "")
		: null;
	const documentoValido = cpfReal || cnpjCampanha;
	const isCnpj = !cpfReal && !!cnpjCampanha;

	if (documentoValido) {
		const nomeMunicipioRaw =
			jsonCpf?.localCandidatura || jsonCpf?.unidadeEleitoral?.nome || uf;
		const municipioRef = normalizeString(nomeMunicipioRaw).replace(/\s+/g, "-");

		// NOVIDADE: Tenta capturar o patrimônio total (bens) e a lista de bens
		let patrimonioTotal = jsonCpf?.totalDeBens || 0;
		let bensDeclarados = jsonCpf?.bens || [];

		// Se for zero no JSON principal, tenta o endpoint de bens específico (necessário para algumas eleições)
		if (patrimonioTotal === 0 && match.id) {
			try {
				const urlBens = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/candidato/${eleicao.ano}/${localidade}/${eleicao.idEleicao}/candidato/${match.id}/bens`;
				const resBens = await fetchWithTimeout(urlBens, { timeout: 3000 });
				if (resBens.ok) {
					const dataBens = await resBens.json();
					patrimonioTotal = dataBens.totalDeBens || 0;
					bensDeclarados = dataBens.bens || [];
				}
			} catch (_e) {}
		}

		console.log(
			`[TSE DEBUG] SUCESSO! Documento Extraído. isCnpj=${isCnpj} Patrimônio (${eleicao.ano}): ${patrimonioTotal}`,
		);

		const isMunicipal = ["11", "12", "13"].includes(String(jsonCpf?.cargo?.codigo || ""));
		const registroAtual: ItemHistoricoTse = {
			ano: Number(eleicao.ano),
			idEleicao: eleicao.idEleicao,
			cargo: jsonCpf?.cargo?.nome || match.cargo?.nome || "Candidato",
			partido: jsonCpf?.partido?.sigla || match.partido?.sigla,
			patrimonioTotal,
			bensDeclarados,
			idTse: match.id,
			nomeUrna: match.nomeUrna,
			nomeCompleto: jsonCpf?.nomeCompleto || match.nomeCompleto,
			urlFoto: jsonCpf?.fotoUrl || match.fotoUrl,
		};

		// Busca o histórico eleitoral e calcula a evolução patrimonial
		const dadosHistorico = await buscarHistoricoPatrimonioTse(
			jsonCpf?.nomeCompleto || match.nomeCompleto || nomePolitico,
			uf,
			isMunicipal,
			registroAtual,
		);

		return {
			cpf: documentoValido,
			documentoPrincipal: documentoValido,
			cnpjCampanha: cnpjCampanha,
			isCnpj,
			municipio: municipioRef,
			idUe: localidade,
			nome: jsonCpf?.nomeCompleto || match.nomeCompleto || nomePolitico,
			nomeUrna: match.nomeUrna || null,
			idTse: match.id,
			anoEleicao: Number(eleicao.ano),
			idEleicao: eleicao.idEleicao,
			patrimonioTotal,
			bensDeclarados,
			partido: jsonCpf?.partido?.sigla || match.partido?.sigla,
			urlFoto: jsonCpf?.fotoUrl || match.fotoUrl,
			historicoPatrimonio: dadosHistorico.historico,
			patrimonioAnterior: dadosHistorico.patrimonioAnterior,
			anoPatrimonioAnterior: dadosHistorico.anoPatrimonioAnterior,
			variacaoPatrimonio: dadosHistorico.variacaoPatrimonio,
			variacaoPatrimonioPercentual: dadosHistorico.variacaoPatrimonioPercentual,
		};
	}
	console.log(
		`[TSE DEBUG] Falha: CPF e CNPJ de Campanha não encontrados nos detalhes do candidato.`,
	);
	return null;
}

export async function buscarDoadoresTSE(
	nomePolitico: string,
	uf: string,
	cargoCodigo: string = "6",
	idEleicao: string = "20322002026",
): Promise<string[]> {
	try {
		const { supabaseAdmin } = await import("@/lib/supabase-admin");

		// TENTA CACHE PRIMEIRO
		const { data: cacheData, error: cacheErr } = await supabaseAdmin
			.from("tse_doadores_cache")
			.select("doadores")
			.ilike("nome_politico", nomePolitico)
			.eq("uf", uf.toUpperCase())
			.limit(1)
			.single();

		if (
			!cacheErr &&
			cacheData &&
			cacheData.doadores &&
			cacheData.doadores.length > 0
		) {
			console.log(
				`[TSE DOADORES] ✅ Cache Supabase: ${cacheData.doadores.length} doadores para ${nomePolitico} (bypass WAF).`,
			);
			return cacheData.doadores;
		}

		// 1. Busca o ID e Partido do candidato
		const ano =
			idEleicao === "20322002026"
				? "2026"
				: idEleicao === "2045202024"
					? "2024"
					: idEleicao === "2040602022"
						? "2022"
						: "2020";
		const urlBusca = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/listar/${ano}/${uf}/${idEleicao}/${cargoCodigo}/candidatos`;

		const resBusca = await fetchWithTimeout(urlBusca, {
			timeout: 5000,
			headers: {
				Accept: "application/json, text/plain, */*",
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});
		if (!resBusca.ok) return [];

		const dataBusca = await resBusca.json();
		const termoNorm = normalizeString(nomePolitico);

		const candidato = dataBusca.candidatos?.find((c: any) => {
			const cUrna = normalizeString(c.nomeUrna || "");
			const cNome = normalizeString(c.nomeCompleto || "");
			return (
				cUrna === termoNorm ||
				cNome === termoNorm ||
				matchPalavraInteira(cUrna, termoNorm) ||
				matchPalavraInteira(cNome, termoNorm)
			);
		});

		if (!candidato?.id) {
			console.log(
				`[TSE DEBUG] Candidato não encontrado na listagem para buscar doadores.`,
			);
			return [];
		}

		// 2. Monta a rota da Prestação de Contas Resumo (Bypass para rota /receitas que é estritamente bloqueada pelo WAF)
		// A API possui variação no idEleicao para contas de 2022, mas tentaremos os identificadores padrão
		// O TSE permite usar '90' como wildcard para partido e numero, escapando da necessidade de saber o numero correto do partido do candidato na epoca
		const urlContas = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/prestador/consulta/${idEleicao}/${ano}/${uf}/${cargoCodigo}/90/90/${candidato.id}`;

		console.log(
			`[TSE DEBUG] Buscando contas/ranking (WAF Bypass): ${urlContas}`,
		);

		// 3. Fetch imitando um Chrome real para driblar o Firewall do TSE
		const resContas = await fetchWithTimeout(urlContas, {
			method: "GET",
			timeout: 8000,
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.120 Safari/537.36",
				Accept: "application/json, text/plain, */*",
				"Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
				Referer: "https://divulgacandcontas.tse.jus.br/divulga/",
				"Sec-Fetch-Dest": "empty",
				"Sec-Fetch-Mode": "cors",
				"Sec-Fetch-Site": "same-origin",
				Connection: "keep-alive",
			},
		});

		if (!resContas.ok) {
			console.log(
				`[TSE DEBUG] WAF/TSE bloqueou ou não encontrou contas: HTTP ${resContas.status}`,
			);
			return [];
		}

		let dataContas;
		try {
			dataContas = await resContas.json();
		} catch (_e) {
			console.warn(
				`[TSE DOADORES] ⚠️  WAF bloqueou a rota /prestador/consulta (body não-JSON). Doadores de campanha indisponíveis.`,
			);
			console.warn(
				`[TSE DOADORES]    → Em produção, execute o ETL para popular o cache: npx tsx scripts/etl/tse-doadores-sync.ts`,
			);
			return [];
		}

		// Extrai CPFs e CNPJs do ranking de doadores e remove nulos
		const listaDoadores = (dataContas.rankingDoadores || [])
			.map((doacao: any) => {
				return doacao.cpfCnpj ? doacao.cpfCnpj.replace(/\D/g, "") : null;
			})
			.filter(Boolean);

		// Remove duplicatas usando Set
		const doadoresUnicos = [...new Set<string>(listaDoadores)];

		if (doadoresUnicos.length > 0) {
			console.log(
				`[TSE DOADORES] ✅ Extraídos ${doadoresUnicos.length} doadores da API oficial (WAF Bypass).`,
			);
		} else {
			console.log(`[TSE DOADORES] ℹ️  Candidato não possui doadores registrados na prestação de contas.`);
		}

		console.log(
			`[TSE DEBUG] ${doadoresUnicos.length} doadores únicos capturados! Salvando no cache Supabase...`,
		);

		if (doadoresUnicos.length > 0) {
			try {
				const { supabaseAdmin } = await import("@/lib/supabase-admin");
				await supabaseAdmin.from("tse_doadores_cache").upsert(
					{
						nome_politico: nomePolitico,
						uf: uf,
						doadores: doadoresUnicos,
					},
					{ onConflict: "nome_politico, uf" },
				);
			} catch (err) {
				console.warn("[TSE DEBUG] Erro ao salvar doadores no cache", err);
			}
		}

		return doadoresUnicos;
	} catch (e) {
		console.warn(
			`[TSE] Falha severa ao buscar doadores para ${nomePolitico}:`,
			e,
		);
		return [];
	}
}
