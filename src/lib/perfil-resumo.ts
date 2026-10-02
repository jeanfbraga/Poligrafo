/* ==========================================================================
   Resumo "de relance" do Perfil: 5 números que respondem, sem rolar,
   quem é, quanto declara, quanto gasta, quanto produz e quantos servidores tem.
   Cada item aponta para a seção do Perfil de onde vem o número.
   ========================================================================== */
import { brlCurto } from "@/lib/format";
import { agruparServidores } from "@/lib/gabinete";
import { separarProducao } from "@/lib/producao-mandato";

type Dados = Record<string, any>;

export interface ItemResumo {
	key: string;
	/** id da seção (âncora) que detalha o número. */
	secao: string;
	label: string;
	valor: string;
	sub: string;
}

const SEM_DADO = "—";

function numero(v: unknown): number | null {
	const n = Number(v);
	return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
}

/** O ETL guarda só os mais recentes: ao bater no teto o número é "últimos N", não o total da carreira. */
export const CORTE_ETL = { votos: 1000, producao: 50 } as const;

function textoVariacao(pct: number | null, anoAnterior: unknown): string {
	if (pct === null) return "";
	const sinal = pct > 0 ? "+" : "";
	const contra = anoAnterior ? ` vs ${anoAnterior}` : " vs declaração anterior";
	return ` · ${sinal}${Math.round(pct).toLocaleString("pt-BR")}%${contra}`;
}

function patrimonio(tse: Dados | null | undefined): ItemResumo {
	const total = numero(tse?.patrimonioTotal);
	const variacao = textoVariacao(numero(tse?.variacaoPatrimonioPercentual), tse?.anoPatrimonioAnterior);
	const sub = total === null ? "sem declaração no TSE" : `TSE ${tse?.anoEleicao ?? ""}${variacao}`.trim();
	return { key: "patrimonio", secao: "patrimonio", label: "Patrimônio declarado", valor: total === null ? SEM_DADO : brlCurto(total), sub };
}

/** Gasto no ano da cota e quanto isso representa do teto dos meses já lançados. */
function cota(registros: Dados[] | null | undefined): ItemResumo {
	const meses = (registros ?? []).filter((r) => numero(r?.valor_gasto) !== null);
	if (meses.length === 0) return { key: "cota", secao: "cota", label: "Cota parlamentar", valor: SEM_DADO, sub: "sem dados de cota" };
	const gasto = meses.reduce((s, r) => s + (numero(r.valor_gasto) ?? 0), 0);
	const teto = meses.reduce((s, r) => s + (numero(r.valor_teto) ?? 0), 0);
	const ano = meses[0].ano_referencia ?? "";
	const pct = teto > 0 ? ` · ${Math.round((gasto / teto) * 100)}% do teto` : "";
	return { key: "cota", secao: "cota", label: `Cota ${ano}`.trim(), valor: brlCurto(gasto), sub: `${meses.length} ${meses.length === 1 ? "mês" : "meses"}${pct}` };
}

function contagem(key: string, secao: string, label: string, lista: unknown, sub: string, corte: number): ItemResumo {
	const n = Array.isArray(lista) ? lista.length : null;
	const noTeto = n !== null && n >= corte;
	return {
		key,
		secao,
		label,
		valor: n === null ? SEM_DADO : n.toLocaleString("pt-BR"),
		sub: noTeto ? `mais recentes (${sub})` : sub,
	};
}

/** Projetos do mandato atual; passagens anteriores aparecem só no complemento ("+ N de mandatos anteriores"). */
function projetos(data: Dados | null | undefined): ItemResumo {
	if (!Array.isArray(data?.producao)) return contagem("producao", "producao", "Projetos de autoria", null, "proposições", CORTE_ETL.producao);
	const { atuais, anteriores } = separarProducao(data.producao, data.perfil);
	const item = contagem("producao", "producao", "Projetos de autoria", atuais, "proposições", CORTE_ETL.producao);
	return anteriores.length > 0 ? { ...item, sub: `no mandato atual · +${anteriores.length} anteriores` } : item;
}
function gabinete(servidores: Dados[] | null | undefined, hoje: Date): ItemResumo {
	const pessoas = agruparServidores(servidores ?? [], hoje);
	if (pessoas.length === 0) return { key: "gabinete", secao: "gabinete", label: "Gabinete", valor: SEM_DADO, sub: "sem servidores na base" };
	const ativos = pessoas.filter((p) => p.status === "ATIVO").length;
	return { key: "gabinete", secao: "gabinete", label: "Gabinete", valor: `${ativos} ativos`, sub: `${pessoas.length} servidores no total` };
}

export function resumoDoPerfil(data: Dados | null | undefined, hoje: Date = new Date()): ItemResumo[] {
	return [
		patrimonio(data?.tse),
		cota(data?.cota),
		projetos(data),
		contagem("votos", "votos", "Votações", data?.votos, "votos", CORTE_ETL.votos),
		gabinete(data?.servidores, hoje),
	];
}
