/**
 * Regras puras do ETL de contas de campanha (testadas em
 * __tests__/unit/tse-contas-campanha.test.ts). Ver nota 31 do Obsidian, §3.6.
 *
 * Do `prestacao_de_contas_eleitorais_candidatos_{ano}.zip` do TSE ficam, só
 * para os ELEITOS (sq_candidato da base tse_eleitos):
 *  - DOADOR: receitas de pessoas físicas e pela internet. Desde 2015 (STF,
 *    ADI 4650) empresa não doa; recursos próprios, de partido e de outros
 *    candidatos trazem o CNPJ do partido/comitê e só gerariam ruído;
 *  - FORNECEDOR: despesas contratadas pela campanha (CNPJ ou CPF).
 * Agregado por candidato + papel + documento (soma e quantidade).
 */
import { cnpjValido, cpfValido, soDigitos } from "../../src/lib/documento";

export type TipoConta = "DOADOR" | "FORNECEDOR";

export interface LinhaConta {
	sq_candidato: string;
	ano_eleicao: number;
	tipo: TipoConta;
	documento: string;
	nome: string;
	valor_total: number;
	quantidade: number;
	/** Origem da receita ou tipo de despesa mais frequente. */
	origem: string | null;
}

const ORIGENS_DOADOR = new Set(["recursos de pessoas fisicas", "doacoes pela internet"]);

function semAcento(texto: string): string {
	return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "1.234,56" ou "1234,56" → 1234.56 */
export function valorBr(texto: unknown): number {
	const n = Number(String(texto ?? "").replace(/\./g, "").replace(",", "."));
	return Number.isFinite(n) ? n : 0;
}

function documentoValido(valor: unknown): string | null {
	const d = soDigitos(valor);
	return cpfValido(d) || cnpjValido(d) ? d : null;
}

function texto(v: unknown): string {
	const s = String(v ?? "").trim();
	return s === "#NULO#" || s === "#NE#" || s === "-1" ? "" : s;
}

interface Registro {
	sq: string;
	documento: string;
	nome: string;
	valor: number;
	origem: string;
}

/** Linha de receitas → doação que interessa (ou null). O próprio candidato nunca é doador. */
export function receitaParaRegistro(r: Record<string, string>): Registro | null {
	const origem = texto(r.DS_ORIGEM_RECEITA);
	const documento = documentoValido(r.NR_CPF_CNPJ_DOADOR);
	if (!ORIGENS_DOADOR.has(semAcento(origem)) || !documento || documento === soDigitos(r.NR_CPF_CANDIDATO)) return null;
	return { sq: texto(r.SQ_CANDIDATO), documento, nome: texto(r.NM_DOADOR_RFB) || texto(r.NM_DOADOR), valor: valorBr(r.VR_RECEITA), origem };
}

/**
 * Só quem foi ELEITO entra nas contas. No TSE todo não eleito de lista
 * proporcional com voto é "SUPLENTE": com eles, 2022 dava 16 mil candidatos e
 * ~233 MB (medição de 06/10/2026). Suplentes seguem na base tse_eleitos.
 */
export function ehEleito(situacao: string | null | undefined): boolean {
	return semAcento(String(situacao ?? "")).startsWith("eleito");
}

/**
 * Linha de despesas contratadas → fornecedor da campanha (ou null). Só CNPJ:
 * fornecedor pessoa física é, quase sempre, cabo eleitoral ou pessoal de
 * campanha (~900 mil CPFs em 2022) — não cruza com nada e pesa na LGPD.
 */
export function despesaParaRegistro(r: Record<string, string>): Registro | null {
	const documento = documentoValido(r.NR_CPF_CNPJ_FORNECEDOR);
	if (!documento || documento.length !== 14) return null;
	return {
		sq: texto(r.SQ_CANDIDATO),
		documento,
		nome: texto(r.NM_FORNECEDOR_RFB) || texto(r.NM_FORNECEDOR),
		valor: valorBr(r.VR_DESPESA_CONTRATADA),
		origem: texto(r.DS_ORIGEM_DESPESA),
	};
}

interface Acumulado {
	linha: LinhaConta;
	origens: Map<string, number>;
}

/** Soma por candidato + papel + documento, só para os eleitos. */
export class AgregadorContas {
	private readonly porChave = new Map<string, Acumulado>();
	public descartadosNaoEleitos = 0;

	constructor(
		private readonly ano: number,
		private readonly eleitos: Set<string>,
	) {}

	adicionar(tipo: TipoConta, reg: Registro | null): void {
		if (!reg) return;
		if (!this.eleitos.has(reg.sq)) {
			this.descartadosNaoEleitos++;
			return;
		}
		const chave = `${reg.sq}|${tipo}|${reg.documento}`;
		const atual = this.porChave.get(chave) ?? {
			linha: { sq_candidato: reg.sq, ano_eleicao: this.ano, tipo, documento: reg.documento, nome: reg.nome, valor_total: 0, quantidade: 0, origem: null },
			origens: new Map<string, number>(),
		};
		atual.linha.valor_total = Math.round((atual.linha.valor_total + reg.valor) * 100) / 100;
		atual.linha.quantidade++;
		if (reg.origem) atual.origens.set(reg.origem, (atual.origens.get(reg.origem) ?? 0) + 1);
		this.porChave.set(chave, atual);
	}

	linhas(): LinhaConta[] {
		return [...this.porChave.values()].map(({ linha, origens }) => ({
			...linha,
			origem: [...origens.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
		}));
	}
}

/** Estimativa grosseira de espaço no Postgres (linha + índices), para decidir antes de gravar. */
export function estimarMb(linhas: LinhaConta[]): number {
	const bytes = linhas.reduce((s, l) => s + 120 + l.nome.length + (l.origem?.length ?? 0) + l.documento.length * 3, 0);
	return Math.round((bytes / 1024 / 1024) * 10) / 10;
}
