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

function extractOrgaoNome(val: any, fallback: string): string {
	if (typeof val === "object" && val?.nome) return val.nome;
	if (typeof val === "string" && val.trim()) return val;
	return fallback;
}

function pickVal<T>(fallback: T, ...values: (T | null | undefined)[]): T {
	for (const v of values) {
		if (v !== undefined && v !== null && v !== "") return v;
	}
	return fallback;
}

function parseConvenioItem(
	item: any,
	termoSanitizado: string,
	cnpjLimpo: string | null,
): ConvenioFederal {
	const num = pickVal("N/A", item.numero, item.numeroConvenio, item.id);
	const urlDetalhe = item.numero
		? `https://portaldatransparencia.gov.br/convenios/${item.numero}`
		: undefined;

	return {
		numeroConvenio: String(num),
		objeto: pickVal("Objeto não informado", item.objeto),
		orgaoSuperior: extractOrgaoNome(item.orgaoSuperior, "Órgão Concedente Federal"),
		orgaoConcedente: extractOrgaoNome(pickVal(undefined, item.orgaoConcedente, item.concedente), "União Federal"),
		concedenteNome: extractOrgaoNome(item.concedente, "União Federal"),
		convenenteNome: extractOrgaoNome(pickVal(undefined, item.convenente, item.proponente), termoSanitizado),
		convenenteCnpj: pickVal("", item.convenente?.cnpj, cnpjLimpo),
		valorGlobal: Number(pickVal(0, item.valorGlobal, item.valorTotal)),
		valorLiberado: Number(pickVal(0, item.valorLiberado, item.valorPago)),
		situacao: pickVal("EM EXECUÇÃO", item.situacao, item.situacaoConvenio),
		dataInicioVigencia: pickVal(undefined, item.dataInicioVigencia, item.dataInicio),
		dataFimVigencia: pickVal(undefined, item.dataFimVigencia, item.dataFim),
		urlDetalhe,
	};
}

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

		return dados.map((item: any) => parseConvenioItem(item, termoSanitizado, cnpjLimpo));
	} catch (err: any) {
		console.warn("[CGU CONVÊNIOS] Erro na consulta:", err.message);
		return [];
	}
}
