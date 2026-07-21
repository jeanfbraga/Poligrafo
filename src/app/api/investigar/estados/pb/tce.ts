import { buscarProxyOsint } from "../../proxy_osint";
import { fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Paraíba (PB)
// Fonte: Sagres Online / Portal de Dados Abertos TCE-PB
// ==========================================

// Optamos por tentar a API REST do Sagres Captura / Dados Abertos
const SAGRES_API_BASE = "https://sagresonline.tce.pb.gov.br/api";
const TIMEOUT_PB = 15000;

// O TSE atua como fallback geográfico primário. Apenas as despesas são tratadas no nível do estado.

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

	const malhaTce: any[] = [];
	const headers = {
		Accept: "application/json, text/plain, */*",
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Poligrafo/1.0",
		Referer: "https://sagresonline.tce.pb.gov.br/",
	};

	try {
		// Tentativa 1: Endpoint de Empenhos/Despesas
		const urlDespesas = `${SAGRES_API_BASE}/despesas?documento=${identificador}&municipio=${encodeURIComponent(municipioUri)}`;
		const res = await fetchWithTimeout(urlDespesas, {
			headers,
			timeout: TIMEOUT_PB,
		});

		if (res.ok) {
			const data = await res.json();
			if (Array.isArray(data)) {
				data.forEach((d: any, index: number) => {
					malhaTce.push({
						id: `tcepb-desp-${Date.now()}-${index}`,
						type: "DESPESA_PUBLICA",
						data: {
							label: `Empenho SAGRES: ${d.numero_empenho || "N/I"}`,
							valor: parseFloat(d.valor_empenhado || d.valor || 0),
							fornecedor:
								d.credor || d.favorecido || nomeParaBusca || "Desconhecido",
							data: d.data_emissao || d.data || "N/I",
							url: d.url || urlDespesas,
							descricao:
								d.historico ||
								d.objeto ||
								"Despesa registrada no TCE-PB (Sagres)",
						},
					});
				});
			}
		} else if (res.status === 403 || res.status === 503) {
			console.warn(
				`[TCE-PB] Bloqueio WAF (Cloudflare Turnstile) detectado no endpoint de despesas. Status: ${res.status}`,
			);
		}
	} catch (e: any) {
		console.warn(`[TCE-PB] Erro ao buscar despesas no Sagres:`, e.message || e);
	}

	try {
		// Tentativa 2: Endpoint de Contratos (Licitações)
		const urlContratos = `${SAGRES_API_BASE}/contratos?cpfCnpj=${identificador}`;
		const resContratos = await fetchWithTimeout(urlContratos, {
			headers,
			timeout: TIMEOUT_PB,
		});

		if (resContratos.ok) {
			const dataC = await resContratos.json();
			if (Array.isArray(dataC)) {
				dataC.forEach((c: any, index: number) => {
					malhaTce.push({
						id: `tcepb-contrato-${Date.now()}-${index}`,
						type: "CONTRATO",
						data: {
							label: `Contrato SAGRES: ${c.numero_contrato || "N/I"}`,
							valor: parseFloat(c.valor_contratado || c.valor || 0),
							fornecedor:
								c.contratado || c.favorecido || nomeParaBusca || "Desconhecido",
							data: c.data_assinatura || c.data || "N/I",
							url: c.url || urlContratos,
							descricao:
								c.objeto || "Contrato firmado na esfera municipal (PB)",
						},
					});
				});
			}
		}
	} catch (e: any) {
		console.warn(
			`[TCE-PB] Erro ao buscar contratos no Sagres:`,
			e.message || e,
		);
	}

	// Fallback Inteligente: Se falhou na conexão com Sagres ou retornou vazio, cruzamos com dados Federais
	if (malhaTce.length === 0) {
		console.log(
			`[TCE-PB] Sem retornos do Sagres. Acionando Fallback do TransfereGov/Federal.`,
		);
		const fallback = await buscarProxyOsint(identificador, nomeParaBusca);
		return fallback.despesasFederais || [];
	}

	return malhaTce;
}
