/**
 * Cota parlamentar inteira no motor de cruzamentos (decisão do dono, 08/10/2026).
 *
 * Antes, só os fornecedores das 60 notas de maior valor viravam fatos FORNECEDOR_COTA.
 * Agora cada linha da cota agrupada (parlamentar + ano + fornecedor + tipo, 4 anos)
 * vira um fato: doador, empresa do político, empresa punida e empresa de funcionário
 * do gabinete passam a ser conferidos contra TODOS os fornecedores do mandato.
 */
import { documentoOuNulo } from "@/lib/documento";
import type { AlvoCota, FornecedorDaCota } from "@/services/integrations/camara/cota-agrupada";
import type { Fato } from "./tipos";

const NOME_CASA: Record<AlvoCota["casa"], string> = { CAMARA: "Câmara dos Deputados", SENADO: "Senado Federal" };
const PAGINA_CASA: Record<AlvoCota["casa"], string> = {
	CAMARA: "https://www.camara.leg.br/cota-parlamentar/",
	SENADO: "https://www12.senado.leg.br/transparencia/sen/",
};

/** Deputado federal ou senador (pelo id da casa); as outras casas não têm a CEAP. */
export function alvoDaCota(d: { casa?: unknown; id?: unknown } | null | undefined): AlvoCota | null {
	const casa = String(d?.casa ?? "");
	const id = Number(d?.id);
	if (!(id > 0)) return null;
	return casa === "CAMARA" || casa === "SENADO" ? { casa, id } : null;
}

function plural(n: number, singular: string, varias: string): string {
	return `${n} ${n === 1 ? singular : varias}`;
}

export function fatosDaCotaAgrupada(linhas: FornecedorDaCota[], coletadoEm: string): Fato[] {
	return linhas.flatMap((l, i) => {
		const documento = documentoOuNulo(l.documento);
		if (!documento) return [];
		return [{
			id: `fato-fornecedor_cota-${documento}-agrupada-${l.ano}-${i}`,
			papel: "FORNECEDOR_COTA" as const,
			documento,
			nome: l.fornecedor ?? "",
			valor: l.valor_total || undefined,
			data: l.primeira_data ?? String(l.ano),
			periodo: { inicio: l.primeira_data, fim: l.ultima_data },
			detalhe: `${l.tipo_despesa} — ${plural(l.notas, "nota", "notas")} em ${l.ano}`,
			procedencia: {
				fonte: `${NOME_CASA[l.casa]} — cota parlamentar ${l.ano} (todas as notas, agrupadas por fornecedor)`,
				chave: `parlamentar=${l.id_parlamentar}; ano=${l.ano}`,
				coletadoEm,
				url: PAGINA_CASA[l.casa],
			},
		}];
	});
}

/** "312 fornecedores da cota em 4 anos (2023–2026)". */
export function resumoDaCotaAgrupada(linhas: FornecedorDaCota[]): string {
	const fornecedores = new Set(linhas.map((l) => l.documento)).size;
	const anos = [...new Set(linhas.map((l) => l.ano))].sort();
	const periodo = anos.length > 1 ? `${anos[0]}–${anos.at(-1)}` : String(anos[0] ?? "");
	return `${plural(fornecedores, "fornecedor", "fornecedores")} da cota em ${plural(anos.length, "ano", "anos")} (${periodo})`;
}
