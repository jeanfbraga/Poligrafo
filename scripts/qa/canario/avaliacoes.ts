/**
 * Avaliações puras usadas pelas sondas (testadas em
 * __tests__/unit/canario-fontes.test.ts). Ficam separadas da rede para
 * provar o diagnóstico sem depender de a fonte estar no ar.
 */
import type { Veredito } from "./tipos";

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/**
 * Confere se um filtro por fornecedor foi respeitado: todo item devolvido
 * precisa ter o documento do fornecedor igual ao consultado.
 */
export function avaliarFiltroFornecedor(
	itens: Record<string, unknown>[],
	cnpj: string,
	campo = "niFornecedor",
): Veredito {
	if (itens.length === 0) {
		return { estado: "OK", detalhe: "nenhum contrato devolvido (filtro pode estar ativo)" };
	}
	const alvo = soDigitos(cnpj);
	const errados = itens.filter((i) => soDigitos(i[campo]) !== alvo).length;
	if (errados === 0) {
		return { estado: "OK", detalhe: `${itens.length} contrato(s), todos do fornecedor consultado` };
	}
	return {
		estado: "ALERTA",
		detalhe: `filtro IGNORADO: ${errados} de ${itens.length} contratos são de outros fornecedores`,
	};
}

/** A API pública do DataJud expõe as partes (necessário para busca por CPF)? */
export function avaliarPartesDataJud(hits: { _source?: Record<string, unknown> }[]): Veredito {
	if (hits.length === 0) return { estado: "FALHA", detalhe: "nenhum processo devolvido" };
	const comPartes = hits.filter((h) => h._source && "partes" in h._source).length;
	if (comPartes > 0) return { estado: "OK", detalhe: `${comPartes} processo(s) com campo partes` };
	return {
		estado: "ALERTA",
		detalhe: "processos SEM campo partes: busca por CPF (partes.documento) sempre volta vazia",
	};
}

/**
 * Endpoint que o código ainda chama, mas que suspeitamos não existir
 * (ou estar fechado): 4xx confirma a suspeita.
 */
export function avaliarEndpointSuspeito(status: number): Veredito {
	if ([400, 401, 403, 404, 405, 410].includes(status)) {
		return { estado: "ALERTA", detalhe: `HTTP ${status}: endpoint inexistente ou fechado — o código ainda chama` };
	}
	if (status >= 200 && status < 300) {
		return { estado: "OK", detalhe: `HTTP ${status}: endpoint existe` };
	}
	return { estado: "FALHA", detalhe: `HTTP ${status}` };
}

// `resposta.conteudo` é o envelope do TCE-PE (data/tce_pe/client.py do mcp-brasil).
const CHAVES_LISTA = [
	"dados", "data", "items", "itens", "rows", "list", "resultado", "result",
	"content", "value", "resposta", "conteudo",
];

/**
 * Lista contida na resposta: array puro, envelope comum das APIs gov
 * (`dados`, `data`, `rows`, `list`…) ou, em último caso, a primeira
 * propriedade que seja array (ex.: `{ "municipios": [...] }` do TCE-RS).
 */
export function extrairLista(json: unknown, profundidade = 0): unknown[] {
	if (Array.isArray(json)) return json;
	if (!json || typeof json !== "object" || profundidade > 3) return [];
	const obj = json as Record<string, unknown>;
	for (const chave of CHAVES_LISTA) {
		const interno = extrairLista(obj[chave], profundidade + 1);
		if (interno.length) return interno;
	}
	const primeiraLista = Object.values(obj).find(Array.isArray);
	return (primeiraLista as unknown[] | undefined) ?? [];
}

/** Página de desafio antirrobô (F5/TSPD, Cloudflare) no lugar dos dados. */
export function paginaAntirrobo(corpo: unknown): boolean {
	return typeof corpo === "string" && /TSPD|bobcmn|cf-browser-verification|challenge-platform/.test(corpo);
}

/** Busca textual do PNCP: os itens trazem `fornecedor_ni` para conferência. */
export function avaliarBuscaPncp(json: unknown): Veredito {
	const itens = extrairLista(json) as { fornecedor_ni?: string }[];
	if (itens.length === 0) return { estado: "FALHA", detalhe: "busca sem resultados" };
	const comFornecedor = itens.filter((i) => i.fornecedor_ni).length;
	return comFornecedor > 0
		? { estado: "OK", detalhe: `${itens.length} item(ns), ${comFornecedor} com fornecedor_ni (dá para filtrar por CNPJ)` }
		: { estado: "ALERTA", detalhe: "itens sem fornecedor_ni: não dá para conferir o fornecedor" };
}

export function avaliarLista(json: unknown, minimo = 1): Veredito {
	const lista = extrairLista(json);
	if (lista.length >= minimo) return { estado: "OK", detalhe: `${lista.length} registro(s)` };
	return { estado: "FALHA", detalhe: "resposta sem registros" };
}

export function linhaMarkdown(r: {
	estado: string;
	alcada: string;
	fonte: string;
	usadaEm: string;
	detalhe: string;
	ms: number;
}): string {
	const icone = { OK: "✅", ALERTA: "⚠️", FALHA: "❌", PULADA: "⏭️" }[r.estado] ?? "•";
	const detalhe = r.detalhe.replace(/\|/g, "/").slice(0, 160);
	return `| ${icone} ${r.estado} | ${r.alcada} | ${r.fonte} | ${r.usadaEm} | ${detalhe} | ${r.ms} ms |`;
}
