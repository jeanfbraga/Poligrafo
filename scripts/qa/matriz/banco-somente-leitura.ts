/**
 * Dublê de banco para a matriz de alçadas: deixa as LEITURAS irem ao
 * Supabase (para exercitar o pipe de verdade) e transforma toda ESCRITA
 * em no-op. Sem isso, rodar a matriz incrementaria o "Mais investigados"
 * da Home (`incrementar_pesquisa`) e gravaria cache em `pesquisas`.
 *
 * O cache `pesquisas` também é escondido na leitura, para a matriz sempre
 * medir o pipe "fresco" e não um dossiê restaurado.
 */

const METODOS_ESCRITA = new Set(["insert", "upsert", "update", "delete"]);
const RPCS_LEITURA = new Set<string>(); // nenhuma RPC é liberada por padrão
const TABELAS_OCULTAS = new Set(["pesquisas"]);
/**
 * Cache técnico que pode ser gravado: não aparece para o usuário nem mexe em
 * ranking. Sem isso a matriz nunca exercitaria a cópia guardada do PNCP.
 */
const TABELAS_GRAVAVEIS = new Set(["pncp_contratos_cache"]);

interface RegistroEscrita {
	tipo: "tabela" | "rpc";
	alvo: string;
	metodo: string;
}

/** Resultado vazio e encadeável: aceita .eq().select().single()… e é "thenable". */
export function resultadoVazio(dados: unknown = null): unknown {
	const resposta = { data: dados, error: null, count: 0, status: 200, statusText: "OK" };
	const handler: ProxyHandler<object> = {
		get(_alvo, prop) {
			if (prop === "then") {
				return (resolve: (v: unknown) => unknown) => Promise.resolve(resposta).then(resolve);
			}
			if (prop === "catch" || prop === "finally") {
				return () => Promise.resolve(resposta);
			}
			return () => proxy;
		},
	};
	const proxy: object = new Proxy({}, handler);
	return proxy;
}

type ClienteSupabase = {
	from: (tabela: string) => unknown;
	rpc: (fn: string, args?: unknown) => unknown;
};

/**
 * Aplica o dublê num cliente Supabase já criado (muta o objeto: quem
 * importou o mesmo módulo passa a usar a versão protegida).
 */
export function protegerCliente(
	cliente: ClienteSupabase,
	escritas: RegistroEscrita[],
): void {
	const fromOriginal = cliente.from.bind(cliente);
	const rpcOriginal = cliente.rpc.bind(cliente);

	cliente.from = (tabela: string) => {
		if (TABELAS_OCULTAS.has(tabela)) return resultadoVazio([]);
		if (TABELAS_GRAVAVEIS.has(tabela)) return fromOriginal(tabela);
		const construtor = fromOriginal(tabela) as Record<string, unknown>;
		return new Proxy(construtor, {
			get(alvo, prop, receptor) {
				if (typeof prop === "string" && METODOS_ESCRITA.has(prop)) {
					return () => {
						escritas.push({ tipo: "tabela", alvo: tabela, metodo: prop });
						return resultadoVazio();
					};
				}
				const valor = Reflect.get(alvo, prop, receptor);
				return typeof valor === "function" ? valor.bind(alvo) : valor;
			},
		});
	};

	cliente.rpc = (fn: string, args?: unknown) => {
		if (RPCS_LEITURA.has(fn)) return rpcOriginal(fn, args);
		escritas.push({ tipo: "rpc", alvo: fn, metodo: "rpc" });
		return resultadoVazio();
	};
}
