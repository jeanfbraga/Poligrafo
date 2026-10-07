/**
 * Leitura da página "Pessoal de gabinete" da Câmara (regras puras, testadas em
 * __tests__/unit/gabinete-camara.test.ts).
 *
 * Colunas da tabela: Nome | Grupo funcional | Cargo | Período de exercício | Remuneração mensal.
 * Correções de 07/10/2026:
 *  - `data_nomeacao` era a data do dia da carga ("placeholder"): agora é o
 *    início do período ("De 01/02/2023 a …", "Desde 01/03/2024") ou null;
 *  - a remuneração não era gravada: agora vai para `salario`;
 *  - linhas repetidas da mesma pessoa/grupo/período saem antes de gravar.
 * `cargo` continua sendo o grupo funcional (ex.: "Secretário Parlamentar"),
 * que é o que a tela agrupa e conta.
 */
import * as cheerio from "cheerio";

export interface ServidorGabinete {
	deputado_id: number;
	nome: string;
	cargo: string;
	periodo: string;
	data_nomeacao: string | null;
	salario: number | null;
}

/** "De 01/02/2023 a 17/02/2026" ou "Desde 01/03/2024" → "2023-02-01"; sem data → null. */
export function inicioDoPeriodo(periodo: string): string | null {
	const m = periodo.match(/(\d{2})\/(\d{2})\/(\d{4})/);
	return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "R$ 12.345,67" → 12345.67; vazio → null. */
export function valorMonetario(texto: string): number | null {
	const limpo = texto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
	if (!limpo) return null;
	const n = Number(limpo);
	return Number.isFinite(n) ? n : null;
}

function chave(s: ServidorGabinete): string {
	return `${s.nome.toUpperCase()}|${s.cargo.toUpperCase()}|${s.periodo}`;
}

export function lerTabelaGabinete(html: string, idDeputado: number): ServidorGabinete[] {
	const $ = cheerio.load(html);
	const porChave = new Map<string, ServidorGabinete>();
	$(".table tbody tr").each((_i, el) => {
		const tds = $(el).find("td").map((_j, td) => $(td).text().replace(/\s+/g, " ").trim()).get();
		if (tds.length < 4 || !tds[0]) return;
		const servidor: ServidorGabinete = {
			deputado_id: idDeputado,
			nome: tds[0],
			cargo: tds[1],
			periodo: tds[3],
			data_nomeacao: inicioDoPeriodo(tds[3]),
			salario: valorMonetario(tds[4] ?? ""),
		};
		if (!porChave.has(chave(servidor))) porChave.set(chave(servidor), servidor);
	});
	return [...porChave.values()];
}
