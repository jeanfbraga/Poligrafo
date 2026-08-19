import { fetchWithTimeout } from "@/app/api/investigar/tse";
import { transparenciaLimiter } from "@/services/core/rate-limiter";

export interface ConvenioFederal {
	numeroConvenio: string;
	objeto: string;
	orgaoSuperior: string;
	orgaoConcedente: string;
	concedenteNome: string;
	convenenteNome: string;
	convenenteCnpj: string;
	valorGlobal: number;
	valorLiberado: number;
	situacao: string;
	dataInicioVigencia?: string;
	dataFimVigencia?: string;
	urlDetalhe?: string;
}

const BASE_URL = "https://api.portaldatransparencia.gov.br/api-de-dados/convenios";

/**
 * Busca convênios federais firmados com entidades sem fins lucrativos (ONGs, OSCs, Institutos)
 * ou prefeituras através da API de Dados Abertos da CGU / Portal da Transparência.
 * 
 * @param termoOuCnpj CNPJ ou Nome da entidade conveniada
 */
export async function buscarConveniosEntidade(
	termoOuCnpj: string,
): Promise<ConvenioFederal[]> {
	const apiKey = process.env.TRANSPARENCIA_API_KEY;
	if (!apiKey || !termoOuCnpj || termoOuCnpj.trim().length < 4) return [];

	const termoSanitizado = termoOuCnpj.trim();
	const isCnpj = /^\d{11,14}$/.test(termoSanitizado.replace(/\D/g, ""));
	const cnpjLimpo = isCnpj ? termoSanitizado.replace(/\D/g, "") : null;

	await transparenciaLimiter.acquire();

	try {
		const queryParam = cnpjLimpo
			? `cnpj=${cnpjLimpo}`
			: `termoOuCnpj=${encodeURIComponent(termoSanitizado)}`;

		const url = `${BASE_URL}?${queryParam}&pagina=1&quantidade=10`;

		const res = await fetchWithTimeout(url, {
			headers: {
				"chave-api-dados": apiKey,
				Accept: "application/json",
			},
			timeout: 12000,
		});

		if (!res.ok) {
			if (res.status === 404) return [];
			console.warn(`[CGU CONVÊNIOS] HTTP ${res.status} ao consultar ${termoSanitizado}`);
			return [];
		}

		const dados = await res.json();
		if (!Array.isArray(dados)) return [];

		return dados.map((item: any) => ({
			numeroConvenio: String(item.numero || item.numeroConvenio || item.id || "N/A"),
			objeto: item.objeto || "Objeto não informado",
			orgaoSuperior: item.orgaoSuperior?.nome || item.orgaoSuperior || "Órgão Concedente Federal",
			orgaoConcedente: item.orgaoConcedente?.nome || item.concedente || "União Federal",
			concedenteNome: item.concedente?.nome || "União Federal",
			convenenteNome: item.convenente?.nome || item.proponente || termoSanitizado,
			convenenteCnpj: item.convenente?.cnpj || cnpjLimpo || "",
			valorGlobal: Number(item.valorGlobal || item.valorTotal || 0),
			valorLiberado: Number(item.valorLiberado || item.valorPago || 0),
			situacao: item.situacao || item.situacaoConvenio || "EM EXECUÇÃO",
			dataInicioVigencia: item.dataInicioVigencia || item.dataInicio,
			dataFimVigencia: item.dataFimVigencia || item.dataFim,
			urlDetalhe: item.numero
				? `https://portaldatransparencia.gov.br/convenios/${item.numero}`
				: undefined,
		}));
	} catch (err: any) {
		console.warn("[CGU CONVÊNIOS] Erro na consulta:", err.message);
		return [];
	}
}
