/**
 * Regras puras do ETL de despesas de gabinete da ALERJ pelo DOCIGP (testadas em
 * __tests__/unit/alerj-docigp.test.ts).
 *
 * API do portal (descoberta no JavaScript da própria tela, 07/10/2026):
 *   /api/v1/congressmen?page=N                                  → deputados (has_mandate)
 *   /api/v1/congressmen/{id}/legislatures/{leg}/budgets?page=N  → orçamentos mensais, com
 *                                                                 os lançamentos embutidos (entries)
 * A legislatura 2 é a atual (2023–2027). Antes, as despesas vinham de um robô
 * de navegador (Playwright), lento e que não roda na Vercel.
 *
 * Fica só o que é gasto: lançamento com valor negativo (débito); crédito,
 * depósito e transporte de saldo saem. Chave: o id do lançamento no DOCIGP.
 */
import { soDigitos } from "../../src/lib/documento";

export const LEGISLATURA_ATUAL = 2;

export interface DespesaAlerj {
	lancamento_id: number;
	deputado_id: number;
	deputado: string;
	ano: number;
	mes: number;
	data: string | null;
	valor: number;
	objeto: string;
	centro_custo: string;
	documento: string;
	fornecedor: string;
	numero_documento: string;
	qtd_documentos: number;
}

/** "31/01/2023" → "2023-01-31". */
export function dataIsoBr(s: unknown): string | null {
	const m = String(s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function texto(v: unknown): string {
	return String(v ?? "").trim();
}

export function lerLancamento(e: any, deputado: { id: number; nome: string }, orcamento: any): DespesaAlerj | null {
	const valor = Number(e?.value);
	if (!e?.id || !Number.isFinite(valor) || valor >= 0 || e.is_transport_or_credit) return null;
	return {
		lancamento_id: Number(e.id),
		deputado_id: deputado.id,
		deputado: deputado.nome,
		ano: Number(orcamento?.year),
		mes: Number(orcamento?.month),
		data: dataIsoBr(e.date),
		valor: Math.round(Math.abs(valor) * 100) / 100,
		objeto: texto(e.object),
		centro_custo: texto(e.cost_center_name),
		documento: soDigitos(e.provider_cpf_cnpj ?? e.cpf_cnpj),
		fornecedor: texto(e.provider_name ?? e.name),
		numero_documento: texto(e.document_number),
		qtd_documentos: Number(e.documents_count) || 0,
	};
}

/** Lançamentos de uma página de orçamentos (cada orçamento traz os seus `entries`). */
export function lancamentosDosOrcamentos(orcamentos: any[], deputado: { id: number; nome: string }): DespesaAlerj[] {
	return (orcamentos ?? []).flatMap((o) =>
		(Array.isArray(o?.entries) ? o.entries : []).map((e: any) => lerLancamento(e, deputado, o)).filter((d: DespesaAlerj | null): d is DespesaAlerj => d !== null),
	);
}

/** Nome usado para achar o deputado: "Nome Civil (Apelido)". */
export function nomeDoDeputado(c: { name?: string; nickname?: string }): string {
	const nome = texto(c.name);
	const apelido = texto(c.nickname);
	return apelido && apelido.toUpperCase() !== nome.toUpperCase() ? `${nome} (${apelido})` : nome || apelido;
}
