import { buscarProxyOsint } from "../../proxy_osint";
import { buscarCpfNoTSE, fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Rio Grande do Sul (RS)
// Dados de Compliance Fiscal e Saúde/Educação
// ==========================================

const API_BASE = "https://dados.tce.rs.gov.br/dados";
const TIMEOUT_RS = 10000;

let municipiosCacheRS: Record<string, string> | null = null;

export async function buscarMunicipalRS(nomeBuscado: string): Promise<
	{
		ref: string;
		id: string;
		nome: string;
		cargo: string;
		uf: string;
		isCnpj?: boolean;
		casa: "CAMARA_MUNICIPAL" | "PREFEITURA";
	}[]
> {
	const termo = nomeBuscado.toLowerCase().trim();
	console.log(
		`[>> MUNICIPAL RS ENTRY] buscarMunicipalRS chamado para: ${nomeBuscado}`,
	);
	const resultados: any[] = [];

	// Tenta achar Vereador (13)
	let tseResult = await buscarCpfNoTSE(termo, "RS", "13");
	let tipoCargo: "CAMARA_MUNICIPAL" | "PREFEITURA" = "CAMARA_MUNICIPAL";
	let tituloCargo = "Vereador";

	if (!tseResult) {
		// Tenta achar Prefeito (11)
		tseResult = await buscarCpfNoTSE(termo, "RS", "11");
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
			ref: `RS:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
			id: tseResult.documentoPrincipal,
			nome: nomeExibicao,
			cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, " ").toUpperCase()}`,
			uf: "RS",
			isCnpj: tseResult.isCnpj,
			casa: tipoCargo,
		});
	}

	return resultados;
}

export async function buscarCodigoMunicipioRS(
	nomeMunicipio: string,
): Promise<string | null> {
	const nomeLimpo = nomeMunicipio.toLowerCase().trim();

	if (!municipiosCacheRS) {
		try {
			const res = await fetchWithTimeout(
				`${API_BASE}/auxiliar/municipios.json`,
				{ timeout: TIMEOUT_RS },
			);
			if (!res.ok) throw new Error(`Status ${res.status}`);

			const raw = await res.json();
			const data = Array.isArray(raw)
				? raw
				: raw.municipios ||
					Object.values(raw).find((v) => Array.isArray(v)) ||
					[];

			municipiosCacheRS = {};
			data.forEach((m: any) => {
				if (m.NOME_MUNICIPIO && m.COD_MUNICIPIO) {
					municipiosCacheRS![m.NOME_MUNICIPIO.toLowerCase().trim()] = String(
						m.COD_MUNICIPIO,
					);
				}
			});
		} catch (e) {
			console.warn(`[TCE-RS] Falha ao carregar lista de municípios:`, e);
			return null;
		}
	}
	return municipiosCacheRS[nomeLimpo] || null;
}

async function extractRsData(url: string, orgaoCodigo?: string): Promise<any> {
	try {
		const res = await fetchWithTimeout(url, { timeout: TIMEOUT_RS });
		if (!res.ok) return null;
		const raw = await res.json();
		const items = Array.isArray(raw)
			? raw
			: Object.values(raw).find((v) => Array.isArray(v)) || [];

		if (orgaoCodigo) {
			return (items as any[]).find((i: any) =>
				String(i.CD_Orgao).startsWith(orgaoCodigo),
			);
		}
		return items;
	} catch (_e) {
		return null;
	}
}

function formatarItemIndicador(tipo: string, orgao: string, municipio: string, valor: number, ano: number, desc: string): any {
	return {
		tipoDespesa: tipo,
		nomeFornecedor: orgao || `Prefeitura Municipal de ${municipio.toUpperCase()}`,
		cnpjCpfFornecedor: "",
		valorDocumento: valor,
		dataDocumento: `${ano}-12-31`,
		descricao: desc,
		urlDocumento: "https://dados.tce.rs.gov.br",
	};
}

function formatarEducacao(educacao: any, municipioNome: string, ano: number): any | null {
	if (!educacao) return null;
	return formatarItemIndicador(
		"Índice de Educação (TCE-RS)",
		educacao.NM_Orgao,
		municipioNome,
		parseFloat(educacao.VL_Despesa || "0"),
		ano,
		`Índice de Aplicação em Educação (Mínimo Constitucional 25%): ${educacao.VL_IndiceEducacao || 0}% aplicado. Receita: R$ ${educacao.VL_Receita}.`,
	);
}

function formatarSaude(saude: any, municipioNome: string, ano: number): any | null {
	if (!saude) return null;
	return formatarItemIndicador(
		"Índice de Saúde (TCE-RS)",
		saude.NM_Orgao,
		municipioNome,
		parseFloat(saude.VL_Despesa || "0"),
		ano,
		`Índice de Aplicação em Saúde (Mínimo Constitucional 15%): ${saude.VL_IndiceSaude || 0}% aplicado. Receita: R$ ${saude.VL_Receita}.`,
	);
}

function formatarGestao(gestao: any, municipioNome: string, ano: number): any | null {
	if (!gestao) return null;
	const rcl = parseFloat(gestao.VL_ReceitaCorrenteLiquida || "0");
	const despPessoal = parseFloat(gestao.VL_DespesaPessoal || "0");
	const percentual = rcl > 0 ? ((despPessoal / rcl) * 100).toFixed(2) : "0";
	return formatarItemIndicador(
		"Gestão Fiscal LRF (TCE-RS)",
		gestao.NM_Orgao,
		municipioNome,
		despPessoal,
		ano,
		`Receita Corrente Líquida: R$ ${rcl}. Despesa com Pessoal: R$ ${despPessoal} (${percentual}% da RCL). Dívida Consolidada: R$ ${gestao.VL_DividaConsolidada || 0}.`,
	);
}

function formatarIndicadoresRs(ano: number, municipioNome: string, educacao: any, saude: any, gestao: any): any[] {
	const itens: any[] = [];
	const ed = formatarEducacao(educacao, municipioNome, ano);
	if (ed) itens.push(ed);
	const sd = formatarSaude(saude, municipioNome, ano);
	if (sd) itens.push(sd);
	const gt = formatarGestao(gestao, municipioNome, ano);
	if (gt) itens.push(gt);
	return itens;
}

export async function buscarDespesasMunicipalRS(
	identificador: string,
	nomeParaBusca?: string,
	municipioUri?: string,
	casa?: string,
): Promise<any[]> {
	if (!municipioUri) {
		console.log(`[TCE-RS] Redirecionando ${identificador} para Proxy OSINT (Faltou URI Geográfica).`);
		const payload = await buscarProxyOsint(identificador, nomeParaBusca);
		return payload.despesasFederais;
	}

	console.log(`[TCE-RS] Iniciando extração nativa para ${casa} de ${municipioUri}`);
	const municipioNomeLimpo = municipioUri.replace(/-/g, " ");
	const codigoMunicipio = await buscarCodigoMunicipioRS(municipioNomeLimpo);
	if (!codigoMunicipio) {
		console.warn(`[TCE-RS] Município ${municipioUri} não localizado. Caindo pro Proxy.`);
		const payload = await buscarProxyOsint(identificador, nomeParaBusca);
		return payload.despesasFederais;
	}

	const anoAtual = new Date().getFullYear();
	const anosBusca = [anoAtual - 1, anoAtual - 2];
	const formatados: any[] = [];

	for (const ano of anosBusca) {
		const [educacao, saude, gestao] = await Promise.all([
			extractRsData(`${API_BASE}/municipal/educacao-indice/${ano}.json`, codigoMunicipio),
			extractRsData(`${API_BASE}/municipal/saude-indice/${ano}.json`, codigoMunicipio),
			extractRsData(`${API_BASE}/municipal/gastos-lrf-mde-asps/${ano}.json`, codigoMunicipio),
		]);
		formatados.push(...formatarIndicadoresRs(ano, municipioNomeLimpo, educacao, saude, gestao));
	}

	console.log(`[TCE-RS] Dados consolidados gerados. Somando com o Proxy OSINT...`);
	const payload = await buscarProxyOsint(identificador, nomeParaBusca);
	return [...formatados, ...(payload.despesasFederais || [])];
}
