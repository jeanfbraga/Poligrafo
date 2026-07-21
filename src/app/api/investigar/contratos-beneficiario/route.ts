import { NextResponse } from "next/server";
import { fetchContratosByCNPJ } from "@/services/integrations/pncp/client";

async function buscarContratosComoOrgao(cnpj: string, yearsToFetch = 2) {
	const currentYear = new Date().getFullYear();
	const allContracts: any[] = [];

	for (let year = currentYear; year > currentYear - yearsToFetch; year--) {
		const dataInicial = `${year}0101`;
		const dataFinal = `${year}1231`;
		const url = `https://pncp.gov.br/api/consulta/v1/contratos?cnpjOrgao=${cnpj}&dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=1&tamanhoPagina=10`;

		try {
			const response = await fetch(url, {
				next: { revalidate: 86400 }, // Cache diário de 24h
			});
			if (!response.ok) continue;
			const data = await response.json();
			const items = data.data || data.content || data || [];
			if (Array.isArray(items)) {
				items.forEach((c: any) => {
					allContracts.push({
						orgao: c.orgaoEntidade?.razaoSocial || c.nomeOrgao || "N/I",
						objeto: c.objetoContrato || c.objeto || "N/I",
						valor: c.valorInicial || c.valorGlobal || 0,
						data: c.dataAssinatura || c.dataPublicacao || "",
						tipo: "COMPRADOR",
					});
				});
			}
		} catch (e) {
			console.error(
				`[PNCP] Erro ao buscar contratos como orgão no ano ${year}`,
				e,
			);
		}
	}

	return allContracts;
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const cnpj = searchParams.get("cnpj");

	if (!cnpj) {
		return NextResponse.json({ error: "CNPJ é obrigatório" }, { status: 400 });
	}

	const cleanCnpj = cnpj.replace(/\D/g, "");
	if (cleanCnpj.length !== 14) {
		return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
	}

	try {
		const [comoOrgao, comoFornecedor] = await Promise.all([
			buscarContratosComoOrgao(cleanCnpj, 2).catch(() => []),
			fetchContratosByCNPJ(cleanCnpj, 2).catch(() => []),
		]);

		const formatadosFornecedor = (comoFornecedor || []).map((c: any) => ({
			orgao: c.orgaoEntidade?.razaoSocial || "N/I",
			objeto: c.objetoContrato || c.objeto || "N/I",
			valor: c.valorInicial || c.valorGlobal || 0,
			data: c.dataAssinatura || c.dataVigenciaInicio || "",
			tipo: "FORNECEDOR",
		}));

		// Consolidar e ordenar por data decrescente
		const todosContratos = [...comoOrgao, ...formatadosFornecedor]
			.sort((a, b) => {
				const dataA = a.data || "";
				const dataB = b.data || "";
				return dataB.localeCompare(dataA);
			})
			.slice(0, 15); // Retorna no máximo 15 mais recentes

		return NextResponse.json({ contracts: todosContratos });
	} catch (error: any) {
		console.error("[PNCP BENEFICIÁRIO] Erro na rota de contratos:", error);
		return NextResponse.json(
			{ error: "Falha ao buscar contratos no PNCP" },
			{ status: 500 },
		);
	}
}
