/**
 * Verba indenizatória da Câmara Legislativa do DF (CLDF), ao vivo.
 *
 * Portal CKAN `dados.cl.df.gov.br`, conjunto "verbas-indenizatorias": um recurso por ano
 * (planilha com datastore). Em 08/10/2026 havia 2025 e 2026 (até agosto; 259 lançamentos),
 * cada consulta em ~200 ms — não precisa de ETL.
 *   /api/3/action/package_show?id=verbas-indenizatorias      → recursos por ano
 *   /api/3/action/datastore_search?resource_id={id}&limit=… → lançamentos
 *
 * Cada lançamento traz o CPF do deputado: ele é achado pelo CPF confirmado na identidade
 * (o nome na planilha varia: civil ou "Deputado {nome parlamentar}"); nome só como reserva.
 */
import { soDigitos } from "@/lib/documento";
import { buscarJson } from "@/lib/fonte-http";
import { escolherPorNome } from "@/lib/nome-parlamentar";

export const BASE_CLDF = "https://dados.cl.df.gov.br/api/3/action";
export const PAGINA_CLDF = "https://dados.cl.df.gov.br/dataset/verbas-indenizatorias";
/** Ano atual e o anterior. */
const ANOS = 2;
const LIMITE_LANCAMENTOS = 10_000;

export interface RecursoCkan {
	id: string;
	name: string;
	datastore_active?: boolean;
	last_modified?: string | null;
	created?: string | null;
}

export interface LancamentoCldf {
	NOME_PARLAMENTAR?: string | null;
	CPF_PARLAMENTAR?: string | null;
	NOME_PRESTADOR?: string | null;
	CNPJ_PRESTADOR?: string | null;
	CPF_PRESTADOR?: string | null;
	NR_COMPROVANTE?: string | null;
	DATA_COMPROVANTE?: string | null;
	VALOR_DESPESA?: string | number | null;
	CLASSIFICACAO?: string | null;
}

type Obter = <T>(url: string) => Promise<T | null>;

const obterPadrao: Obter = async <T>(url: string) => {
	const r = await buscarJson<T>(url, { fonte: "cldf", timeoutMs: 15_000, tentativas: 2, memoria: { ttlMs: 6 * 60 * 60 * 1000 } });
	return r.ok ? r.dados : null;
};

function versao(r: RecursoCkan): string {
	return String(r.last_modified ?? r.created ?? "");
}

/** Um recurso por ano (o mais atualizado, com datastore), dos anos mais recentes. */
export function recursosPorAno(recursos: RecursoCkan[], anos = ANOS): { ano: number; id: string }[] {
	const porAno = new Map<number, RecursoCkan>();
	for (const r of recursos) {
		const ano = Number(String(r.name ?? "").match(/(\d{4})/)?.[1]);
		if (!ano || !r.datastore_active) continue;
		const atual = porAno.get(ano);
		if (!atual || versao(r) > versao(atual)) porAno.set(ano, r);
	}
	return [...porAno.entries()].sort((a, b) => b[0] - a[0]).slice(0, anos).map(([ano, r]) => ({ ano, id: r.id }));
}

/** "5600.0" (2026) ou "5.600,00" (planilhas antigas). */
export function valorCldf(v: unknown): number {
	const s = String(v ?? "").trim();
	const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
	return Number.isFinite(n) ? n : 0;
}

export function lancamentoParaDespesa(l: LancamentoCldf): any {
	return {
		cnpjCpfFornecedor: soDigitos(l.CNPJ_PRESTADOR || l.CPF_PRESTADOR),
		nomeFornecedor: l.NOME_PRESTADOR || "Fornecedor CLDF",
		tipoDespesa: l.CLASSIFICACAO || "Verba indenizatória",
		valorDocumento: valorCldf(l.VALOR_DESPESA),
		dataDocumento: String(l.DATA_COMPROVANTE ?? "").slice(0, 10),
		numeroDocumento: l.NR_COMPROVANTE || null,
		urlDocumento: PAGINA_CLDF,
		fonte: "CLDF",
	};
}

/** Pelo CPF confirmado; sem ele (ou sem lançamento com ele), pelo nome — ambíguo não escolhe. */
export function lancamentosDoDeputado(lista: LancamentoCldf[], cpf: string | null | undefined, nome: string): { lancamentos: LancamentoCldf[]; nomeNaCasa: string; por: "CPF" | "nome" } | null {
	const doc = soDigitos(cpf);
	const porCpf = doc.length === 11 ? lista.filter((l) => soDigitos(l.CPF_PARLAMENTAR) === doc) : [];
	if (porCpf.length) return { lancamentos: porCpf, nomeNaCasa: String(porCpf[0].NOME_PARLAMENTAR ?? nome), por: "CPF" };
	const nomes = [...new Set(lista.map((l) => String(l.NOME_PARLAMENTAR ?? "")).filter(Boolean))];
	const escolhido = escolherPorNome(nomes, nome, (n) => n.replace(/^Deputad[oa]\s+/i, ""));
	return escolhido ? { lancamentos: lista.filter((l) => l.NOME_PARLAMENTAR === escolhido), nomeNaCasa: escolhido, por: "nome" } : null;
}

type Emissor = (tipo: string, payload: any) => void;

export async function despesasCldfParaOPipe(alvo: { nome: string; cpf?: string | null }, sendEvent: Emissor, obter: Obter = obterPadrao): Promise<any[]> {
	const pacote = await obter<{ result?: { resources?: RecursoCkan[] } }>(`${BASE_CLDF}/package_show?id=verbas-indenizatorias`);
	const recursos = recursosPorAno(pacote?.result?.resources ?? []);
	const respostas = await Promise.all(recursos.map((r) => obter<{ result?: { records?: LancamentoCldf[] } }>(`${BASE_CLDF}/datastore_search?resource_id=${r.id}&limit=${LIMITE_LANCAMENTOS}`)));
	if (recursos.length === 0 || respostas.every((r) => !r)) {
		sendEvent("STATUS", { msg: "[CLDF] Dados abertos da Câmara Legislativa indisponíveis; verba indenizatória não consultada." });
		return [];
	}
	const anos = recursos.map((r) => r.ano).join(" e ");
	const achado = lancamentosDoDeputado(respostas.flatMap((r) => r?.result?.records ?? []), alvo.cpf, alvo.nome);
	if (!achado) {
		sendEvent("STATUS", { msg: `[CLDF] Nenhum lançamento de verba indenizatória de ${alvo.nome} em ${anos} (procurado pelo CPF e pelo nome).` });
		return [];
	}
	const despesas = achado.lancamentos.map(lancamentoParaDespesa).sort((a, b) => b.valorDocumento - a.valorDocumento);
	sendEvent("STATUS", { msg: `[CLDF] ${despesas.length} lançamento(s) de verba indenizatória de ${achado.nomeNaCasa} em ${anos} (dados abertos da CLDF; deputado achado pelo ${achado.por}).` });
	return despesas.slice(0, 60);
}
