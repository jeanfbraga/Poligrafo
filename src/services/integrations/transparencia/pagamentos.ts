/**
 * Pagamentos do governo federal a um favorecido (CPF/CNPJ), no Portal da Transparência.
 *
 * Endpoint certo (conferido ao vivo em 07/10/2026, referência: mcp-brasil
 * `buscar_documentos_despesa`): /despesas/documentos-por-favorecido?codigoPessoa=&ano=&fase=3
 * (fase 3 = pagamento). O código antigo chamava /despesas/por-favorecido
 * ?cnpjFornecedor= — 403 para a nossa chave em qualquer formato: nunca trouxe nada.
 */
import { buscarJson } from "@/lib/fonte-http";
import { soDigitos } from "@/lib/documento";
import { transparenciaLimiter } from "@/services/core/rate-limiter";

const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados/despesas/documentos-por-favorecido";

export interface PagamentoFederal {
	documento: string;
	data: string | null;
	valor: number;
	orgao: string;
	orgaoSuperior: string;
	funcao: string;
	programa: string;
	acao: string;
	observacao: string;
	autorEmenda: string;
	favorecido: string;
	codigoFavorecido: string;
}

function iso(s: unknown): string | null {
	const m = String(s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function valorBr(v: unknown): number {
	if (typeof v === "number") return v;
	const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
	return Number.isFinite(n) ? n : 0;
}

function texto(v: unknown): string {
	const s = String(v ?? "").trim();
	return s === "Sem informação" || s === "-" ? "" : s;
}

export function lerPagamento(r: any): PagamentoFederal {
	return {
		documento: texto(r.documentoResumido) || texto(r.documento),
		data: iso(r.data),
		valor: valorBr(r.valor),
		orgao: texto(r.orgao),
		orgaoSuperior: texto(r.orgaoSuperior),
		funcao: texto(r.funcao),
		programa: texto(r.programa),
		acao: texto(r.acao),
		observacao: texto(r.observacao).slice(0, 240),
		autorEmenda: texto(r.autor),
		favorecido: texto(r.nomeFavorecido),
		codigoFavorecido: soDigitos(r.codigoFavorecido),
	};
}

/** Pagamentos dos anos pedidos (1 página por ano), conferidos: só os do próprio favorecido. */
export async function buscarPagamentosFederais(
	documento: string,
	anos: number[],
	apiKey: string | undefined = process.env.TRANSPARENCIA_API_KEY,
	fetchFn?: typeof fetch,
): Promise<PagamentoFederal[]> {
	const doc = soDigitos(documento);
	if (!apiKey || (doc.length !== 11 && doc.length !== 14)) return [];
	const porAno = await Promise.all(
		anos.map(async (ano) => {
			await transparenciaLimiter.acquire();
			const r = await buscarJson<any[]>(`${BASE}?codigoPessoa=${doc}&ano=${ano}&fase=3&pagina=1`, {
				fonte: "cgu-pagamentos",
				headers: { "chave-api-dados": apiKey },
				timeoutMs: 12_000,
				memoria: { ttlMs: 6 * 60 * 60 * 1000 },
				fetchFn,
			});
			return r.ok && Array.isArray(r.dados) ? r.dados.map(lerPagamento) : [];
		}),
	);
	return porAno.flat().filter((p) => !p.codigoFavorecido || p.codigoFavorecido === doc).sort((a, b) => b.valor - a.valor);
}
