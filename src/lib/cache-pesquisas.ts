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
