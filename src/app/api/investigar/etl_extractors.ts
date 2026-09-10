import { parse } from "csv-parse/sync";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchWithTimeout, normalizeString } from "./tse";

// ==========================================
// CÂMARA DOS DEPUTADOS
// ==========================================
async function buscarDespesasCamaraCache(cleanId: number, sendEvent?: any) {
	try {
		const { data, error } = await supabaseAdmin
			.from("ceap_despesas_cache")
			.select("*")
			.eq("id_deputado", cleanId)
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
	return [];
}

async function fetchPaginaDespesasCamara(url: string) {
	const res = await fetchWithTimeout(url, { timeout: 15000 });
	if (!res.ok) return null;
	const json = await res.json();
	return Array.isArray(json) ? json : json.dados || [];
}

async function coletarDespesasCamaraApi(idDeputado: number | string) {
	const anoAtual = new Date().getFullYear();
	const todasDespesasRaw: any[] = [];

	for (const ano of [anoAtual, anoAtual - 1]) {
		for (let pag = 1; pag <= 2; pag++) {
			const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${idDeputado}/despesas?ano=${ano}&itens=100&pagina=${pag}`;
			const batch = await fetchPaginaDespesasCamara(url);
			if (!batch || batch.length === 0) break;
			todasDespesasRaw.push(...batch);
			if (batch.length < 100) break;
		}
		if (todasDespesasRaw.length >= 60) break;
	}

	if (todasDespesasRaw.length === 0) {
		const urlFallback = `https://dadosabertos.camara.leg.br/api/v2/deputados/${idDeputado}/despesas?ordenarPor=ano&ordem=DESC&itens=100`;
		const batchFallback = await fetchPaginaDespesasCamara(urlFallback);
		if (batchFallback) {
			todasDespesasRaw.push(...batchFallback);
		}
	}

	return todasDespesasRaw;
}

function formatarDespesasCamara(rawDespesas: any[]) {
	const despesasConvertidas = rawDespesas.map((d: any) => ({
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
}

export async function buscarDespesasCamara(
	idDeputado: number | string,
	sendEvent?: any,
) {
	const cleanId = Number(String(idDeputado).replace(/\D/g, ""));
	if (!cleanId || isNaN(cleanId)) return [];

	const doCache = await buscarDespesasCamaraCache(cleanId, sendEvent);
	if (doCache.length > 0) return doCache;

	try {
		const raw = await coletarDespesasCamaraApi(idDeputado);
		return formatarDespesasCamara(raw);
	} catch (e: any) {
		console.error("[ETL] Erro buscarDespesasCamara (API oficial).", e.message);
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
async function buscarDespesasSenadoCache(idSenador: number, sendEvent?: any) {
	try {
		const { data, error } = await supabaseAdmin
			.from("ceap_despesas_cache")
			.select("*")
			.eq("id_deputado", idSenador)
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
	return [];
}

async function baixarCsvSenado(anosTentativa: number[]): Promise<{ csvText: string | null; anoUsado: number; ultimoStatus: number }> {
	let csvText: string | null = null;
	let anoUsado = anosTentativa[0];
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
		} catch (e: any) {
			console.warn(`[SENADO] Falha ao baixar CSV CEAPS ${ano}:`, e.message);
		}
	}

	return { csvText, anoUsado, ultimoStatus };
}

function parseLinhaSenado(d: any) {
	const valorStr = (d.VALOR_REEMBOLSADO || "0").replace(/\./g, "").replace(",", ".");
	let valorNum = Number(valorStr);
	if (Number.isNaN(valorNum)) valorNum = 0;

	return {
		cnpjCpfFornecedor: d.CPF_CNPJ_FORNECEDOR ? d.CPF_CNPJ_FORNECEDOR.replace(/\D/g, "") : "00000000000000",
		nomeFornecedor: d.NOME_FORNECEDOR || "FORNECEDOR NÃO IDENTIFICADO",
		tipoDespesa: d.TIPO_DESPESA || "DESPESA DO SENADO",
		valorDocumento: valorNum,
		dataDocumento: d.DATA || null,
		urlDocumento: null,
	};
}

function parseDespesasSenadoCsv(csvText: string, nomeSenador: string) {
	const records = parse(csvText, {
		columns: true,
		skip_empty_lines: true,
		delimiter: ";",
		quote: '"',
		relax_quotes: true,
		relax_column_count: true,
	});

	const nomeBuscado = normalizeString(nomeSenador);
	const despesasSenador = records.filter((row: any) => {
		const nomeCSV = normalizeString(row.NOME_SENADOR || "");
		return nomeCSV.includes(nomeBuscado) || nomeBuscado.includes(nomeCSV);
	});

	const despesasConvertidas = despesasSenador.map(parseLinhaSenado);
	despesasConvertidas.sort((a: any, b: any) => b.valorDocumento - a.valorDocumento);
	return despesasConvertidas.slice(0, 60);
}

function notificarFalhaSenado(sendEvent: any, ultimoStatus: number, anos: number[]) {
	if (!sendEvent) return;
	const anosFormatados = anos.join("/");
	sendEvent("API_WARNING", {
		fonte: "Senado Federal",
		mensagem: `O Portal de Dados Abertos do Senado está fora do ar (HTTP ${ultimoStatus || "sem resposta"}) para ${anosFormatados}. Gastos de gabinete indisponíveis no momento.`,
	});
}

function notificarExercicioSenado(sendEvent: any, anoUsado: number, anoAtual: number) {
	if (!sendEvent) return;
	if (anoUsado === anoAtual) return;
	sendEvent("STATUS", {
		msg: `[SENADO] CEAPS ${anoAtual} indisponível. Usando exercício de ${anoUsado}.`,
	});
}

async function tentarObterCacheSenado(idSenador: string | number, sendEvent?: any) {
	const cleanId = Number(idSenador);
	if (isNaN(cleanId)) return [];
	if (cleanId <= 0) return [];
	return buscarDespesasSenadoCache(cleanId, sendEvent);
}

export async function buscarDespesasSenado(
	_idSenador: string | number,
	nomeSenador: string,
	sendEvent?: any,
) {
	const doCache = await tentarObterCacheSenado(_idSenador, sendEvent);
	if (doCache.length > 0) return doCache;

	const anoAtual = new Date().getFullYear();
	const anosTentativa = [anoAtual, anoAtual - 1, anoAtual - 2];

	try {
		const { csvText, anoUsado, ultimoStatus } = await baixarCsvSenado(anosTentativa);

		if (!csvText) {
			notificarFalhaSenado(sendEvent, ultimoStatus, anosTentativa);
			return [];
		}

		notificarExercicioSenado(sendEvent, anoUsado, anoAtual);
		return parseDespesasSenadoCsv(csvText, nomeSenador);
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

async function coletarEmendasTransparencia(nomePolitico: string, apiKey: string) {
	const todasEmendas: any[] = [];
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
			todasEmendas.push(...batch);
			if (batch.length < 15) break;
		}
	} catch (e: any) {
		if (e.name === "AbortError" || e.code === 20) {
			console.warn("[ETL] buscarEmendas excedeu o tempo limite da API (Timeout).");
		} else {
			console.error("[ETL Error] buscarEmendas pagination", e);
		}
	}

	return todasEmendas;
}

function gerarAlertasEmenda(isFantasma: boolean, riscoNivel: string, percentualExecucao: number): string[] {
	const alertas: string[] = [];
	if (isFantasma) {
		alertas.push("[ALERTA] Emenda Fantasma: Empenhada mas NUNCA paga.");
	}
	if (riscoNivel === "CRÍTICO") {
		alertas.push("[ORÇAMENTO SECRETO] Emenda do tipo Relator (RP9/PIX) detectada.");
	}
	if (percentualExecucao > 0 && percentualExecucao < 30) {
		alertas.push(`[ATENÇÃO] Execução muito baixa: apenas ${percentualExecucao}% pago.`);
	}
	return alertas;
}

function enriquecerEmenda(e: any) {
	const empenhado = parseBRL(e.valorEmpenhado);
	const liquidado = parseBRL(e.valorLiquidado);
	const pago = parseBRL(e.valorPago);
	const restoInscrito = parseBRL(e.valorRestoInscrito);
	const restoCancelado = parseBRL(e.valorRestoCancelado);
	const restoPago = parseBRL(e.valorRestoPago);
	const totalEfetivamentePago = pago + restoPago;
	const percentualExecucao = empenhado > 0 ? Math.round((totalEfetivamentePago / empenhado) * 100) : 0;
	const riscoTipo = classificarRiscoEmenda(e.tipoEmenda);
	const isFantasma = empenhado > 0 && totalEfetivamentePago === 0;
	const alertas = gerarAlertasEmenda(isFantasma, riscoTipo.nivel, percentualExecucao);

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
}

function calcularResumoEmendas(emendasEnriquecidas: any[]) {
	const totalEmpenhado = emendasEnriquecidas.reduce((acc: number, e: any) => acc + e._empenhado, 0);
	const totalPago = emendasEnriquecidas.reduce((acc: number, e: any) => acc + e._totalEfetivamentePago, 0);
	const percentualExecucao = totalEmpenhado > 0 ? Math.round((totalPago / totalEmpenhado) * 100) : 0;
	const fantasmas = emendasEnriquecidas.filter((e: any) => e._isFantasma).length;
	const emendasPIX = emendasEnriquecidas.filter((e: any) => e._riscoTipo.nivel === "CRÍTICO").length;

	const porTipo: Record<string, number> = {};
	for (const e of emendasEnriquecidas) {
		const label = e._riscoTipo.label;
		porTipo[label] = (porTipo[label] || 0) + 1;
	}

	return {
		totalEmendas: emendasEnriquecidas.length,
		totalEmpenhado,
		totalPago,
		percentualExecucao,
		fantasmas,
		emendasPIX,
		porTipo,
		topLocalidades: [],
		alertas: [],
	};
}

export async function buscarEmendas(nomePolitico: string) {
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return { emendas: [], resumo: null };

	const todasEmendas = await coletarEmendasTransparencia(nomePolitico, apiKey);
	if (todasEmendas.length === 0) return { emendas: [], resumo: null };

	const emendasEnriquecidas = todasEmendas.map(enriquecerEmenda);
	emendasEnriquecidas.sort((a: any, b: any) => b._empenhado - a._empenhado);

	return {
		emendas: emendasEnriquecidas,
		resumo: calcularResumoEmendas(emendasEnriquecidas),
	};
}
