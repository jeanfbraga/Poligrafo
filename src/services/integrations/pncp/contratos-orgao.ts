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
import { criarPrazo, type Prazo } from "@/lib/prazo";
import { limitarSimultaneas } from "@/lib/simultaneas";
import { primeiroNumero, primeiroValor } from "@/lib/valores";

/**
 * Tempo por consulta e teto da coleta do órgão. Em 08/10/2026 uma página de 500 contratos
 * da CLDF levou 29 s (o limite era 30 s): a demora do PNCP varia muito. A coleta corre em
 * paralelo com o resto do pipe (60–75 s); o teto evita segurar o dossiê.
 */
const TIMEOUT_CONSULTA_MS = 50_000;
const TETO_DA_COLETA_MS = 80_000;

/** No máximo 2 consultas ao mesmo tempo (a 3ª travava até o timeout; ver lib/simultaneas.ts). */
const naFilaDoPncp = limitarSimultaneas(2);

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
	/** Teto da coleta inteira (padrão: 80 s a partir da chamada). */
	prazo?: Prazo;
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

interface Pagina {
	itens: any[];
	/** Erro de rede/servidor (não é "sem contratos"). */
	falha: string | null;
}

async function pagina(cnpj: string, n: number, periodo: string, op: OpcoesContratosOrgao, prazo: Prazo): Promise<Pagina> {
	const url = `${PNCP_CONSULTA}?${periodo}&cnpjOrgao=${cnpj}&pagina=${n}&tamanhoPagina=${TAMANHO_PAGINA}`;
	const r = await naFilaDoPncp(() => buscarJson<{ data?: any[]; totalPaginas?: number }>(url, {
		fonte: "pncp-contratos-orgao",
		timeoutMs: TIMEOUT_CONSULTA_MS,
		tentativas: 2,
		prazo,
		memoria: { ttlMs: 6 * 60 * 60 * 1000 },
		fetchFn: op.fetchFn,
	}));
	if (r.ok) return { itens: r.dados?.data ?? [], falha: null };
	// 204 (sem conteúdo) chega como erro de leitura: é "nenhum contrato". Da 2ª página em
	// diante, 400 é "Página N inexistente" (acabaram os contratos). O resto é falha: em
	// 08/10/2026 o PNCP deu 500, 429 (limite de requisições) e timeout, que antes viravam
	// "nenhum contrato publicado" no log.
	const fimDasPaginas = r.status === 204 || (n > 1 && r.status === 400);
	return { itens: [], falha: fimDasPaginas ? null : r.mensagem };
}

/**
 * Contratos do órgão no período, conferidos (só o próprio órgão), do maior valor ao menor.
 * Primeira página com falha = exceção (o chamador diz no log que não consultou); falha só
 * na segunda = segue com a primeira e avisa.
 */
function periodoDaConsulta(op: OpcoesContratosOrgao): string {
	const fim = op.agora?.() ?? new Date();
	const inicio = new Date(fim.getTime() - (op.dias ?? 365) * 864e5);
	return `dataInicial=${aaaammdd(inicio)}&dataFinal=${aaaammdd(fim)}`;
}

/** 1ª página com falha = exceção; falha só nas seguintes = aviso no log. */
function conferirFalhas(paginas: Pagina[], cnpj: string): void {
	if (paginas[0].falha) throw new Error(`PNCP não respondeu (contratos do órgão ${cnpj}): ${paginas[0].falha}`);
	const falhas = paginas.filter((p) => p.falha).length;
	if (falhas) console.warn(`[PNCP] ${falhas} página(s) dos contratos do órgão ${cnpj} falharam; seguindo com as que vieram.`);
}

export async function buscarContratosDoOrgao(cnpjOrgao: string, op: OpcoesContratosOrgao = {}): Promise<ContratoOrgao[]> {
	const cnpj = soDigitos(cnpjOrgao);
	if (cnpj.length !== 14) return [];
	const periodo = periodoDaConsulta(op);
	// Páginas pedidas juntas (cada uma leva ~20 s no PNCP; em sequência eram 39 s para o Governo de SP).
	const prazo = op.prazo ?? criarPrazo(TETO_DA_COLETA_MS);
	const paginas = await Promise.all(Array.from({ length: op.paginas ?? 2 }, (_v, i) => pagina(cnpj, i + 1, periodo, op, prazo)));
	conferirFalhas(paginas, cnpj);
	const unicos = new Map<string, ContratoOrgao>();
	for (const c of paginas.flatMap((p) => p.itens).map(deConsulta)) {
		if (c.cnpjOrgao === cnpj && !unicos.has(c.numeroControlePNCP)) unicos.set(c.numeroControlePNCP, c);
	}
	return [...unicos.values()].sort((a, b) => b.valorGlobal - a.valorGlobal);
}
