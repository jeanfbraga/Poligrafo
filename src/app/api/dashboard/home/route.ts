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

const removerAcentos = (str: string) =>
	str
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toUpperCase();

function obterFotoFallback(dep: any) {
	if (!dep) return null;
	return dep.casa === "SENADO"
		? `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${dep.id}.jpg`
		: `https://www.camara.leg.br/internet/deputado/bandep/${dep.id}.jpg`;
}

function mapearDeputado(item: any, supabaseUrl: string) {
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
		foto: dep ? `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${dep.id}.jpg` : null,
		fotoFallback: obterFotoFallback(dep),
		cargo: dep?.casa === "SENADO" ? "SENADOR(A)" : "DEPUTADO FEDERAL",
	};
}

function enriquecerDeputados(lista: any[], supabaseUrl: string) {
	if (!lista) return [];
	return lista.map((item) => mapearDeputado(item, supabaseUrl));
}

function encontrarDeputadoPorAutor(autor: string) {
	const autorStr = removerAcentos(autor || "");
	return congressoIndex.find((d) => {
		const depNome = removerAcentos(d.nome);
		return (
			depNome.includes(autorStr) ||
			autorStr.includes(depNome) ||
			removerAcentos(d.nome.split(" ")[0]) === autorStr
		);
	});
}

function mapearEmenda(item: any, supabaseUrl: string) {
	const dep = encontrarDeputadoPorAutor(item.autor);
	return {
		...item,
		partido: dep?.partido || "CONGRESSO",
		uf: dep?.uf || "BR",
		casa: dep?.casa || undefined,
		id: dep?.id || undefined,
		ref: dep ? `FEDERAL:${dep.casa}:${dep.id}` : undefined,
		foto: dep ? `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${dep.id}.jpg` : null,
		fotoFallback: obterFotoFallback(dep),
		id_deputado: dep ? parseInt(dep.id, 10) : undefined,
		cargo: dep?.casa === "SENADO" ? "SENADOR(A)" : "DEPUTADO FEDERAL",
	};
}

function enriquecerEmendasPorNome(lista: any[], supabaseUrl: string) {
	if (!lista) return [];
	return lista.map((item) => mapearEmenda(item, supabaseUrl));
}

function resolverDeputadoPesquisa(item: any) {
	const idNum = item.id_deputado ? parseInt(String(item.id_deputado), 10) : null;
	const dep = idNum ? congressoIndex.find((d) => parseInt(d.id, 10) === idNum) : null;
	return { idNum, dep };
}

function extrairFotoPesquisa(item: any, dep: any, supabaseUrl: string) {
	if (item.foto_url) return item.foto_url;
	if (dep) return `${supabaseUrl}/storage/v1/object/public/fotos-politicos/${dep.id}.jpg`;
	return null;
}

function extrairCargoPesquisa(item: any, dep: any) {
	if (item.cargo) return item.cargo;
	if (dep?.casa === "SENADO") return "SENADOR(A)";
	if (dep) return "DEPUTADO FEDERAL";
	return item.casa || null;
}

function extrairRefPesquisa(itemRef?: string, dep?: any) {
	if (itemRef) return itemRef;
	if (dep) return `FEDERAL:${dep.casa}:${dep.id}`;
	return undefined;
}

function resolverCamposPesquisa(item: any, dep: any, idNum: number | null) {
	const partido = item.partido || dep?.partido || "N/A";
	const uf = item.uf || dep?.uf || "BR";
	const casa = item.casa || dep?.casa || null;
	const id = dep?.id || idNum || undefined;
	const ref = extrairRefPesquisa(item.ref, dep);
	return { partido, uf, casa, id, ref };
}

function mapearPesquisa(item: any, supabaseUrl: string) {
	const { idNum, dep } = resolverDeputadoPesquisa(item);
	const campos = resolverCamposPesquisa(item, dep, idNum);

	return {
		...item,
		...campos,
		foto: extrairFotoPesquisa(item, dep, supabaseUrl),
		fotoFallback: obterFotoFallback(dep),
		id_deputado: idNum || undefined,
		cargo: extrairCargoPesquisa(item, dep),
	};
}

function enriquecerPesquisas(lista: any[], supabaseUrl: string) {
	if (!lista) return [];
	return lista.map((item) => mapearPesquisa(item, supabaseUrl));
}

async function consultarViewsDashboard(supabase: any) {
	return Promise.all([
		supabase.from("dashboard_ceap_top10").select("*"),
		supabase.from("dashboard_ceap_total").select("*"),
		supabase.from("dashboard_ceap_categorias").select("*"),
		supabase
			.from("camara_frequencia")
			.select("*")
			.eq("condicao_eleitoral", "Titular")
			.eq("situacao", "Exercício")
			.order("presencas", { ascending: true })
			.limit(10),
		supabase.from("camara_votacoes").select("*").order("votos_registrados", { ascending: false }).limit(10),
		supabase.from("dashboard_emendas_top10").select("*"),
		supabase.from("dashboard_emendas_uf").select("*"),
		supabase.from("dashboard_pesquisas_top10").select("*"),
		supabase.from("dashboard_ceap_2025_deputados").select("*").order("total_gasto", { ascending: false }),
		supabase.from("camara_frequencia").select("presencas, ausencias_nao_justificadas").order("presencas", { ascending: false }).limit(1),
	]);
}

function calcularTotalSessoes(totalSessoesRow: any[], err10: any) {
	const primeiroReg = totalSessoesRow?.[0];
	if (err10 || !primeiroReg) return null;
	return (primeiroReg.presencas ?? 0) + (primeiroReg.ausencias_nao_justificadas ?? 0);
}

function resolverDado<T>(err: any, data: any, transform?: (d: any) => T): T | null {
	if (err) return null;
	const val = data || [];
	return transform ? transform(val) : val;
}

function montarRespostaDashboard(resultados: any[], supabaseUrl: string) {
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
	] = resultados;

	const ceap2025Enriched = resolverDado(err9, ceap2025Raw, (d) => enriquecerDeputados(d, supabaseUrl)) || [];
	const ceapEstados = agruparCeapPorUf(ceap2025Enriched);
	const totalSessoes = calcularTotalSessoes(totalSessoesRow, err10);

	return {
		ceapTop10: resolverDado(err1, ceapTop10, (d) => enriquecerDeputados(d, supabaseUrl)),
		ceapTotal: resolverDado(err2, ceapTotal),
		ceapCategorias: resolverDado(err3, ceapCategorias),
		menosPresentes: resolverDado(err4, menosPresentes, (d) => enriquecerDeputados(d, supabaseUrl)),
		totalSessoes,
		votantes: resolverDado(err5, votantes, (d) => enriquecerDeputados(d, supabaseUrl)),
		emendasTop10: resolverDado(err6, emendasTop10, (d) => enriquecerEmendasPorNome(d, supabaseUrl)),
		emendasUF: resolverDado(err7, emendasUF, agregarEmendasPorUf),
		pesquisas: resolverDado(err8, pesquisas, (d) => agruparPesquisas(enriquecerPesquisas(d, supabaseUrl)).slice(0, 10)),
		ceapEstados,
	};
}

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
		const resultados = await consultarViewsDashboard(supabase);
		const payload = montarRespostaDashboard(resultados, supabaseUrl);
		return NextResponse.json(payload);
	} catch (error: any) {
		console.error("[DASHBOARD HOME] Erro ao montar dashboard:", error);
		return NextResponse.json(
			{ error: "Falha ao carregar o dashboard" },
			{ status: 500 },
		);
	}
}
