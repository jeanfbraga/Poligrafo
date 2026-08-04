import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
	agregarEmendasPorUf,
	agruparCeapPorUf,
	agruparPesquisas,
} from "@/lib/dashboard-aggregations";
import congressoIndex from "@/services/integrations/data/congresso-index.json";

export const revalidate = 0; // Temporariamente sem cache para dev

// Esta rota lê apenas views/tabelas com policy SELECT pública (USING true),
// portanto a anon key basta — service role violaria o menor privilégio.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET() {
	if (!supabaseUrl || !supabaseAnonKey) {
		console.error("[DASHBOARD HOME] Variáveis do Supabase não configuradas.");
		return NextResponse.json(
			{ error: "Serviço indisponível no momento" },
			{ status: 500 },
		);
	}

	const supabase = createClient(supabaseUrl, supabaseAnonKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	try {
		const [
			{ data: ceapTop10, error: err1 },
			{ data: ceapTotal, error: err2 },
			{ data: ceapCategorias, error: err3 },
			{ data: menosPresentes, error: err4 },
			{ data: votantes, error: err5 },
			{ data: emendasTop10, error: err6 },
			{ data: emendasUF, error: err7 },
			{ data: pesquisas, error: err8 },
			{ data: ceap2025Raw, error: err9 },
			{ data: totalSessoesRow, error: err10 },
		] = await Promise.all([
			supabase.from("dashboard_ceap_top10").select("*"),
			supabase.from("dashboard_ceap_total").select("*"),
			supabase.from("dashboard_ceap_categorias").select("*"),
			// Ordenar pelos MENOS presentes (presencas ASC) — dado factual e verificável
			supabase
				.from("camara_frequencia")
				.select("*")
				.order("presencas", { ascending: true })
				.limit(10),
			supabase
				.from("camara_votacoes")
				.select("*")
				.order("votos_registrados", { ascending: false })
				.limit(10),
			supabase.from("dashboard_emendas_top10").select("*"),
			supabase.from("dashboard_emendas_uf").select("*"),
			supabase.from("dashboard_pesquisas_top10").select("*"),
			supabase
				.from("dashboard_ceap_2025_deputados")
				.select("*")
				.order("total_gasto", { ascending: false }),
			// Total de sessões no período: todos os deputados têm a mesma soma presencas+ausencias
			supabase
				.from("camara_frequencia")
				.select("presencas, ausencias_nao_justificadas")
				.order("presencas", { ascending: false })
				.limit(1),
		]);

		// Helper para mapear id_deputado para Nome e Partido do congresso-index
		const enriquecerDeputados = (lista: any[]) => {
			if (!lista) return [];
			return lista.map((item) => {
				const dep = congressoIndex.find(
					(d) => parseInt(d.id, 10) === item.id_deputado,
				);
				return {
					...item,
					nome: dep?.nome || `Deputado ID ${item.id_deputado}`,
					partido: dep?.partido || "N/A",
					uf: dep?.uf || "BR",
					casa: dep?.casa || "CAMARA",
					id: dep?.id || item.id_deputado,
					ref: dep ? `FEDERAL:${dep.casa}:${dep.id}` : undefined,
					foto: dep
						? `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${dep.id}.jpg`
						: null,
					fotoFallback: dep
						? dep.casa === "SENADO"
							? `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${dep.id}.jpg`
							: `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`
						: null,
					cargo: dep?.casa === "SENADO" ? "SENADOR(A)" : "DEPUTADO FEDERAL",
				};
			});
		};

		const removerAcentos = (str: string) =>
			str
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
				.toUpperCase();

		const enriquecerEmendasPorNome = (lista: any[]) => {
			if (!lista) return [];
			return lista.map((item) => {
				const autorStr = removerAcentos(item.autor);
				const dep = congressoIndex.find((d) => {
					const depNome = removerAcentos(d.nome);
					return (
						depNome.includes(autorStr) ||
						autorStr.includes(depNome) ||
						removerAcentos(d.nome.split(" ")[0]) === autorStr
					);
				});
				return {
					...item,
					partido: dep?.partido || "CONGRESSO",
					uf: dep?.uf || "BR",
					casa: dep?.casa || undefined,
					id: dep?.id || undefined,
					ref: dep ? `FEDERAL:${dep.casa}:${dep.id}` : undefined,
					foto: dep
						? `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${dep.id}.jpg`
						: null,
					fotoFallback: dep
						? dep.casa === "SENADO"
							? `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${dep.id}.jpg`
							: `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`
						: null,
					id_deputado: dep ? parseInt(dep.id, 10) : undefined,
					cargo: dep
						? dep.casa === "SENADO"
							? "SENADOR(A)"
							: "DEPUTADO FEDERAL"
						: "SENADOR(A)",
				};
			});
		};

		const enriquecerPesquisas = (lista: any[]) => {
			if (!lista) return [];
			return lista.map((item) => {
				// A view agora retorna id_deputado como string (id_politico da contagem_pesquisas)
				const idNum = item.id_deputado ? parseInt(String(item.id_deputado), 10) : null;
				const dep = idNum
					? congressoIndex.find((d) => parseInt(d.id, 10) === idNum)
					: null;

				return {
					...item,
					partido: item.partido || dep?.partido || "N/A",
					uf: item.uf || dep?.uf || "BR",
					casa: item.casa || dep?.casa || null,
					id: dep?.id || idNum || undefined,
					ref: item.ref || (dep ? `FEDERAL:${dep.casa}:${dep.id}` : undefined),
					foto: item.foto_url || (dep
						? `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${dep.id}.jpg`
						: null),
					fotoFallback: dep
						? dep.casa === "SENADO"
							? `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${dep.id}.jpg`
							: `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`
						: null,
					id_deputado: idNum || undefined,
					cargo: item.cargo || (dep
						? dep.casa === "SENADO"
							? "SENADOR(A)"
							: "DEPUTADO FEDERAL"
						: item.casa || null),
				};
			});
		};

		const ceap2025Enriched = err9 ? [] : enriquecerDeputados(ceap2025Raw || []);
		// Total da UF = soma de TODOS os deputados da UF na janela da view
		// (ano >= 2025). A lista de deputados (máx. 5) é só o detalhe sob demanda.
		// Antes, o frontend somava os 5 como se fossem o total do estado, o que
		// quebrava o ranking e fazia UFs distintas exibirem o mesmo valor
		// arredondado (ex.: RS, RR e AC todos em "4,4 mi").
		const ceapEstados = agruparCeapPorUf(ceap2025Enriched);

		// Calcula o total de sessões deliberativas do período
		const primeiroReg = totalSessoesRow?.[0];
		const totalSessoes =
			!err10 && primeiroReg
				? (primeiroReg.presencas ?? 0) + (primeiroReg.ausencias_nao_justificadas ?? 0)
				: null;

		return NextResponse.json({
			ceapTop10: err1 ? null : enriquecerDeputados(ceapTop10 || []),
			ceapTotal: err2 ? null : ceapTotal || [],
			ceapCategorias: err3 ? null : ceapCategorias || [],
			// menosPresentes: top 10 com menos presenças em sessões deliberativas (dado factual)
			menosPresentes: err4 ? null : enriquecerDeputados(menosPresentes || []),
			totalSessoes,
			votantes: err5 ? null : enriquecerDeputados(votantes || []),
			emendasTop10: err6 ? null : enriquecerEmendasPorNome(emendasTop10 || []),
			// Funde uf_destino equivalentes ("SP" + "SÃO PAULO (UF)") que o ETL
			// grava em formatos mistos — antes cada formato virava uma barra.
			emendasUF: err7 ? null : agregarEmendasPorUf(emendasUF || []),
			pesquisas: err8
				? null
				: agruparPesquisas(enriquecerPesquisas(pesquisas || [])).slice(0, 10),
			ceapEstados,
		});
	} catch (error: any) {
		console.error("[DASHBOARD HOME] Erro ao montar dashboard:", error);
		return NextResponse.json(
			{ error: "Falha ao carregar o dashboard" },
			{ status: 500 },
		);
	}
}
