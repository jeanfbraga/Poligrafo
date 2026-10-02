/* ==========================================================================
   Dados e helpers da Home (payload de /api/dashboard/home).
   ========================================================================== */
import { acharPorNomeExato, rotaDoPolitico, urlDossie } from "./investigacao/alvo";
import { INDICE_COMPLETO } from "./busca";

export interface PerfilRanking {
	nome: string;
	id?: number | string;
	cargo?: string;
	uf?: string;
	partido?: string;
}

export interface DeputadoUf extends PerfilRanking {
	total_gasto: number;
	id_deputado?: number;
}

export interface CeapEstado {
	total: number;
	deputados: DeputadoUf[];
}

export interface HomeData {
	ceapTotal: { total_gasto: string; ano: string }[];
	ceapTop10: (DeputadoUf & { id_deputado?: number })[];
	menosPresentes: { nome: string; presencas: number; sessoes?: number; taxa?: number; partido?: string; uf?: string; id_deputado?: number; cargo?: string }[];
	totalSessoes: number | null;
	ceapCategorias: { tipo_despesa: string; total_gasto: number }[];
	emendasTop10: { autor: string; total_pix: number; id_deputado?: number; uf?: string; partido?: string; cargo?: string }[];
	emendasUF: { uf_destino: string; total_pix: number }[];
	pesquisas: { termo: string; quantidade: number; partido?: string; uf?: string; id_deputado?: number; cargo?: string }[];
	ceapEstados: Record<string, CeapEstado>;
}

/** Para onde vai o clique num item de ranking: Perfil (deputado/presidente) ou Dossiê. */
export function rotaDoRanking(p: PerfilRanking): string {
	const id = String(p.id ?? "");
	const ehDeputado = !p.cargo || /DEPUTAD/i.test(p.cargo);
	if (/^\d+$/.test(id) && ehDeputado) {
		const q = new URLSearchParams({ nome: p.nome });
		if (p.partido) q.set("partido", p.partido);
		if (p.uf) q.set("uf", p.uf);
		return `/perfil/deputado/${id}?${q.toString()}`;
	}
	const indexado = acharPorNomeExato(p.nome, INDICE_COMPLETO);
	if (indexado) return rotaDoPolitico(indexado).href;
	return urlDossie({ nome: p.nome, uf: p.uf && p.uf !== "BR" ? p.uf : "FEDERAL" });
}

/** Comprimento relativo (0–100) de cada valor frente ao maior. */
export function percentuaisRelativos(valores: number[]): number[] {
	const max = Math.max(0, ...valores);
	return valores.map((v) => (max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 2));
}

export interface TotaisKpi {
	ano: number;
	total: number;
	mediaTop10: number;
	somaPixTop10: number;
	concentracaoTop10: number;
}

/** Indicadores do KPI hero, derivados só do payload atual. */
export function calcularKpi(data: Pick<HomeData, "ceapTotal" | "ceapTop10" | "emendasTop10"> | null | undefined): TotaisKpi {
	const ceapTotal = data?.ceapTotal ?? [];
	const ano = ceapTotal.length > 0 ? Math.max(...ceapTotal.map((i) => Number(i.ano))) : new Date().getFullYear();
	const total = ceapTotal.filter((i) => Number(i.ano) === ano).reduce((acc, i) => acc + Number(i.total_gasto), 0);
	const top = data?.ceapTop10 ?? [];
	const somaTop = top.reduce((acc, i) => acc + Number(i.total_gasto || 0), 0);
	const pix = (data?.emendasTop10 ?? []).reduce((acc, i) => acc + Number(i.total_pix || 0), 0);
	return {
		ano,
		total,
		mediaTop10: top.length ? somaTop / top.length : 0,
		somaPixTop10: pix,
		concentracaoTop10: total > 0 ? (somaTop / total) * 100 : 0,
	};
}

export interface LinhaUf {
	uf: string;
	total: number;
	deputados: DeputadoUf[];
}

/** UFs ordenadas pelo total (maior primeiro). */
export function rankingDeUfs(ceapEstados: Record<string, CeapEstado> | undefined): LinhaUf[] {
	return Object.entries(ceapEstados ?? {})
		.map(([uf, g]) => ({ uf, total: Number(g?.total) || 0, deputados: g?.deputados ?? [] }))
		.sort((a, b) => b.total - a.total);
}
