/**
 * Dados de CNPJ da Receita (razão social e quadro de sócios, o QSA).
 *
 * BrasilAPI primeiro; se ela recusar ou não responder, o Minha Receita
 * (minhareceita.org), que publica os mesmos dados no mesmo formato (`nome_socio`,
 * `cnpj_cpf_do_socio` mascarado como `***123456**`). Em 08/10/2026 a BrasilAPI deu
 * 429 (excesso de consultas) e 403 em duas investigações seguidas: os sócios dos
 * fornecedores sumiam do cruzamento sem aviso.
 *
 * - 404 (CNPJ inexistente) não vai para a reserva: os dados são os mesmos.
 * - No máximo 2 consultas ao mesmo tempo (o limite da BrasilAPI é por IP).
 * - Na tela, a falha da BrasilAPI aparece como "tentando de novo"; "não respondeu"
 *   só se a reserva também falhar.
 */
import { soDigitos } from "@/lib/documento";
import { buscarJson, type OpcoesFonte } from "@/lib/fonte-http";
import { limitarSimultaneas } from "@/lib/simultaneas";
import type { EmpresaQsa } from "@/services/core/socio-confirmacao";

export type ResultadoCnpj =
	| { ok: true; dados: EmpresaQsa; via: "BrasilAPI" | "Minha Receita" }
	| { ok: false; motivo: string };

const naFila = limitarSimultaneas(2);
const SEIS_HORAS = 6 * 60 * 60 * 1000;

function opcoes(fonte: string, fetchFn: typeof fetch | undefined, extra: OpcoesFonte = {}): OpcoesFonte {
	return { fonte, timeoutMs: 8000, tentativas: 2, memoria: { ttlMs: SEIS_HORAS }, fetchFn, ...extra };
}

async function consultar(cnpj: string, fetchFn?: typeof fetch): Promise<ResultadoCnpj> {
	const brasil = await buscarJson<EmpresaQsa>(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, opcoes("brasilapi-cnpj", fetchFn, { timeoutMs: 5000, avisoDeFalha: "lenta" }));
	if (brasil.ok) return { ok: true, dados: brasil.dados, via: "BrasilAPI" };
	if (brasil.status === 404) return { ok: false, motivo: brasil.erro };
	const reserva = await buscarJson<EmpresaQsa>(`https://minhareceita.org/${cnpj}`, opcoes("minhareceita", fetchFn));
	if (reserva.ok) return { ok: true, dados: reserva.dados, via: "Minha Receita" };
	return { ok: false, motivo: `${brasil.erro}; reserva: ${reserva.erro}` };
}

export async function buscarDadosCnpj(cnpj: string, fetchFn?: typeof fetch): Promise<ResultadoCnpj> {
	const doc = soDigitos(cnpj);
	if (doc.length !== 14) return { ok: false, motivo: "CNPJ inválido" };
	return naFila(() => consultar(doc, fetchFn));
}
