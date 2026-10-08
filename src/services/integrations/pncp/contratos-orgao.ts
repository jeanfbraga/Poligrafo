/**
 * Contratos de um ÓRGÃO (prefeitura, governo do estado) no PNCP.
 *
 * Ao contrário de `cnpjFornecedor` (ignorado pela API — canário de 06/10/2026),
 * o filtro `cnpjOrgao` funciona: em 07/10/2026 São Paulo devolveu 28 contratos
 * e Cuiabá 595, todos do próprio órgão. Mesmo assim cada item é conferido.
 * Órgão que publica em portal próprio (ex.: Prefeitura de Goiânia) volta vazio
 * — isso é "sem contratos no PNCP", nunca dado inventado.
 */
import { buscarJson } from "@/lib/fonte-http";
import { soDigitos } from "@/lib/documento";
import { primeiroNumero, primeiroValor } from "@/lib/valores";

const PNCP_CONSULTA = "https://pncp.gov.br/api/consulta/v1/contratos";
/** A API aceita até 500 por página; 2 páginas = os 1.000 mais recentes do período. */
const TAMANHO_PAGINA = 500;

export interface ContratoOrgao {
	numeroControlePNCP: string;
	cnpjOrgao: string;
	nomeOrgao: string;
	unidade: string;
	niFornecedor: string;
	nomeFornecedor: string;
	objeto: string;
	valorGlobal: number;
	dataAssinatura: string;
	emendaParlamentar: boolean;
	url: string;
}

export interface OpcoesContratosOrgao {
	dias?: number;
	paginas?: number;
	fetchFn?: typeof fetch;
	agora?: () => Date;
}

function aaaammdd(d: Date): string {
	return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export function deConsulta(c: any): ContratoOrgao {
	const cnpj = soDigitos(c.orgaoEntidade?.cnpj);
	return {
		numeroControlePNCP: primeiroValor(c.numeroControlePNCP),
		cnpjOrgao: cnpj,
		nomeOrgao: primeiroValor(c.orgaoEntidade?.razaoSocial),
		unidade: primeiroValor(c.unidadeOrgao?.nomeUnidade),
		niFornecedor: soDigitos(c.niFornecedor),
		nomeFornecedor: primeiroValor(c.nomeRazaoSocialFornecedor),
		objeto: primeiroValor(c.objetoContrato),
		valorGlobal: primeiroNumero(c.valorGlobal, c.valorInicial),
		dataAssinatura: primeiroValor(c.dataAssinatura),
		emendaParlamentar: Boolean(c.emendaParlamentar),
		url: c.anoContrato && c.sequencialContrato ? `https://pncp.gov.br/app/contratos/${cnpj}/${c.anoContrato}/${c.sequencialContrato}` : "https://pncp.gov.br/app/contratos",
	};
}

async function pagina(cnpj: string, n: number, periodo: string, op: OpcoesContratosOrgao) {
	const url = `${PNCP_CONSULTA}?${periodo}&cnpjOrgao=${cnpj}&pagina=${n}&tamanhoPagina=${TAMANHO_PAGINA}`;
	const r = await buscarJson<{ data?: any[]; totalPaginas?: number }>(url, {
		fonte: "pncp-contratos-orgao",
		timeoutMs: 30_000,
		tentativas: 2,
		memoria: { ttlMs: 6 * 60 * 60 * 1000 },
		fetchFn: op.fetchFn,
	});
	// 204 (sem conteúdo) chega como erro de leitura: é "nenhum contrato".
	return r.ok ? { itens: r.dados?.data ?? [], totalPaginas: r.dados?.totalPaginas ?? 1 } : { itens: [], totalPaginas: 0 };
}

/** Contratos do órgão no período, conferidos (só o próprio órgão), do maior valor ao menor. */
export async function buscarContratosDoOrgao(cnpjOrgao: string, op: OpcoesContratosOrgao = {}): Promise<ContratoOrgao[]> {
	const cnpj = soDigitos(cnpjOrgao);
	if (cnpj.length !== 14) return [];
	const fim = op.agora?.() ?? new Date();
	const inicio = new Date(fim.getTime() - (op.dias ?? 365) * 864e5);
	const periodo = `dataInicial=${aaaammdd(inicio)}&dataFinal=${aaaammdd(fim)}`;
	// Páginas pedidas juntas (cada uma leva ~20 s no PNCP; em sequência eram 39 s para o Governo de SP).
	// Página que não existe volta vazia.
	const paginas = await Promise.all(Array.from({ length: op.paginas ?? 2 }, (_v, i) => pagina(cnpj, i + 1, periodo, op)));
	const unicos = new Map<string, ContratoOrgao>();
	for (const c of paginas.flatMap((p) => p.itens).map(deConsulta)) {
		if (c.cnpjOrgao === cnpj && !unicos.has(c.numeroControlePNCP)) unicos.set(c.numeroControlePNCP, c);
	}
	return [...unicos.values()].sort((a, b) => b.valorGlobal - a.valorGlobal);
}
