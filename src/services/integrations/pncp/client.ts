// pncp/client.ts
// Integração nativa com o Portal Nacional de Contratações Públicas (PNCP)
// Baseado no modelo do mcp-brasil

export interface PNCPOrgaoEntidade {
	cnpj: string;
	razaoSocial: string;
	poderId: string;
	esferaId: string;
}

export interface PNCPContract {
	numeroControlePNCP: string;
	dataAssinatura?: string;
	dataVigenciaInicio?: string;
	dataVigenciaFim?: string;
	orgaoEntidade: PNCPOrgaoEntidade;
	nomeRazaoSocialFornecedor: string;
	niFornecedor: string;
	numeroContratoEmpenho?: string;
	objetoContrato?: string;
	valorInicial?: number;
	valorGlobal?: number;
	urlCipi?: string;
}

export interface PNCPResponse {
	totalRegistros: number;
	totalPaginas: number;
	numeroPagina: number;
	data: PNCPContract[];
}

/**
 * Busca o histórico de licitações/contratos de um CNPJ dos últimos `yearsToFetch` anos.
 * Retorna os contratos ordenados da data mais recente para a mais antiga.
 */
export async function fetchContratosByCNPJ(
	cnpj: string,
	yearsToFetch = 8,
): Promise<PNCPContract[]> {
	const currentYear = new Date().getFullYear();
	const allContracts: PNCPContract[] = [];

	// Remove formatação do CNPJ se houver
	const cleanCnpj = cnpj.replace(/\D/g, "");

	for (let year = currentYear; year > currentYear - yearsToFetch; year--) {
		const dataInicial = `${year}0101`;
		const dataFinal = `${year}1231`;

		const url = `https://pncp.gov.br/api/consulta/v1/contratos?cnpjFornecedor=${cleanCnpj}&dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=1`;

		try {
			const response = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept: "application/json",
				},
				next: { revalidate: 86400 }, // Cache diário de 24 horas
			});

			if (!response.ok) {
				if (response.status === 404) {
					continue; // Nenhum contrato encontrado neste ano
				}
				console.warn(
					`[PNCP] Falha ao buscar contratos para ${cleanCnpj} no ano ${year}. Status: ${response.status}`,
				);
				continue;
			}

			const responseData = (await response.json()) as any;
			const data = responseData?.data || responseData?.content;

			if (data && Array.isArray(data)) {
				allContracts.push(...data);

				// Se houver mais de uma página, deveríamos iterar. Para a primeira versão, pegamos a pág 1.
				// O limite padrão geralmente atende ao volume anual de uma única empresa governamental (limite ~50-100).
			}
		} catch (error) {
			console.error(
				`[PNCP] Erro de rede ao buscar contratos para ${cleanCnpj} no ano ${year}`,
				error,
			);
		}
	}

	// Ordenar por data de assinatura decrescente
	return allContracts.sort((a, b) => {
		const dataA = a.dataAssinatura || a.dataVigenciaInicio || "";
		const dataB = b.dataAssinatura || b.dataVigenciaInicio || "";
		return dataB.localeCompare(dataA);
	});
}
