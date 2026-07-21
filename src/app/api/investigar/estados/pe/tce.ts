import { buscarCpfNoTSE, fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Pernambuco
// Engenharia Reversa do pacote mcp-brasil
// ==========================================

const API_BASE_PE = "https://sistemas.tce.pe.gov.br/DadosAbertos";
const PARAMS_TIMEOUT = 12000;

export async function buscarMunicipalPE(nomeBuscado: string): Promise<
	{
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		isCnpj?: boolean;
		casa: "CAMARA_MUNICIPAL" | "PREFEITURA";
		uri?: string;
	}[]
> {
	const termo = nomeBuscado.toLowerCase().trim();
	console.log(
		`[>> MUNICIPAL PE ENTRY] buscarMunicipalPE chamado para: ${nomeBuscado}`,
	);
	const resultados: any[] = [];

	// Tenta achar Vereador (13)
	let tseResult = await buscarCpfNoTSE(termo, "PE", "13");
	let tipoCargo: "CAMARA_MUNICIPAL" | "PREFEITURA" = "CAMARA_MUNICIPAL";
	let tituloCargo = "Vereador";

	if (!tseResult) {
		// Tenta achar Prefeito (11)
		tseResult = await buscarCpfNoTSE(termo, "PE", "11");
		if (tseResult) {
			tipoCargo = "PREFEITURA";
			tituloCargo = "Prefeito";
		}
	}

	if (tseResult) {
		const nomeCompleto =
			tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
		const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
		const nomeExibicao =
			nomeUrna && nomeUrna !== nomeCompleto
				? `${nomeCompleto} (${nomeUrna})`
				: nomeCompleto;
		resultados.push({
			ref: `PE:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
			id: tseResult.documentoPrincipal,
			nome: nomeExibicao,
			cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, " ").toUpperCase()}`,
			uf: "PE",
			isCnpj: tseResult.isCnpj,
			casa: tipoCargo,
			uri: tseResult.municipio,
		});
	}

	return resultados;
}

export async function buscarDespesasMunicipalPE(
	identificador: string,
	nomeParaBusca?: string,
	municipioUri?: string,
	casa?: string,
): Promise<any[]> {
	const docLimpo = String(identificador).replace(/\D/g, "");
	const despesasApuradas: any[] = [];
	const anoAtual = new Date().getFullYear();

	try {
		// Lógica Inteligente para Prefeitos: Busca as despesas e contratos do MUNICÍPIO
		if (casa === "PREFEITURA" && municipioUri) {
			const municipioAjustado = municipioUri.replace(/-/g, " ").toUpperCase();
			console.log(
				`[TCE-PE] Alvo é PREFEITO. Buscando Despesas Municipais e Contratos para: ${municipioAjustado}...`,
			);

			const urlDespesas = `${API_BASE_PE}/DespesasMunicipais!json?ANOREFERENCIA=${anoAtual}&MUNICIPIO=${encodeURIComponent(municipioAjustado)}`;
			const urlContratos = `${API_BASE_PE}/Contratos!json?ANOREFERENCIA=${anoAtual}&MUNICIPIO=${encodeURIComponent(municipioAjustado)}`;

			const [resDespesas, resContratos] = await Promise.allSettled([
				fetchWithTimeout(urlDespesas, { timeout: PARAMS_TIMEOUT }),
				fetchWithTimeout(urlContratos, { timeout: PARAMS_TIMEOUT }),
			]);

			// Parse Despesas
			if (resDespesas.status === "fulfilled" && resDespesas.value.ok) {
				const buffer = await resDespesas.value.arrayBuffer();
				const decoder = new TextDecoder("iso-8859-1");
				const textResponse = decoder.decode(buffer);
				const payload = JSON.parse(textResponse);

				if (payload?.resposta?.status === "OK" && payload?.resposta?.conteudo) {
					const despesas = payload.resposta.conteudo;
					despesas.slice(0, 30).forEach((d: any) => {
						despesasApuradas.push({
							cnpjCpfFornecedor: d.CPF_CNPJ || docLimpo,
							nomeFornecedor: d.FORNECEDOR || "Não Identificado",
							tipoDespesa: `Despesa: ${d.HISTORICO || "N/I"} (UG: ${d.NOMEUNIDADEGESTORA})`,
							valorDocumento: Number(d.VALORPAGO || d.VALOREMPENHADO || 0),
							dataDocumento: `${d.ANOREFERENCIA}-${String(d.MESREFERENCIA || 1).padStart(2, "0")}-01`,
							urlDocumento: `https://sistemas.tce.pe.gov.br/`,
						});
					});
				}
			}

			// Parse Contratos
			if (resContratos.status === "fulfilled" && resContratos.value.ok) {
				const buffer = await resContratos.value.arrayBuffer();
				const decoder = new TextDecoder("iso-8859-1");
				const textResponse = decoder.decode(buffer);
				const payload = JSON.parse(textResponse);

				if (payload?.resposta?.status === "OK" && payload?.resposta?.conteudo) {
					const contratos = payload.resposta.conteudo;
					contratos.slice(0, 20).forEach((c: any) => {
						despesasApuradas.push({
							cnpjCpfFornecedor: c.CPFCNPJ || docLimpo,
							nomeFornecedor: c.FORNECEDOR || "Não Identificado",
							tipoDespesa: `Contrato: ${c.OBJETO || "N/I"} (UG: ${c.NOMEUNIDADEGESTORA})`,
							valorDocumento: Number(c.VALORCONTRATO || 0),
							dataDocumento: `${c.ANOREFERENCIA}-01-01`,
							urlDocumento: `https://sistemas.tce.pe.gov.br/`,
						});
					});
				}
			}
		} else {
			// Lógica Padrão: Busca Contratos pelo CPF/CNPJ (ex: Empresas ou Vereadores)
			const urlContratos = `${API_BASE_PE}/Contratos!json?ANOREFERENCIA=${anoAtual}&CPFCNPJ=${docLimpo}`;
			console.log(`[TCE-PE] Buscando Contratos pelo CPF/CNPJ: ${docLimpo}...`);

			const res = await fetchWithTimeout(urlContratos, {
				timeout: PARAMS_TIMEOUT,
			});
			if (res.ok) {
				const buffer = await res.arrayBuffer();
				const decoder = new TextDecoder("iso-8859-1");
				const textResponse = decoder.decode(buffer);

				const payload = JSON.parse(textResponse);
				if (payload?.resposta?.status === "OK" && payload?.resposta?.conteudo) {
					const contratos = payload.resposta.conteudo;
					contratos.slice(0, 30).forEach((c: any) => {
						despesasApuradas.push({
							cnpjCpfFornecedor: docLimpo,
							nomeFornecedor:
								c.FORNECEDOR || nomeParaBusca || "Não Identificado",
							tipoDespesa: `Contrato: ${c.OBJETO || "N/I"} (UG: ${c.NOMEUNIDADEGESTORA})`,
							valorDocumento: Number(c.VALORCONTRATO || 0),
							dataDocumento: `${c.ANOREFERENCIA}-01-01`,
							urlDocumento: `https://sistemas.tce.pe.gov.br/`,
						});
					});
				}
			}
		}
	} catch (e) {
		console.warn(
			`[TCE-PE] Falha ao varrer Extrator PE para o alvo ${municipioUri || docLimpo}.`,
			e,
		);
	}

	return despesasApuradas;
}
