import { NextResponse } from "next/server";
import { buscarCpfNoTSE } from "@/app/api/investigar/tse";

import presidentesTse from "@/services/integrations/data/presidentes.json";
import { supabaseAdmin } from "@/lib/supabase-admin";

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
			fotoUrl: cachedTse.fotoUrl,
			patrimonioTotal: cachedTse.patrimonioTotal,
			bensDeclarados: cachedTse.bensDeclarados,
			anoEleicao: cachedTse.anoEleicao
		} : null);

		// 2. CPGF (Cartão Corporativo) via Supabase
		const fetchCpgf = async () => {
			const { data, error } = await supabaseAdmin
				.from("cpgf_despesas_cache")
				.select("*")
				.eq("id_presidente", targetId)
				.order("data_transacao", { ascending: false });

			if (error || !data || data.length === 0) {
				return { totalValor: 0, totalSigiloso: 0, countTotal: 0, countSigiloso: 0, topDespesas: [] };
			}

			let totalValor = 0;
			let totalSigiloso = 0;
			let countSigiloso = 0;

			for (const row of data) {
				const valor = Number(row.valor_transacao) || 0;
				totalValor += valor;
				if (row.nome_fornecedor === "SIGILOSO") {
					totalSigiloso += valor;
					countSigiloso++;
				}
			}

			const topDespesas = data.map(row => ({
				data: row.data_transacao,
				fornecedor: row.nome_fornecedor,
				cnpj: row.cnpj_fornecedor,
				valor: Number(row.valor_transacao) || 0,
				tipoCartao: row.tipo_cartao
			}));

			return {
				totalValor,
				totalSigiloso,
				countTotal: data.length,
				countSigiloso,
				topDespesas,
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
