/**
 * Verba indenizatória da Assembleia Legislativa de Minas Gerais (ALMG), ao vivo.
 *
 * API de dados abertos (o endereço antigo /ws/ redireciona para /api/v2/; 07/10/2026):
 *   /api/v2/deputados/em_exercicio?formato=json                               → 77 deputados
 *   /api/v2/prestacao_contas/verbas_indenizatorias/deputados/{id}/{ano}/{mes} → por tipo de
 *     despesa, com cada nota em `listaDetalheVerba` (cpfCnpj, nomeEmitente,
 *     valorReembolsado, dataEmissao, descDocumento)
 * Responde em ~25–120 ms: não precisa de ETL.
 */
import { buscarJson } from "@/lib/fonte-http";
import { soDigitos } from "@/lib/documento";
import { escolherPorNome } from "@/lib/nome-parlamentar";
import { emitirEtapa } from "@/services/core/etapas-ao-vivo";

export const BASE_ALMG = "https://dadosabertos.almg.gov.br/api/v2";
const MESES = 24;
const POR_VEZ = 6;

export interface DeputadoAlmg {
	id: number;
	nome: string;
	partido?: string;
}

type Obter = <T>(url: string) => Promise<T | null>;

const obterPadrao: Obter = async <T>(url: string) => {
	const r = await buscarJson<T>(url, { fonte: "almg", timeoutMs: 15_000, tentativas: 2, memoria: { ttlMs: 6 * 60 * 60 * 1000 } });
	return r.ok ? r.dados : null;
};

function dataDe(v: any): string {
	return String(v?.$ ?? v ?? "").slice(0, 10);
}

/** Notas de um mês → despesas no formato do pipe. */
export function notasDoMes(resposta: any, url: string): any[] {
	return (resposta?.list ?? []).flatMap((tipo: any) =>
		(tipo?.listaDetalheVerba ?? []).map((n: any) => ({
			cnpjCpfFornecedor: soDigitos(n.cpfCnpj),
			nomeFornecedor: n.nomeEmitente || "Fornecedor ALMG",
			tipoDespesa: n.descTipoDespesa || tipo.descTipoDespesa || "Verba indenizatória",
			valorDocumento: Number(n.valorReembolsado ?? n.valorDespesa) || 0,
			dataDocumento: dataDe(n.dataEmissao) || dataDe(n.dataReferencia),
			numeroDocumento: n.descDocumento || null,
			urlDocumento: url,
			fonte: "ALMG",
		})),
	);
}

/** Os últimos N meses (ano, mês), do mais recente ao mais antigo. */
export function ultimosMeses(agora: Date, n = MESES): { ano: number; mes: number }[] {
	return Array.from({ length: n }, (_v, i) => {
		const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
		return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
	});
}

export async function despesasAlmg(deputadoId: number, agora: Date, obter: Obter = obterPadrao): Promise<any[]> {
	const meses = ultimosMeses(agora);
	const despesas: any[] = [];
	for (let i = 0; i < meses.length; i += POR_VEZ) {
		const grupo = meses.slice(i, i + POR_VEZ).map(({ ano, mes }) => {
			const url = `${BASE_ALMG}/prestacao_contas/verbas_indenizatorias/deputados/${deputadoId}/${ano}/${mes}?formato=json`;
			return obter<any>(url).then((r) => notasDoMes(r, url));
		});
		for (const notas of await Promise.all(grupo)) despesas.push(...notas);
	}
	return despesas.sort((a, b) => b.valorDocumento - a.valorDocumento);
}

type Emissor = (tipo: string, payload: any) => void;

export async function despesasAlmgParaOPipe(nomePolitico: string, sendEvent: Emissor, agora = new Date(), obter: Obter = obterPadrao): Promise<any[]> {
	const lista = await obter<{ list?: DeputadoAlmg[] }>(`${BASE_ALMG}/deputados/em_exercicio?formato=json`);
	if (!lista) {
		sendEvent("STATUS", { msg: "[ALMG] Dados abertos da Assembleia de MG indisponíveis; despesas de gabinete não consultadas." });
		return [];
	}
	const deputado = escolherPorNome(lista.list ?? [], nomePolitico, (d) => d.nome);
	if (!deputado) {
		sendEvent("API_WARNING", {
			fonte: "Assembleia Legislativa de MG (ALMG)",
			mensagem: `"${nomePolitico}" não foi identificado(a) com segurança na lista de deputados em exercício da ALMG (nome ausente ou ambíguo).`,
		});
		return [];
	}
	const despesas = await despesasAlmg(deputado.id, agora, obter);
	sendEvent("STATUS", { msg: `[ALMG] ${despesas.length} nota(s) de verba indenizatória de ${deputado.nome} nos últimos ${MESES} meses (dados abertos da ALMG).` });
	emitirEtapa(sendEvent, despesas.length
		? { fonte: "casa", estado: "concluida", origem: "Assembleia de Minas Gerais", detalhe: `${despesas.length} ${despesas.length === 1 ? "nota" : "notas"} da verba indenizatória (${MESES} meses)` }
		: { fonte: "casa", estado: "vazia", origem: "Assembleia de Minas Gerais", detalhe: `nenhuma nota de verba indenizatória em ${MESES} meses` });
	return despesas.slice(0, 60);
}
