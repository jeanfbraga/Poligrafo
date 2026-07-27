import { NextResponse } from "next/server";
import { buscarCpfNoTSE } from "@/app/api/investigar/tse";

import presidentesTse from "@/services/integrations/data/presidentes.json";

export const maxDuration = 60; // Next.js Vercel limit for Serverless (or 300 in pro)

const VIP_MAP: Record<string, { nome: string; id: string; mandatoInicio: string; mandatoFim: string }> = {
	lula: {
		nome: "Luiz Inácio Lula da Silva",
		id: "lula",
		mandatoInicio: "01/01/2023",
		mandatoFim: "31/12/2026",
	},
	bolsonaro: {
		nome: "Jair Messias Bolsonaro",
		id: "bolsonaro",
		mandatoInicio: "01/01/2019",
		mandatoFim: "31/12/2022",
	},
	dilma: {
		nome: "Dilma Vana Rousseff",
		id: "dilma",
		mandatoInicio: "01/01/2011",
		mandatoFim: "31/08/2016",
	},
	temer: {
		nome: "Michel Miguel Elias Temer Lulia",
		id: "temer",
		mandatoInicio: "01/09/2016",
		mandatoFim: "31/12/2018",
	},
};

const TRANSPARENCIA_API_KEY = process.env.TRANSPARENCIA_API_KEY || "";

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 8000) {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeout);
	try {
		const response = await fetch(url, {
			...options,
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

export async function GET(
	request: Request,
	context: { params: Promise<{ id: string }> | { id: string } },
) {
	const { id } = await Promise.resolve(context.params);
	const targetId = id?.toLowerCase() || "";
	const vipInfo = VIP_MAP[targetId];

	if (!vipInfo) {
		return NextResponse.json({ error: "Presidente não encontrado na base VIP." }, { status: 404 });
	}

	try {
		// Usa o cache local ("back end") ao invés de buscar ao vivo no TSE
		const cachedTse = (presidentesTse as any)[targetId];
		const tseDataPromise = Promise.resolve(cachedTse ? {
			cpf: cachedTse.cpf,
			idTse: cachedTse.idTse,
			idEleicao: cachedTse.idEleicao,
			idUe: "BR",
			patrimonioTotal: cachedTse.patrimonioTotal,
			bensDeclarados: cachedTse.bensDeclarados,
			anoEleicao: cachedTse.anoEleicao
		} : null);

		// 2. CPGF (Cartão Corporativo) via Portal da Transparência (Órgão 20000 = Presidência)
		const fetchCpgf = async () => {
			if (!TRANSPARENCIA_API_KEY) return { totalValor: 0, totalSigiloso: 0, countTotal: 0, countSigiloso: 0, topDespesas: [] };

			// Vamos realizar buscas em paralelo para aumentar o alcance da amostragem sem tomar timeout da serverless function
			let totalValor = 0;
			let totalSigiloso = 0;
			let countTotal = 0;
			let countSigiloso = 0;
			const topDespesas: any[] = [];

			try {
				// Faz disparos massivos em lotes de 50 páginas para varrer todo o mandato sem timeout
				const BATCH_SIZE = 50;
				const MAX_PAGES = 500; // Limite de segurança (~7500 registros)
				const allRecords: any[] = [];

				for (let batchStart = 1; batchStart <= MAX_PAGES; batchStart += BATCH_SIZE) {
					const pagesToFetch = Array.from(
						{ length: Math.min(BATCH_SIZE, MAX_PAGES - batchStart + 1) }, 
						(_, i) => batchStart + i
					);
					
					const fetchPage = async (page: number) => {
						const url = `https://api.portaldatransparencia.gov.br/api-de-dados/cartoes?codigoOrgao=20101&dataTransacaoInicio=${vipInfo.mandatoInicio}&dataTransacaoFim=${vipInfo.mandatoFim}&pagina=${page}`;
						try {
							const res = await fetchWithTimeout(url, { headers: { "chave-api-dados": TRANSPARENCIA_API_KEY } }, 8000);
							if (!res.ok) return [];
							return await res.json();
						} catch (e) {
							return []; // Falhas isoladas de rede não derrubam o lote
						}
					};

					const batchResults = await Promise.all(pagesToFetch.map(fetchPage));
					allRecords.push(...batchResults.flat());
					
					// Se alguma página do lote voltou vazia, chegamos ao final dos dados do mandato
					const hasEmptyPage = batchResults.some(arr => arr.length === 0);
					if (hasEmptyPage) break;
				}
				
				allRecords.forEach((item: any) => {
					if (!item) return;
					const isSigiloso = item.estabelecimento?.id === -1 || item.estabelecimento?.nome === "SEM INFORMACAO" || item.estabelecimento?.cnpjFormatado === "SIGILOSO" || !item.estabelecimento?.cnpjFormatado;
					const valorStr = item.valorTransacao ? String(item.valorTransacao).replace(/\./g, "").replace(",", ".") : "0";
					const valor = Number(valorStr) || 0;

					totalValor += valor;
					countTotal++;

					if (isSigiloso) {
						totalSigiloso += valor;
						countSigiloso++;
					}

					// O usuário pediu para que os SIGILOSOS também entrem na lista renderizada
					topDespesas.push({
						nomeFornecedor: isSigiloso ? "SIGILOSO" : (item.estabelecimento?.nome || item.estabelecimento?.razaoSocialReceita || "Desconhecido"),
						cnpj: isSigiloso ? "SIGILOSO" : (item.estabelecimento?.cnpjFormatado || "Não Informado"),
						data: item.dataTransacao,
						valor: valor,
						tipoCartao: item.tipoCartao?.descricao || "CPGF",
					});
				});

				// Ordena as despesas por data mais recente
				topDespesas.sort((a, b) => {
					if (!a.data || !b.data) return 0;
					const [diaA, mesA, anoA] = a.data.split("/");
					const [diaB, mesB, anoB] = b.data.split("/");
					const dateA = new Date(`${anoA}-${mesA}-${diaA}`).getTime();
					const dateB = new Date(`${anoB}-${mesB}-${diaB}`).getTime();
					
					// Se as datas forem iguais, desempata pelo maior valor
					if (dateA === dateB) {
						return b.valor - a.valor;
					}
					
					return dateB - dateA;
				});

			} catch (e) {
				console.error("[PERFIL] Erro CPGF", e);
			}

			return {
				totalValor,
				totalSigiloso,
				countTotal,
				countSigiloso,
				topDespesas: topDespesas, // Envia todos para paginação no frontend
			};
		};

		const [tseData, cpgfData] = await Promise.all([tseDataPromise, fetchCpgf()]);

		return NextResponse.json({
			perfil: {
				id: targetId,
				nome: vipInfo.nome,
				cargo: targetId === "lula" ? "Presidente da República" : "Ex-Presidente da República",
				mandato: `${vipInfo.mandatoInicio} - ${vipInfo.mandatoFim}`,
			},
			tse: tseData ? {
				cpf: tseData.cpf,
				idTse: tseData.idTse, // Inclui o SQ_CANDIDATO correto para a URL da foto
				idEleicao: tseData.idEleicao,
				idUe: tseData.idUe,
				fotoUrl: tseData.fotoUrl,
				patrimonio: tseData.patrimonioTotal || 0,
				bens: tseData.bensDeclarados?.sort((a: any, b: any) => (b.valor || 0) - (a.valor || 0)).slice(0, 5) || [],
				eleicao: tseData.anoEleicao,
			} : null,
			cpgf: cpgfData,
		});

	} catch (error: any) {
		console.error("[PERFIL_API] Erro ao carregar perfil:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}
}
