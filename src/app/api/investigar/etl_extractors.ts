import { parse } from "csv-parse/sync";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchWithTimeout, normalizeString } from "./tse";

// ==========================================
// CÂMARA DOS DEPUTADOS
// ==========================================
export async function buscarDespesasCamara(
	idDeputado: number,
	sendEvent?: any,
) {
	try {
		const { data, error } = await supabaseAdmin
			.from("ceap_despesas_cache")
			.select("*")
			.eq("id_deputado", idDeputado)
			.eq("casa", "CAMARA")
			.order("valor_documento", { ascending: false })
			.limit(60);

		if (!error && data && data.length > 0) {
			if (sendEvent) {
				sendEvent("STATUS", {
					msg: `[CACHE] Despesas da Câmara resgatadas instantaneamente do cache local (Offline-First).`,
				});
			}

			return data.map((d: any) => ({
				cnpjCpfFornecedor: d.cnpj_cpf_fornecedor || "00000000000000",
				nomeFornecedor: d.nome_fornecedor || "FORNECEDOR NÃO IDENTIFICADO",
				tipoDespesa: d.tipo_despesa,
				valorDocumento: Number(d.valor_documento || 0),
				dataDocumento: d.data_documento,
				urlDocumento: d.url_documento,
			}));
		}
	} catch (cacheErr: any) {
		console.warn("[CACHE MISS] buscarDespesasCamara falhou, tentando API:", cacheErr.message);
	}

	const anoAtual = new Date().getFullYear();
	let todasDespesasRaw: any[] = [];

	try {
		// Tenta buscar 3 páginas de 100 itens (300 itens)
		for (let pag = 1; pag <= 3; pag++) {
			const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${idDeputado}/despesas?ano=${anoAtual}&ano=${anoAtual - 1}&itens=100&pagina=${pag}`;
			const res = await fetchWithTimeout(url, { timeout: 15000 });

			if (!res.ok) {
				if (pag === 1) throw new Error(`Status HTTP: ${res.status}`);
				break;
			}

			const json = await res.json();
			const batch = Array.isArray(json) ? json : json.dados || [];
			todasDespesasRaw = todasDespesasRaw.concat(batch);

			if (batch.length < 100) break;
		}

		if (todasDespesasRaw.length === 0) {
			console.warn(
				`[CÂMARA FALLBACK] Sem despesas filtradas por valor/ano. Puxando as mais recentes...`,
			);
			const urlFallback = `https://dadosabertos.camara.leg.br/api/v2/deputados/${idDeputado}/despesas?ordenarPor=ano&ordem=DESC&itens=100`;
			const res = await fetchWithTimeout(urlFallback, { timeout: 15000 });
			if (res.ok) {
				const json = await res.json();
				todasDespesasRaw = Array.isArray(json) ? json : json.dados || [];
			}
		}

		const despesasConvertidas = todasDespesasRaw.map((d: any) => ({
			cnpjCpfFornecedor: d.cnpjCpfFornecedor
				? d.cnpjCpfFornecedor.replace(/\D/g, "")
				: "00000000000000",
			nomeFornecedor: d.nomeFornecedor || "FORNECEDOR NÃO IDENTIFICADO",
			tipoDespesa: d.tipoDespesa,
			valorDocumento: Number(d.valorDocumento || 0),
			dataDocumento: d.dataDocumento,
			urlDocumento: d.urlDocumento,
		}));

		despesasConvertidas.sort((a, b) => b.valorDocumento - a.valorDocumento);
		return despesasConvertidas.slice(0, 60);
	} catch (e: any) {
		console.error(
			"[ETL] Erro buscarDespesasCamara (API oficial).",
			e.message,
		);

		if (sendEvent) {
			sendEvent("API_WARNING", {
				fonte: "Câmara dos Deputados",
				mensagem: `Falha temporária ao extrair os gastos do deputado federal. A API de Dados Abertos falhou e não há dados em cache para este ID.`,
			});
		}
		return [];
	}
}

// ==========================================
// SENADO FEDERAL
// ==========================================
export async function buscarDespesasSenado(
	_idSenador: string | number,
	nomeSenador: string,
	sendEvent?: any,
) {
	try {
		try {
			const { data, error } = await supabaseAdmin
				.from("ceap_despesas_cache")
				.select("*")
				.eq("id_deputado", Number(_idSenador))
				.eq("casa", "SENADO")
				.order("valor_documento", { ascending: false })
				.limit(60);

			if (!error && data && data.length > 0) {
				if (sendEvent) {
					sendEvent("STATUS", {
						msg: `[CACHE] Despesas do Senado resgatadas instantaneamente do cache local (Offline-First).`,
					});
				}

				return data.map((d: any) => ({
					cnpjCpfFornecedor: d.cnpj_cpf_fornecedor || "00000000000000",
					nomeFornecedor: d.nome_fornecedor || "FORNECEDOR NÃO IDENTIFICADO",
					tipoDespesa: d.tipo_despesa,
					valorDocumento: Number(d.valor_documento || 0),
					dataDocumento: d.data_documento,
					urlDocumento: d.url_documento,
				}));
			}
		} catch (cacheErr: any) {
			console.warn("[CACHE MISS] buscarDespesasSenado falhou, tentando API:", cacheErr.message);
		}

		const anoAtual = new Date().getFullYear();
		// A API do Senado é instável e os arquivos anuais nem sempre existem —
		// tenta o ano corrente e os dois anteriores antes de desistir.
		const anosTentativa = [anoAtual, anoAtual - 1, anoAtual - 2];
		let csvText: string | null = null;
		let anoUsado = anoAtual;
		let ultimoStatus = 0;
		for (const ano of anosTentativa) {
			const url = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${ano}/csv`;
			try {
				const res = await fetchWithTimeout(url, { timeout: 15000 });
				if (res.ok) {
					csvText = await res.text();
					anoUsado = ano;
					break;
				}
				ultimoStatus = res.status;
				console.warn(
					`[SENADO] Erro HTTP ${res.status} ao baixar CSV CEAPS ${ano}`,
				);
			} catch (e: any) {
				console.warn(`[SENADO] Falha ao baixar CSV CEAPS ${ano}:`, e.message);
			}
		}

		if (!csvText) {
			if (sendEvent) {
				sendEvent("API_WARNING", {
					fonte: "Senado Federal",
					mensagem: `O Portal de Dados Abertos do Senado está fora do ar (HTTP ${ultimoStatus || "sem resposta"}) para ${anosTentativa.join("/")}. Gastos de gabinete indisponíveis no momento.`,
				});
			}
			return [];
		}

		if (sendEvent && anoUsado !== anoAtual) {
			sendEvent("STATUS", {
				msg: `[SENADO] CEAPS ${anoAtual} indisponível. Usando exercício de ${anoUsado}.`,
			});
		}

		const records = parse(csvText, {
			columns: true,
			skip_empty_lines: true,
			delimiter: ";",
			quote: '"',
			relax_quotes: true,
			relax_column_count: true,
		});

		const despesasSenador = records.filter((row: any) => {
			const nomeCSV = normalizeString(row.NOME_SENADOR || "");
			const nomeBuscado = normalizeString(nomeSenador);
			return nomeCSV.includes(nomeBuscado) || nomeBuscado.includes(nomeCSV);
		});

		const despesasConvertidas = despesasSenador.map((d: any) => {
			const valorStr = (d.VALOR_REEMBOLSADO || "0")
				.replace(/\./g, "")
				.replace(",", ".");
			let valorNum = Number(valorStr);
			if (Number.isNaN(valorNum)) valorNum = 0;

			return {
				cnpjCpfFornecedor: d.CPF_CNPJ_FORNECEDOR
					? d.CPF_CNPJ_FORNECEDOR.replace(/\D/g, "")
					: "00000000000000",
				nomeFornecedor: d.NOME_FORNECEDOR || "FORNECEDOR NÃO IDENTIFICADO",
				tipoDespesa: d.TIPO_DESPESA || "DESPESA DO SENADO",
				valorDocumento: valorNum,
				dataDocumento: d.DATA || null,
				urlDocumento: null,
			};
		});

		despesasConvertidas.sort(
			(a: any, b: any) => b.valorDocumento - a.valorDocumento,
		);
		return despesasConvertidas.slice(0, 60);
	} catch (e: any) {
		console.error("[ETL] Erro buscarDespesasSenado", e);
		if (sendEvent) {
			sendEvent("API_WARNING", {
				fonte: "Senado Federal",
				mensagem: `O servidor do Senado não respondeu a tempo. Falha: ${e.message}. Tente novamente mais tarde.`,
			});
		}
		return [];
	}
}

// ==========================================
// EMENDAS PARLAMENTARES
// ==========================================
function parseBRL(value: any): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const cleaned = value.replace(/\./g, "").replace(",", ".");
		const parsed = Number(cleaned);
		return Number.isNaN(parsed) ? 0 : parsed;
	}
	return 0;
}

function classificarRiscoEmenda(tipoEmenda: string): {
	nivel: string;
	label: string;
} {
	const tipo = (tipoEmenda || "").toLowerCase();
	if (tipo.includes("relator"))
		return { nivel: "CRÍTICO", label: "EMENDA PIX (Relator/RP9)" };
	if (tipo.includes("bancada"))
		return { nivel: "ALTO", label: "Emenda de Bancada" };
	if (tipo.includes("comiss"))
		return { nivel: "MODERADO", label: "Emenda de Comissão" };
	return { nivel: "NORMAL", label: "Emenda Individual" };
}

export async function buscarEmendas(nomePolitico: string) {
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return { emendas: [], resumo: null };

	let todasEmendas: any[] = [];
	const MAX_PAGINAS = 10;

	try {
		for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
			const params = new URLSearchParams({
				nomeAutor: nomePolitico.toUpperCase(),
				pagina: String(pagina),
			});
			const res = await fetchWithTimeout(
				`https://api.portaldatransparencia.gov.br/api-de-dados/emendas?${params.toString()}`,
				{
					headers: { "chave-api-dados": apiKey },
					timeout: 15000,
				},
			);
			if (!res.ok) break;
			const json = await res.json();
			const batch = Array.isArray(json) ? json : json.data || [];
			if (batch.length === 0) break;
			todasEmendas = todasEmendas.concat(batch);
			if (batch.length < 15) break;
		}
	} catch (e: any) {
		if (e.name === "AbortError" || e.code === 20) {
			console.warn("[ETL] buscarEmendas excedeu o tempo limite da API (Timeout).");
		} else {
			console.error("[ETL Error] buscarEmendas pagination", e);
		}
	}

	if (todasEmendas.length === 0) return { emendas: [], resumo: null };

	const emendasEnriquecidas = todasEmendas.map((e: any) => {
		const empenhado = parseBRL(e.valorEmpenhado);
		const liquidado = parseBRL(e.valorLiquidado);
		const pago = parseBRL(e.valorPago);
		const restoInscrito = parseBRL(e.valorRestoInscrito);
		const restoCancelado = parseBRL(e.valorRestoCancelado);
		const restoPago = parseBRL(e.valorRestoPago);
		const totalEfetivamentePago = pago + restoPago;
		const percentualExecucao =
			empenhado > 0 ? Math.round((totalEfetivamentePago / empenhado) * 100) : 0;
		const riscoTipo = classificarRiscoEmenda(e.tipoEmenda);
		const isFantasma = empenhado > 0 && totalEfetivamentePago === 0;

		const alertas: string[] = [];
		if (isFantasma)
			alertas.push("[ALERTA] Emenda Fantasma: Empenhada mas NUNCA paga.");
		if (riscoTipo.nivel === "CRÍTICO")
			alertas.push(
				"[ORÇAMENTO SECRETO] Emenda do tipo Relator (RP9/PIX) detectada.",
			);
		if (percentualExecucao > 0 && percentualExecucao < 30)
			alertas.push(
				`[ATENÇÃO] Execução muito baixa: apenas ${percentualExecucao}% pago.`,
			);

		return {
			...e,
			_empenhado: empenhado,
			_liquidado: liquidado,
			_pago: pago,
			_restoInscrito: restoInscrito,
			_restoCancelado: restoCancelado,
			_restoPago: restoPago,
			_totalEfetivamentePago: totalEfetivamentePago,
			_percentualExecucao: percentualExecucao,
			_riscoTipo: riscoTipo,
			_isFantasma: isFantasma,
			_alertas: alertas,
		};
	});

	emendasEnriquecidas.sort((a: any, b: any) => b._empenhado - a._empenhado);

	const totalEmpenhado = emendasEnriquecidas.reduce(
		(acc: number, e: any) => acc + e._empenhado,
		0,
	);
	const totalPago = emendasEnriquecidas.reduce(
		(acc: number, e: any) => acc + e._totalEfetivamentePago,
		0,
	);
	const percentualExecucao =
		totalEmpenhado > 0 ? Math.round((totalPago / totalEmpenhado) * 100) : 0;
	const fantasmas = emendasEnriquecidas.filter(
		(e: any) => e._isFantasma,
	).length;
	const emendasPIX = emendasEnriquecidas.filter(
		(e: any) => e._riscoTipo.nivel === "CRÍTICO",
	).length;

	const porTipo: Record<string, number> = {};
	emendasEnriquecidas.forEach((e: any) => {
		const label = e._riscoTipo.label;
		porTipo[label] = (porTipo[label] || 0) + 1;
	});

	return {
		emendas: emendasEnriquecidas,
		resumo: {
			totalEmendas: emendasEnriquecidas.length,
			totalEmpenhado,
			totalPago,
			percentualExecucao,
			fantasmas,
			emendasPIX,
			porTipo,
			topLocalidades: [],
			alertas: [],
		},
	};
}
