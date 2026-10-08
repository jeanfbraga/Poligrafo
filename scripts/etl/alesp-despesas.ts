/**
 * Regras puras do ETL de despesas de gabinete da ALESP (testadas em
 * __tests__/unit/alesp-despesas.test.ts).
 *
 * Fonte: https://www.al.sp.gov.br/repositorioDados/deputados/despesas_gabinetes.xml
 * (~172 MB, desde 2015, atualizado todo dia, ordenado por NOME de deputado —
 * por isso a leitura ao vivo de um deputado com nome no fim do alfabeto lia o
 * arquivo inteiro). Cada <despesa>: Ano, Matricula, Mes, Valor, CNPJ (ou CPF),
 * Deputado, Tipo, Fornecedor.
 *
 * Fica só a legislatura atual (ANO_MINIMO em diante), agregado por deputado +
 * ano + mês + tipo + documento: o mesmo lançamento repetido soma valor e
 * quantidade, e o upsert por essa chave nunca duplica.
 */
import { soDigitos } from "../../src/lib/documento";

export const ANO_MINIMO = 2023;

export interface DespesaAlesp {
	matricula: string;
	deputado: string;
	ano: number;
	mes: number;
	tipo: string;
	fornecedor: string;
	documento: string;
	valor: number;
	quantidade: number;
}

function tag(bloco: string, nome: string): string {
	const m = bloco.match(new RegExp(`<${nome}>([^<]*)</${nome}>`));
	return (m?.[1] ?? "").trim();
}

function decodificarEntidades(s: string): string {
	return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Um bloco <despesa>…</despesa> → registro, ou null se faltar o essencial ou for antigo. */
export function lerDespesa(bloco: string, anoMinimo = ANO_MINIMO): DespesaAlesp | null {
	const ano = Number(tag(bloco, "Ano"));
	const mes = Number(tag(bloco, "Mes"));
	const matricula = tag(bloco, "Matricula");
	const deputado = decodificarEntidades(tag(bloco, "Deputado"));
	if (!ano || ano < anoMinimo || !mes || !matricula || !deputado) return null;
	return {
		matricula,
		deputado,
		ano,
		mes,
		tipo: decodificarEntidades(tag(bloco, "Tipo")) || "NÃO INFORMADO",
		fornecedor: decodificarEntidades(tag(bloco, "Fornecedor")),
		documento: soDigitos(tag(bloco, "CNPJ")),
		valor: Number(tag(bloco, "Valor")) || 0,
		quantidade: 1,
	};
}

/** Separa os blocos <despesa> de um pedaço de texto; devolve os blocos e o resto (incompleto). */
export function separarBlocos(buffer: string): { blocos: string[]; resto: string } {
	const blocos: string[] = [];
	let resto = buffer;
	let fim = resto.indexOf("</despesa>");
	while (fim !== -1) {
		blocos.push(resto.slice(0, fim + 10));
		resto = resto.slice(fim + 10);
		fim = resto.indexOf("</despesa>");
	}
	return { blocos, resto };
}

export function chave(d: DespesaAlesp): string {
	return [d.matricula, d.ano, d.mes, d.tipo, d.documento].join("|");
}

export class AgregadorAlesp {
	private readonly porChave = new Map<string, DespesaAlesp>();

	adicionar(d: DespesaAlesp | null): void {
		if (!d) return;
		const atual = this.porChave.get(chave(d));
		if (!atual) {
			this.porChave.set(chave(d), { ...d });
			return;
		}
		atual.valor = Math.round((atual.valor + d.valor) * 100) / 100;
		atual.quantidade += 1;
	}

	linhas(): DespesaAlesp[] {
		return [...this.porChave.values()];
	}
}
