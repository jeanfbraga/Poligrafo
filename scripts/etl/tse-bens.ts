/**
 * Regras puras do ETL tse_bens (BANCO DE PERFIL), testadas em __tests__/unit/tse-bens-etl.test.ts.
 *
 * Bens declarados (bem_candidato_{ano}.zip do TSE) só de quem está na janela de mandato e dos
 * presidentes: a declaração da própria eleição (pelo número do candidato — prefeitos e vereadores
 * de 2024 sem CPF também entram) e as de outras eleições da mesma pessoa pelo CPF (variação
 * patrimonial: deputado de 2022 que concorreu em 2018 ou em 2026).
 */
import { parseItemBem } from "./tse-arquivos";

/**
 * Bem como fica gravado (chaves curtas: 306 mil bens, ~9 MB a menos no Banco de Perfil).
 * A leitura (src/services/integrations/tse/bens.ts) devolve { tipoBem, descricao, valor }.
 */
export interface BemDeclarado {
	t: string;
	d: string;
	v: number;
}

/** Quem é dono do número do candidato no ano (vem da base de eleitos ou do arquivo de candidatos). */
export interface DonoDoSq {
	cpf: string | null;
	nome: string;
	cd_cargo: string | null;
	sg_uf: string | null;
}

export interface LinhaBens extends DonoDoSq {
	sq_candidato: string;
	ano_eleicao: number;
	valor_total: number;
	bens: BemDeclarado[];
}

/** Eleições com arquivo de bens: as chapas presidenciais (2006 em diante) e as da janela. */
export const ANOS_BENS = [2006, 2010, 2014, 2018, 2022, 2024, 2026];

/** Eleições gerais em que se procura a declaração da mesma pessoa pelo CPF (variação). */
export const ANOS_PELO_CPF = [2018, 2022, 2026];

/** Descrição até este tamanho: o texto completo de alguns bens passava de 1 KB e não muda a leitura. */
export const LIMITE_DESCRICAO = 200;

/** Junta os bens de cada número de candidato que interessa. */
export function agruparBens(linhasCsv: Record<string, string>[], donos: Map<string, DonoDoSq>, ano: number): LinhaBens[] {
	const porSq = new Map<string, LinhaBens>();
	for (const r of linhasCsv) {
		const lido = parseItemBem(r);
		const dono = lido ? donos.get(String(lido.sqCandidato)) : undefined;
		if (!lido || !dono) continue;
		const atual = porSq.get(lido.sqCandidato) ?? { sq_candidato: lido.sqCandidato, ano_eleicao: ano, ...dono, valor_total: 0, bens: [] };
		atual.bens.push({ t: lido.item.tipoBem, d: String(lido.item.descricao).slice(0, LIMITE_DESCRICAO), v: lido.valor });
		atual.valor_total = Math.round((atual.valor_total + lido.valor) * 100) / 100;
		porSq.set(lido.sqCandidato, atual);
	}
	return [...porSq.values()].map((l) => ({ ...l, bens: [...l.bens].sort((a, b) => b.v - a.v) }));
}

export interface BensNaBase {
	sq_candidato: string;
	ano_eleicao: number;
	valor_total: number | string;
	cpf: string | null;
}

const chave = (sq: string, ano: number) => `${sq}:${ano}`;

/** Só o que é novo ou mudou (total declarado ou CPF): regravar tudo deixa linhas mortas no banco. */
export function bensQueMudaram(novos: LinhaBens[], naBase: BensNaBase[]): LinhaBens[] {
	const base = new Map(naBase.map((b) => [chave(b.sq_candidato, b.ano_eleicao), b]));
	return novos.filter((l) => {
		const atual = base.get(chave(l.sq_candidato, l.ano_eleicao));
		return !atual || Number(atual.valor_total) !== l.valor_total || (atual.cpf ?? null) !== (l.cpf ?? null);
	});
}

/** Abaixo disso, sair de uma vez indica carga incompleta: nada é apagado. */
export const LIMITE_SAIDA_BENS = 0.2;

/**
 * Quem estava na base e não está mais na janela (fim de mandato, troca de período): sai.
 * null = saída grande demais para uma carga normal (arquivo ou base de eleitos com defeito).
 * Na troca de período (fev/2027) a saída é grande de verdade: aí roda com --troca-de-periodo.
 */
export function bensQueSairam(naBase: BensNaBase[], novos: LinhaBens[], trocaDePeriodo = false): BensNaBase[] | null {
	const atuais = new Set(novos.map((l) => chave(l.sq_candidato, l.ano_eleicao)));
	const sairam = naBase.filter((b) => !atuais.has(chave(b.sq_candidato, b.ano_eleicao)));
	if (trocaDePeriodo || naBase.length === 0) return sairam;
	return sairam.length / naBase.length > LIMITE_SAIDA_BENS ? null : sairam;
}
