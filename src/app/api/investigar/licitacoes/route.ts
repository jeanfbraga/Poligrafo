import { NextResponse } from "next/server";
import { fetchContratosByCNPJ } from "@/services/integrations/pncp/client";
import { analisarComIAPNCP } from "./ai_licitacoes";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const cnpj = searchParams.get("cnpj");
	const politicoBruto = searchParams.get("politico");

	const cleanCnpj = cnpj ? cnpj.replace(/\D/g, "") : "";
	if (cleanCnpj?.length !== 14) {
		return NextResponse.json(
			{ error: "CNPJ válido contendo 14 dígitos é obrigatório" },
			{ status: 400 },
		);
	}

	const politico = politicoBruto
		? politicoBruto.replace(/[^a-zA-Z0-9\sÁ-ÿ-]/g, "").trim()
		: null;

	try {
		// 1. Busca histórico (até 8 anos) do CNPJ no PNCP
		const contratos = await fetchContratosByCNPJ(cleanCnpj, 8);

		if (!contratos || contratos.length === 0) {
			return NextResponse.json({
				hasContracts: false,
				contracts: [],
				aiAnalysis: null,
			});
		}

		// Pega os 15 maiores ou mais recentes para enviar à IA (limite de contexto)
		const contratosParaIA = contratos.slice(0, 15);

		// 2. Aciona uma análise rápida cruzando com o político (se fornecido)
		let aiAnalysis = null;
		if (politico) {
			aiAnalysis = await analisarComIAPNCP(
				cleanCnpj,
				politico,
				contratosParaIA,
			);
		}

		return NextResponse.json({
			hasContracts: true,
			total: contratos.length,
			contracts: contratos, // Frontend limitará a exibição se quiser
			aiAnalysis,
		});
	} catch (error: any) {
		console.error("[PNCP] Erro na rota de licitações:", error);
		return NextResponse.json(
			{ error: "Falha ao buscar dados no PNCP" },
			{ status: 500 },
		);
	}
}
