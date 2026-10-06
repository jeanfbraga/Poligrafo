/**
 * Contratos públicos de um FORNECEDOR (CNPJ/CPF), com conferência obrigatória.
 *
 * Por que existe (diagnóstico de 06/10/2026, confirmado pelo canário):
 *  - a API de consulta do PNCP IGNORA `cnpjFornecedor`: pedindo a Petrobras,
 *    vinham 2 milhões de contratos de outras empresas, e a IA os analisava
 *    como se fossem da empresa investigada;
 *  - `compras.dados.gov.br` (legado) não existe mais (404), e o Compras.gov
 *    novo e o PNCP `/v1/fornecedores` também responderam 404.
 *
 * Fontes que funcionam:
 *  - Portal da Transparência `/contratos/cpf-cnpj` — contratos FEDERAIS do
 *    fornecedor (endpoint do `data/transparencia/client.py` do mcp-brasil);
 *  - busca textual do PNCP `/api/search` — cobre estados e municípios; cada
 *    item traz `fornecedor_ni`, então dá para conferir o CNPJ.
 *
 * Regra de ouro: só volta contrato cujo fornecedor É o documento consultado.
 */
import { buscarJson } from "@/lib/fonte-http";
import type { Prazo } from "@/lib/prazo";
import { soDigitos } from "@/lib/documento";
import { primeiroNumero, primeiroValor } from "@/lib/valores";
import { transparenciaLimiter } from "@/services/core/rate-limiter";

export interface ContratoFornecedor {
	/** Id estável com a fonte: "cgu:4759147" ou o número de controle do PNCP. */
	id: string;
	fonte: "CGU" | "PNCP";
	numeroControlePNCP?: string;
	niFornecedor: string;
	nomeFornecedor: string;
	orgaoEntidade: { cnpj: string; razaoSocial: string; esferaId?: string };
	objetoContrato: string;
	valorGlobal: number;
	dataAssinatura?: string;
	url?: string;
}

export interface OpcoesContratosFornecedor {
	paginasCgu?: number;
	paginasPncp?: number;
	/** Razão social para a busca textual do PNCP (senão vem dos contratos da CGU). */
	razaoSocial?: string;
	prazo?: Prazo;
	fetchFn?: typeof fetch;
}

const CGU = "https://api.portaldatransparencia.gov.br/api-de-dados/contratos/cpf-cnpj";
const PNCP_BUSCA = "https://pncp.gov.br/api/search/";

function deCgu(c: any): ContratoFornecedor {
	const forn = c.fornecedor ?? {};
	const ug = c.unidadeGestora ?? {};
	const orgao = ug.orgaoVinculado ?? {};
	return {
		id: `cgu:${c.id}`,
		fonte: "CGU",
		niFornecedor: soDigitos(primeiroValor(forn.cnpjFormatado, forn.cpfFormatado)),
		nomeFornecedor: primeiroValor(forn.razaoSocialReceita, forn.nome),
		orgaoEntidade: { cnpj: soDigitos(orgao.cnpj), razaoSocial: primeiroValor(orgao.nome, ug.nome), esferaId: "F" },
		objetoContrato: primeiroValor(c.objeto).replace(/^Objeto:\s*/i, ""),
		valorGlobal: primeiroNumero(c.valorFinalCompra, c.valorInicialCompra),
		dataAssinatura: primeiroValor(c.dataAssinatura) || undefined,
		url: c.id ? `https://portaldatransparencia.gov.br/contratos/${c.id}` : undefined,
	};
}

function dePncp(i: any): ContratoFornecedor {
	const controle = primeiroValor(i.numero_controle_pncp);
	return {
		id: controle || `pncp:${i.id}`,
		fonte: "PNCP",
		numeroControlePNCP: controle || undefined,
		niFornecedor: soDigitos(i.fornecedor_ni),
		nomeFornecedor: primeiroValor(i.fornecedor_nome),
		orgaoEntidade: { cnpj: soDigitos(i.orgao_cnpj), razaoSocial: primeiroValor(i.orgao_nome), esferaId: primeiroValor(i.esfera_id) || undefined },
		objetoContrato: primeiroValor(i.description, i.title),
		valorGlobal: primeiroNumero(i.valor_global),
		dataAssinatura: primeiroValor(i.data_assinatura) || undefined,
		url: i.item_url ? `https://pncp.gov.br/app${i.item_url}` : undefined,
	};
}

async function paginasCgu(doc: string, paginas: number, op: OpcoesContratosFornecedor): Promise<ContratoFornecedor[]> {
	const chave = process.env.TRANSPARENCIA_API_KEY;
	if (!chave || paginas <= 0) return [];
	const todos: ContratoFornecedor[] = [];
	for (let pagina = 1; pagina <= paginas; pagina++) {
		await transparenciaLimiter.acquire();
		const r = await buscarJson<any[]>(`${CGU}?cpfCnpj=${doc}&pagina=${pagina}`, {
			fonte: "cgu-contratos", headers: { "chave-api-dados": chave }, prazo: op.prazo, fetchFn: op.fetchFn, timeoutMs: 12_000,
		});
		if (!r.ok || !Array.isArray(r.dados) || r.dados.length === 0) break;
		todos.push(...r.dados.map(deCgu));
		if (r.dados.length < 15) break; // página incompleta = última
	}
	return todos;
}

async function paginasPncp(razao: string, paginas: number, op: OpcoesContratosFornecedor): Promise<ContratoFornecedor[]> {
	if (!razao || paginas <= 0) return [];
	const todos: ContratoFornecedor[] = [];
	for (let pagina = 1; pagina <= paginas; pagina++) {
		const url = `${PNCP_BUSCA}?q=${encodeURIComponent(razao)}&tipos_documento=contrato&ordenacao=-data&pagina=${pagina}&tam_pagina=100`;
		const r = await buscarJson<{ items?: any[] }>(url, {
			fonte: "pncp-busca", navegador: true, prazo: op.prazo, fetchFn: op.fetchFn, timeoutMs: 15_000,
		});
		const itens = r.ok ? r.dados?.items ?? [] : [];
		if (itens.length === 0) break;
		todos.push(...itens.map(dePncp));
		if (itens.length < 100) break;
	}
	return todos;
}

/** Mantém só os contratos do fornecedor consultado, sem repetição, do maior valor ao menor. */
export function filtrarEOrdenar(contratos: ContratoFornecedor[], doc: string): ContratoFornecedor[] {
	const alvo = soDigitos(doc);
	const unicos = new Map<string, ContratoFornecedor>();
	for (const c of contratos) {
		if (c.niFornecedor === alvo && !unicos.has(c.id)) unicos.set(c.id, c);
	}
	return [...unicos.values()].sort((a, b) => b.valorGlobal - a.valorGlobal);
}

export async function buscarContratosPorFornecedor(
	documento: string,
	op: OpcoesContratosFornecedor = {},
): Promise<ContratoFornecedor[]> {
	const doc = soDigitos(documento);
	if (doc.length !== 14 && doc.length !== 11) return [];
	const federais = await paginasCgu(doc, op.paginasCgu ?? 2, op);
	const razao = op.razaoSocial || federais.find((c) => c.nomeFornecedor)?.nomeFornecedor || "";
	const pncp = await paginasPncp(razao, op.paginasPncp ?? 2, op);
	return filtrarEOrdenar([...federais, ...pncp], doc);
}
