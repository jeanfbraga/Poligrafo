/**
 * Despesas de gabinete da ALESP pela base `alesp_despesas` (Banco de Perfil),
 * carregada por scripts/etl/alesp-despesas-sync.ts. Antes, cada investigação
 * lia ao vivo o XML de ~172 MB (ordenado por nome: até 48 s por deputado).
 *
 * O deputado é achado pelo nome na visão `alesp_deputados` (138 nomes). Nome
 * ambíguo não escolhe ninguém. Base fora do ar: null (o pipe usa o XML ao vivo).
 */
import { escolherPorNome, nomesBatem } from "@/lib/nome-parlamentar";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export const URL_XML_ALESP = "https://www.al.sp.gov.br/repositorioDados/deputados/despesas_gabinetes.xml";

export interface DeputadoAlesp {
	matricula: string;
	deputado: string;
	ultimo_ano: number;
}

type ClienteSupabase = Pick<typeof supabasePerfilAdmin, "from">;

/** Mesmo critério da leitura ao vivo (src/lib/nome-parlamentar.ts). */
export const nomesBatemAlesp = nomesBatem;

/** Um deputado só: o nome exato, ou o único que bate; ambíguo = nenhum. */
export function escolherDeputado(lista: DeputadoAlesp[], nome: string): DeputadoAlesp | null {
	return escolherPorNome(lista, nome, (d) => d.deputado);
}

function paraDespesa(r: Record<string, any>) {
	return {
		cnpjCpfFornecedor: String(r.documento ?? ""),
		nomeFornecedor: r.fornecedor || "Fornecedor ALESP",
		tipoDespesa: r.tipo || "Verba Indenizatória / Gabinete",
		valorDocumento: Number(r.valor) || 0,
		// Mês da despesa (a ALESP publica por mês, sem dia).
		dataDocumento: `${r.ano}-${String(r.mes).padStart(2, "0")}-01`,
		quantidade: Number(r.quantidade) || 1,
		urlDocumento: URL_XML_ALESP,
		fonte: "ALESP",
	};
}

let avisou = false;
export function reiniciarAvisoAlesp() {
	avisou = false;
}

function avisar(mensagem: string) {
	if (!avisou) console.warn(`[ALESP] Base indisponível (${mensagem}); usando o XML ao vivo.`);
	avisou = true;
}

/**
 * Despesas do deputado desde `anoMinimo`, do maior valor ao menor.
 * null = base indisponível; [] = deputado não achado (ou ambíguo) ou sem despesas.
 */
export async function buscarDespesasAlespDaBase(
	nomePolitico: string,
	anoMinimo: number,
	cliente: ClienteSupabase = supabasePerfilAdmin,
): Promise<{ despesas: ReturnType<typeof paraDespesa>[]; deputado: DeputadoAlesp | null } | null> {
	const lista = await cliente.from("alesp_deputados").select("matricula,deputado,ultimo_ano");
	if (lista.error) {
		avisar(lista.error.message);
		return null;
	}
	const deputado = escolherDeputado((lista.data ?? []) as DeputadoAlesp[], nomePolitico);
	if (!deputado) return { despesas: [], deputado: null };
	const r = await cliente
		.from("alesp_despesas")
		.select("documento,fornecedor,tipo,valor,ano,mes,quantidade")
		.eq("matricula", deputado.matricula)
		.gte("ano", anoMinimo)
		.order("valor", { ascending: false })
		.limit(300);
	if (r.error) {
		avisar(r.error.message);
		return null;
	}
	return { despesas: (r.data ?? []).map(paraDespesa), deputado };
}
