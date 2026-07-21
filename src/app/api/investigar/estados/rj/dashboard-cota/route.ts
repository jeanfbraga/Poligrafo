import { createClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET(req: NextRequest) {
	const { searchParams } = new URL(req.url);
	const nome = searchParams.get("nome");

	if (!nome) {
		return NextResponse.json(
			{ error: "Nome do vereador é obrigatório" },
			{ status: 400 },
		);
	}

	try {
		const supabase = createClient(supabaseUrl, supabaseKey);

		const { data, error } = await supabase
			.from("cmrj_despesas")
			.select("*")
			.ilike("vereador_nome", `%${nome.trim()}%`);

		if (error) throw error;

		if (!data || data.length === 0) {
			return NextResponse.json({
				totalGastos: 0,
				gastosPorCategoria: [],
				topFornecedores: [],
				gastosMensais: [],
				totalNotas: 0,
			});
		}

		// Agregações em memória (pois o Supabase tem limitações com GROUP BY nativo na API REST simples sem RPC)
		let totalGastos = 0;
		const categoriaMap: Record<string, number> = {};
		const fornecedorMap: Record<string, number> = {};
		const mensalMap: Record<string, number> = {};

		data.forEach((d: any) => {
			const valor = Number(d.valor) || 0;
			totalGastos += valor;

			// Categoria
			const cat = d.categoria_despesa || "Outros";
			categoriaMap[cat] = (categoriaMap[cat] || 0) + valor;

			// Fornecedor
			const fornecedor = d.fornecedor_nome || "Não identificado";
			fornecedorMap[fornecedor] = (fornecedorMap[fornecedor] || 0) + valor;

			// Mensal
			let mesAno = "Indefinido";
			if (d.data_despesa) {
				// A data pode vir em formatos diferentes dependendo da OCR/fonte, mas tentamos extrair o mês/ano
				const parts = d.data_despesa.split("/");
				if (parts.length === 3) {
					mesAno = `${parts[2]}-${parts[1]}`; // YYYY-MM
				} else if (d.data_despesa.includes("-")) {
					mesAno = d.data_despesa.substring(0, 7); // YYYY-MM assuming ISO
				}
			}
			mensalMap[mesAno] = (mensalMap[mesAno] || 0) + valor;
		});

		const gastosPorCategoria = Object.keys(categoriaMap)
			.map((k) => ({
				categoria: k,
				valor: categoriaMap[k],
			}))
			.sort((a, b) => b.valor - a.valor);

		const topFornecedores = Object.keys(fornecedorMap)
			.map((k) => ({
				fornecedor: k,
				valor: fornecedorMap[k],
			}))
			.sort((a, b) => b.valor - a.valor)
			.slice(0, 5);

		const gastosMensais = Object.keys(mensalMap)
			.map((k) => ({
				mes: k,
				valor: mensalMap[k],
			}))
			.sort((a, b) => a.mes.localeCompare(b.mes));

		let periodo = "Período Indefinido";
		if (gastosMensais.length > 0) {
			const minMes = gastosMensais[0].mes;
			const maxMes = gastosMensais[gastosMensais.length - 1].mes;
			periodo = minMes === maxMes ? minMes : `${minMes} a ${maxMes}`;
		}

		return NextResponse.json({
			totalGastos,
			gastosPorCategoria,
			topFornecedores,
			gastosMensais,
			totalNotas: data.length,
			periodo,
		});
	} catch (err: any) {
		console.error("[Dashboard Cota] Erro ao agregar dados:", err);
		return NextResponse.json({ error: err.message }, { status: 500 });
	}
}
