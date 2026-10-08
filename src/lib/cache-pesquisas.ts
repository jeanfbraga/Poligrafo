/* ==========================================================================
   Política do cache de investigações (tabela `pesquisas` do Supabase).

   - LEITURA: sempre permitida, inclusive em desenvolvimento (o front consulta o
     banco antes de bater nas APIs externas).
   - GRAVAÇÃO: bloqueada em desenvolvimento (o booleano `isDev` já existente),
     porque o .env.local aponta para o mesmo banco de produção e não podemos
     poluí-lo com snapshots locais.
   ========================================================================== */

export function podeLerCachePesquisas(): boolean {
	return true;
}

export function podeGravarCachePesquisas(): boolean {
	return process.env.NODE_ENV !== "development";
}

/**
 * Chave da linha em `pesquisas`: nome digitado + ref. A mesma na leitura e na gravação,
 * inclusive quando a ref veio do índice local (busca só por nome que cai direto no dossiê).
 */
export function chaveCachePesquisa(nome: string, ref?: string | null): string {
	return ref ? `${nome}_${ref}` : nome;
}

/**
 * Padrão LIKE para achar a mesma ref gravada com outra grafia do nome ("flavio" × "flávio").
 * `%`, `_` e `\` da ref são escapados: a ref aceita esses caracteres na URL, e sem escape
 * "PREFEITO:SP:1" casaria com "VICE-PREFEITO:SP:1" ou com qualquer ref terminada em "%".
 */
export function padraoMesmaRef(ref: string): string {
	return `%\\_${ref.replace(/[\\%_]/g, (c) => `\\${c}`)}`;
}

/** Cliente mínimo do supabase-js para a leitura (o real ou um falso nos testes). */
interface ConsultaPesquisas {
	gte(coluna: string, valor: string): ConsultaPesquisas;
	order(coluna: string, opcoes: { ascending: boolean }): ConsultaPesquisas;
	limit(n: number): ConsultaPesquisas;
	eq(coluna: string, valor: string): ConsultaPesquisas;
	like(coluna: string, padrao: string): ConsultaPesquisas;
	maybeSingle(): PromiseLike<{ data: { grafo_dados: any } | null; error: unknown }>;
}
export interface ClientePesquisas {
	from(tabela: string): { select(colunas: string): ConsultaPesquisas };
}

/** Investigação guardada desde `desde`: pela chave exata e, se não houver, pela mesma ref. */
export async function lerCachePesquisa(
	cliente: ClientePesquisas,
	chave: string,
	ref: string | null | undefined,
	desde: string,
): Promise<{ grafo_dados: any } | null> {
	const recente = () => cliente.from("pesquisas").select("grafo_dados").gte("atualizado_em", desde).order("atualizado_em", { ascending: false }).limit(1);
	const exata = await recente().eq("termo_busca", chave).maybeSingle();
	if (exata.data || !ref) return exata.data ?? null;
	const mesmaRef = await recente().like("termo_busca", padraoMesmaRef(ref)).maybeSingle();
	return mesmaRef.data ?? null;
}
