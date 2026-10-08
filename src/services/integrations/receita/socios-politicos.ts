/**
 * Empresas do político pela base socios_politicos (Banco de Perfil): o QSA do arquivo aberto
 * de CNPJ da Receita, conferido na carga por nome completo + 6 dígitos do meio do CPF
 * (scripts/etl/socios-politicos-sync.ts). Não depende de site de busca, que recusa a Vercel.
 *
 * Com CPF, a consulta é pelo CPF. Sem ele (drilldown pela tela), pelo nome civil exato,
 * e quem chama ainda confere a razão social da empresa declarada.
 * Base fora do ar ou tabela vazia: [] e a investigação segue pelas outras fontes.
 */
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export interface EmpresaDoPolitico {
	cpf_politico: string;
	cnpj: string;
	nome_politico: string;
	razao_social: string | null;
	natureza_juridica: string | null;
	qualificacao_socio: string | null;
	data_entrada: string | null;
	referencia: string;
}

const COLUNAS = "cpf_politico,cnpj,nome_politico,razao_social,natureza_juridica,qualificacao_socio,data_entrada,referencia";

type ClienteSupabase = Pick<typeof supabasePerfilAdmin, "from">;

export async function empresasDoPoliticoNaBase(
	ref: { cpf: string | null; nomes: string[] },
	cliente: ClienteSupabase = supabasePerfilAdmin,
): Promise<EmpresaDoPolitico[]> {
	if (!ref.cpf && ref.nomes.length === 0) return [];
	const consulta = cliente.from("socios_politicos").select(COLUNAS).limit(200);
	const { data, error } = await (ref.cpf ? consulta.eq("cpf_politico", ref.cpf) : consulta.in("nome_politico", ref.nomes));
	if (error) {
		console.warn(`[SOCIOS POLITICOS] Base indisponível (${error.message}); seguindo sem ela.`);
		return [];
	}
	return (data ?? []) as unknown as EmpresaDoPolitico[];
}
