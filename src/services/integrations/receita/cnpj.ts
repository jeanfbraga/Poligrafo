/**
 * Dados de CNPJ da Receita (razão social e quadro de sócios, o QSA).
 *
 * BrasilAPI primeiro; se ela recusar ou não responder, o Minha Receita
 * (minhareceita.org), que publica os mesmos dados no mesmo formato (`nome_socio`,
 * `cnpj_cpf_do_socio` mascarado como `***123456**`). Em 08/10/2026 a BrasilAPI deu
 * 429 (excesso de consultas) e 403 em duas investigações seguidas: os sócios dos
 * fornecedores sumiam do cruzamento sem aviso.
 *
 * Por último a ReceitaWS (formato próprio, convertido aqui; sem o CPF mascarado do
 * sócio; 3 consultas por minuto no plano gratuito). Em 08/10/2026 a BrasilAPI (500) e
 * o Minha Receita (503) falhavam para empresas baixadas, como a Bolsotini Chocolates
 * e Café declarada ao TSE pelo senador Flávio Bolsonaro; só a ReceitaWS tinha os dados.
 *
 * - 404 (CNPJ inexistente) não vai para a reserva: os dados são os mesmos.
 * - No máximo 2 consultas ao mesmo tempo (o limite da BrasilAPI é por IP).
 * - Na tela, a falha da BrasilAPI aparece como "tentando de novo"; "não respondeu"
 *   só se a última reserva também falhar.
 */
import { soDigitos } from "@/lib/documento";
import { buscarJson, type OpcoesFonte } from "@/lib/fonte-http";
import { limitarSimultaneas } from "@/lib/simultaneas";
import type { EmpresaQsa } from "@/services/core/socio-confirmacao";

export type ResultadoCnpj =
	| { ok: true; dados: EmpresaQsa; via: "BrasilAPI" | "Minha Receita" | "ReceitaWS" }
	| { ok: false; motivo: string };

const naFila = limitarSimultaneas(2);
const SEIS_HORAS = 6 * 60 * 60 * 1000;

function opcoes(fonte: string, fetchFn: typeof fetch | undefined, extra: OpcoesFonte = {}): OpcoesFonte {
	return { fonte, timeoutMs: 8000, tentativas: 2, memoria: { ttlMs: SEIS_HORAS }, fetchFn, ...extra };
}

interface RespostaReceitaWs {
	status?: string;
	nome?: string;
	fantasia?: string;
	situacao?: string;
	capital_social?: string;
	municipio?: string;
	uf?: string;
	atividade_principal?: { text?: string }[];
	qsa?: { nome?: string; qual?: string }[];
}

/** ReceitaWS → formato da BrasilAPI. `status: "ERROR"` (CNPJ inválido ou inexistente) = null. */
export function deReceitaWs(r: RespostaReceitaWs | null | undefined): EmpresaQsa | null {
	if (!r || r.status === "ERROR" || !r.nome) return null;
	return {
		razao_social: r.nome,
		nome_fantasia: r.fantasia || undefined,
		descricao_situacao_cadastral: r.situacao,
		cnae_fiscal_descricao: r.atividade_principal?.[0]?.text,
		capital_social: Number(r.capital_social) || undefined,
		municipio: r.municipio,
		uf: r.uf,
		qsa: (r.qsa ?? []).map((s) => ({ nome_socio: s.nome, qualificacao_socio: s.qual })),
	};
}

async function consultarReceitaWs(cnpj: string, fetchFn?: typeof fetch): Promise<ResultadoCnpj> {
	// Uma tentativa só: o limite gratuito é de 3 consultas por minuto.
	const r = await buscarJson<RespostaReceitaWs>(`https://receitaws.com.br/v1/cnpj/${cnpj}`, opcoes("receitaws", fetchFn, { tentativas: 1 }));
	if (!r.ok) return { ok: false, motivo: r.erro };
	const dados = deReceitaWs(r.dados);
	return dados ? { ok: true, dados, via: "ReceitaWS" } : { ok: false, motivo: "CNPJ_NAO_ENCONTRADO" };
}

async function consultar(cnpj: string, fetchFn?: typeof fetch): Promise<ResultadoCnpj> {
	const brasil = await buscarJson<EmpresaQsa>(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, opcoes("brasilapi-cnpj", fetchFn, { timeoutMs: 5000, avisoDeFalha: "lenta" }));
	if (brasil.ok) return { ok: true, dados: brasil.dados, via: "BrasilAPI" };
	if (brasil.status === 404) return { ok: false, motivo: brasil.erro };
	const reserva = await buscarJson<EmpresaQsa>(`https://minhareceita.org/${cnpj}`, opcoes("minhareceita", fetchFn, { avisoDeFalha: "lenta" }));
	if (reserva.ok) return { ok: true, dados: reserva.dados, via: "Minha Receita" };
	const ultima = await consultarReceitaWs(cnpj, fetchFn);
	if (ultima.ok) return ultima;
	return { ok: false, motivo: `${brasil.erro}; reserva: ${reserva.erro}; ReceitaWS: ${ultima.motivo}` };
}

export async function buscarDadosCnpj(cnpj: string, fetchFn?: typeof fetch): Promise<ResultadoCnpj> {
	const doc = soDigitos(cnpj);
	if (doc.length !== 14) return { ok: false, motivo: "CNPJ inválido" };
	return naFila(() => consultar(doc, fetchFn));
}
