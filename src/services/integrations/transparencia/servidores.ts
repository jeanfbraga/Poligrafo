/**
 * Servidor federal por CPF no Portal da Transparência (`/servidores?cpf=`).
 * Referência: mcp-brasil `data/transparencia/client.py` (buscar_servidores).
 * A API exige CPF ou órgão — busca só por nome não é aceita. `/pessoas-fisicas`
 * responde 403 para a nossa chave (07/10/2026), por isso não é usado.
 *
 * Interessam as FUNÇÕES/cargos de confiança (`fichasFuncao`): servidor de
 * carreira sem função comissionada não é sinal de nada.
 */
import { buscarJson } from "@/lib/fonte-http";
import { soDigitos } from "@/lib/documento";
import { transparenciaLimiter } from "@/services/core/rate-limiter";

const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados/servidores";

export interface FuncaoComissionada {
	funcao: string;
	atividade: string;
	orgao: string;
	uf: string;
	/** Como veio da fonte (dd/mm/aaaa). */
	dataIngressoFuncao: string;
	situacao: string;
}

function texto(v: unknown): string {
	const s = String(v ?? "").trim();
	return s === "Sem informação" ? "" : s;
}

export function lerFuncoes(registros: any[]): FuncaoComissionada[] {
	return (registros ?? []).flatMap((r) =>
		(r?.fichasFuncao ?? [])
			.filter((f: any) => texto(f?.funcao))
			.map((f: any) => ({
				funcao: texto(f.funcao),
				atividade: texto(f.atividade),
				orgao: texto(f.orgaoServidorExercicio) || texto(f.orgaoExercicio) || texto(r?.servidor?.orgaoServidorExercicio?.nome),
				uf: texto(f.ufExercicio),
				dataIngressoFuncao: texto(f.dataIngressoFuncao),
				situacao: texto(f.situacaoServidor) || texto(r?.servidor?.situacao),
			})),
	);
}

let avisou = false;
/** Testes: o aviso de falha do Portal sai uma vez por processo. */
export function reiniciarAvisoServidores() {
	avisou = false;
}

/** Funções comissionadas atuais do CPF no Executivo federal (vazio = não é comissionado ou sem chave). */
export async function buscarFuncoesPorCpf(
	cpf: string,
	apiKey: string | undefined = process.env.TRANSPARENCIA_API_KEY,
	fetchFn?: typeof fetch,
): Promise<FuncaoComissionada[]> {
	const doc = soDigitos(cpf);
	if (!apiKey || doc.length !== 11) return [];
	await transparenciaLimiter.acquire();
	const r = await buscarJson<any[]>(`${BASE}?cpf=${doc}&pagina=1`, {
		fonte: "cgu-servidores",
		headers: { "chave-api-dados": apiKey },
		timeoutMs: 10_000,
		memoria: { ttlMs: 24 * 60 * 60 * 1000 },
		fetchFn,
	});
	if (!r.ok && !avisou) {
		console.warn(`[CGU SERVIDORES] Consulta de servidores falhou (${r.erro}); cargos de confiança dos doadores não conferidos.`);
		avisou = true;
	}
	return r.ok && Array.isArray(r.dados) ? lerFuncoes(r.dados) : [];
}
