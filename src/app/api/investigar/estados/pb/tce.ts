import { primeiroValorNumero, primeiroValorTexto } from "@/lib/utils";
import { buscarProxyOsint } from "../../proxy_osint";
import { fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Paraíba (PB)
// Fonte: Sagres Online / Portal de Dados Abertos TCE-PB
// ==========================================

const SAGRES_API_BASE = "https://sagresonline.tce.pb.gov.br/api";
const TIMEOUT_PB = 15000;

function parseDespesaPB(
	d: any,
	index: number,
	urlDespesas: string,
	nomeParaBusca?: string,
) {
	const numero = primeiroValorTexto(d.numero_empenho, "N/I");
	const valor = primeiroValorNumero(d.valor_empenhado, d.valor);
	const fornecedor = primeiroValorTexto(
		d.credor,
		d.favorecido,
		nomeParaBusca,
		"Desconhecido",
	);
	const data = primeiroValorTexto(d.data_emissao, d.data, "N/I");
	const descricao = primeiroValorTexto(
		d.historico,
		d.objeto,
		"Despesa registrada no TCE-PB (Sagres)",
	);
	const url = primeiroValorTexto(d.url, urlDespesas);

	return {
		id: `tcepb-desp-${Date.now()}-${index}`,
		type: "DESPESA_PUBLICA",
		data: {
			label: `Empenho SAGRES: ${numero}`,
			valor,
			fornecedor,
			data,
			url,
			descricao,
		},
	};
}

function parseContratoPB(
	c: any,
	index: number,
	urlContratos: string,
	nomeParaBusca?: string,
) {
	const numero = primeiroValorTexto(c.numero_contrato, "N/I");
	const valor = primeiroValorNumero(c.valor_contratado, c.valor);
	const fornecedor = primeiroValorTexto(
		c.contratado,
		c.favorecido,
		nomeParaBusca,
		"Desconhecido",
	);
	const data = primeiroValorTexto(c.data_assinatura, c.data, "N/I");
	const descricao = primeiroValorTexto(
		c.objeto,
		"Contrato firmado na esfera municipal (PB)",
	);
	const url = primeiroValorTexto(c.url, urlContratos);

	return {
		id: `tcepb-contrato-${Date.now()}-${index}`,
		type: "CONTRATO",
		data: {
			label: `Contrato SAGRES: ${numero}`,
			valor,
			fornecedor,
			data,
			url,
			descricao,
		},
	};
}

async function extrairDespesasSagresPB(
	identificador: string,
	municipioUri: string,
	headers: any,
	nomeParaBusca?: string,
): Promise<any[]> {
	try {
		const url = `${SAGRES_API_BASE}/despesas?documento=${identificador}&municipio=${encodeURIComponent(municipioUri)}`;
		const res = await fetchWithTimeout(url, { headers, timeout: TIMEOUT_PB });
		if (!res.ok) {
			if (res.status === 403 || res.status === 503) {
				console.warn(
					`[TCE-PB] Bloqueio WAF detectado no endpoint de despesas. Status: ${res.status}`,
				);
			}
			return [];
		}
		const data = await res.json();
		if (!Array.isArray(data)) return [];
		return data.map((d: any, index: number) =>
			parseDespesaPB(d, index, url, nomeParaBusca),
		);
	} catch (e: any) {
		console.warn(`[TCE-PB] Erro ao buscar despesas no Sagres:`, e.message || e);
		return [];
	}
}

async function extrairContratosSagresPB(
	identificador: string,
	headers: any,
	nomeParaBusca?: string,
): Promise<any[]> {
	try {
		const url = `${SAGRES_API_BASE}/contratos?cpfCnpj=${identificador}`;
		const res = await fetchWithTimeout(url, { headers, timeout: TIMEOUT_PB });
		if (!res.ok) return [];
		const data = await res.json();
		if (!Array.isArray(data)) return [];
		return data.map((c: any, index: number) =>
			parseContratoPB(c, index, url, nomeParaBusca),
		);
	} catch (e: any) {
		console.warn(`[TCE-PB] Erro ao buscar contratos no Sagres:`, e.message || e);
		return [];
	}
}

export async function buscarDespesasMunicipalPB(
	identificador: string,
	nomeParaBusca?: string,
	municipioUri?: string,
	casa?: string,
) {
	if (!municipioUri) {
		console.log(
			`[TCE-PB] Sem município definido. Redirecionando para Proxy OSINT genérico.`,
		);
		const proxy = await buscarProxyOsint(identificador, nomeParaBusca);
		return proxy.despesasFederais || [];
	}

	console.log(
		`[TCE-PB] Iniciando extração nativa de Despesas/Contratos para: ${identificador} em ${municipioUri} (${casa})`,
	);

	const headers = {
		Accept: "application/json, text/plain, */*",
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Poligrafo/1.0",
		Referer: "https://sagresonline.tce.pb.gov.br/",
	};

	const [despesas, contratos] = await Promise.all([
		extrairDespesasSagresPB(identificador, municipioUri, headers, nomeParaBusca),
		extrairContratosSagresPB(identificador, headers, nomeParaBusca),
	]);

	const malhaTce = [...despesas, ...contratos];
	if (malhaTce.length === 0) {
		console.log(
			`[TCE-PB] Sem retornos do Sagres. Acionando Fallback do TransfereGov/Federal.`,
		);
		const fallback = await buscarProxyOsint(identificador, nomeParaBusca);
		return fallback.despesasFederais || [];
	}

	return malhaTce;
}
