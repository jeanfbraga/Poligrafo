/**
 * Contas de campanha do eleito (base `tse_campanha_contas`, BANCO DE PERFIL),
 * pelo número do candidato no TSE — nunca pelo nome. Carregada por
 * scripts/etl/tse-contas-campanha-sync.ts. Ver nota 31 do Obsidian, §3.6.
 *
 * Substitui, quando disponível, a lista de doadores do `tse_doadores_cache`
 * (Banco Principal), que é por nome civil + UF e quase nunca casava com o nome
 * parlamentar. Base fora do ar ou tabela ausente: null (o pipe segue sem ela).
 */
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export interface ContaCampanha {
	sq_candidato: string;
	ano_eleicao: number;
	tipo: "DOADOR" | "FORNECEDOR";
	documento: string;
	nome: string | null;
	valor_total: number;
	quantidade: number;
	origem: string | null;
}

export interface ContasCampanha {
	doadores: ContaCampanha[];
	fornecedores: ContaCampanha[];
}

/** Os maiores de cada papel (o motor só precisa dos que podem cruzar). */
export const LIMITE_POR_PAPEL = 500;

type ClienteSupabase = Pick<typeof supabasePerfilAdmin, "from">;

let avisou = false;
export function reiniciarAvisoCampanha() {
	avisou = false;
}

async function porTipo(cliente: ClienteSupabase, sq: string, tipo: ContaCampanha["tipo"]) {
	return cliente
		.from("tse_campanha_contas")
		.select("sq_candidato,ano_eleicao,tipo,documento,nome,valor_total,quantidade,origem")
		.eq("sq_candidato", sq)
		.eq("tipo", tipo)
		.order("valor_total", { ascending: false })
		.limit(LIMITE_POR_PAPEL);
}

export async function buscarContasCampanha(sq: string | null | undefined, cliente: ClienteSupabase = supabasePerfilAdmin): Promise<ContasCampanha | null> {
	if (!sq) return null;
	const [d, f] = await Promise.all([porTipo(cliente, sq, "DOADOR"), porTipo(cliente, sq, "FORNECEDOR")]);
	const erro = d.error ?? f.error;
	if (erro) {
		if (!avisou) console.warn(`[TSE CAMPANHA] Base indisponível (${erro.message}); seguindo sem ela.`);
		avisou = true;
		return null;
	}
	return { doadores: (d.data ?? []) as ContaCampanha[], fornecedores: (f.data ?? []) as ContaCampanha[] };
}
