/**
 * Cota parlamentar (CEAP) agrupada por fornecedor, na janela de 4 anos do mandato
 * (Banco de Perfil, `ceap_fornecedores_ano`, carregada por scripts/etl/ceap-fornecedores-sync.ts).
 *
 * O motor de cruzamentos usa TODOS esses fornecedores; o dossiê e a IA continuam com
 * as 60 notas de maior valor (ceap_despesas_cache, no Principal). Base fora do ar:
 * null com um aviso, e o cruzamento segue só com as notas do dossiê.
 */
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export type CasaCota = "CAMARA" | "SENADO";

export interface FornecedorDaCota {
	casa: CasaCota;
	id_parlamentar: number;
	ano: number;
	documento: string;
	tipo_despesa: string;
	fornecedor: string | null;
	valor_total: number;
	notas: number;
	primeira_data: string | null;
	ultima_data: string | null;
}

export interface AlvoCota {
	casa: CasaCota;
	id: number;
}

type ClienteSupabase = Pick<typeof supabasePerfilAdmin, "from">;

let avisou = false;
export function reiniciarAvisoCotaAgrupada(): void {
	avisou = false;
}

export async function buscarFornecedoresDaCota(alvo: AlvoCota, cliente: ClienteSupabase = supabasePerfilAdmin): Promise<FornecedorDaCota[] | null> {
	const { data, error } = await cliente
		.from("ceap_fornecedores_ano")
		.select("casa, id_parlamentar, ano, documento, tipo_despesa, fornecedor, valor_total, notas, primeira_data, ultima_data")
		.eq("casa", alvo.casa)
		.eq("id_parlamentar", alvo.id)
		.order("valor_total", { ascending: false })
		.limit(5000);
	if (error) {
		if (!avisou) console.warn(`[COTA] Base agrupada indisponível (${error.message}); o cruzamento usa só as notas do dossiê.`);
		avisou = true;
		return null;
	}
	return ((data ?? []) as FornecedorDaCota[]).map((l) => ({ ...l, valor_total: Number(l.valor_total) || 0, notas: Number(l.notas) || 0 }));
}
