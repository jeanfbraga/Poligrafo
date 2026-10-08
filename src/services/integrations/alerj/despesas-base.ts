/**
 * Despesas de gabinete da ALERJ (verba de gabinete do DOCIGP) pela base
 * `alerj_despesas` (Banco de Perfil), carregada por scripts/etl/alerj-docigp-sync.ts.
 *
 * Antes: o pipe não trazia despesa nenhuma do deputado do RJ (só um nó
 * "ALERJ" para abrir o robô de navegador à mão, que não roda na Vercel).
 */
import { escolherPorNome } from "@/lib/nome-parlamentar";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";

export const URL_DOCIGP = "https://docigp.alerj.rj.gov.br/transparencia";

export interface DeputadoAlerj {
	deputado_id: number;
	deputado: string;
	ultimo_ano: number;
}

type ClienteSupabase = Pick<typeof supabasePerfilAdmin, "from">;

function paraDespesa(r: Record<string, any>) {
	return {
		cnpjCpfFornecedor: String(r.documento ?? ""),
		nomeFornecedor: r.fornecedor || "Fornecedor ALERJ",
		tipoDespesa: r.centro_custo || r.objeto || "Verba de Gabinete DOCIGP",
		descricao: r.objeto || null,
		valorDocumento: Number(r.valor) || 0,
		dataDocumento: r.data || `${r.ano}-${String(r.mes).padStart(2, "0")}-01`,
		numeroDocumento: r.numero_documento || null,
		urlDocumento: URL_DOCIGP,
		fonte: "ALERJ — DOCIGP",
	};
}

let avisou = false;
export function reiniciarAvisoAlerj() {
	avisou = false;
}
function avisar(mensagem: string) {
	if (!avisou) console.warn(`[ALERJ] Base indisponível (${mensagem}).`);
	avisou = true;
}

/** null = base indisponível; deputado null = nome ausente ou ambíguo. */
export async function buscarDespesasAlerjDaBase(
	nomePolitico: string,
	anoMinimo: number,
	cliente: ClienteSupabase = supabasePerfilAdmin,
): Promise<{ despesas: ReturnType<typeof paraDespesa>[]; deputado: DeputadoAlerj | null } | null> {
	const lista = await cliente.from("alerj_deputados").select("deputado_id,deputado,ultimo_ano");
	if (lista.error) {
		avisar(lista.error.message);
		return null;
	}
	const deputado = escolherPorNome((lista.data ?? []) as DeputadoAlerj[], nomePolitico, (d) => d.deputado);
	if (!deputado) return { despesas: [], deputado: null };
	const r = await cliente
		.from("alerj_despesas")
		.select("documento,fornecedor,centro_custo,objeto,valor,data,ano,mes,numero_documento")
		.eq("deputado_id", deputado.deputado_id)
		.gte("ano", anoMinimo)
		.order("valor", { ascending: false })
		.limit(300);
	if (r.error) {
		avisar(r.error.message);
		return null;
	}
	return { despesas: (r.data ?? []).map(paraDespesa), deputado };
}

type Emissor = (tipo: string, payload: any) => void;

/** Para o pipe: as 60 maiores dos últimos 2 anos, com o log de onde vieram. */
export async function despesasAlerjParaOPipe(
	nomePolitico: string,
	sendEvent: Emissor,
	agora = new Date(),
	buscar: typeof buscarDespesasAlerjDaBase = buscarDespesasAlerjDaBase,
): Promise<any[]> {
	const anoMinimo = agora.getFullYear() - 1;
	const r = await buscar(nomePolitico, anoMinimo).catch(() => null);
	if (!r) {
		sendEvent("STATUS", { msg: "[ALERJ] Base de despesas do DOCIGP indisponível; despesas de gabinete não consultadas." });
		return [];
	}
	if (!r.deputado) {
		sendEvent("API_WARNING", {
			fonte: "Assembleia Legislativa do RJ (ALERJ — DOCIGP)",
			mensagem: `"${nomePolitico}" não foi identificado(a) com segurança na lista de deputados do DOCIGP (nome ausente ou ambíguo).`,
		});
		return [];
	}
	sendEvent("STATUS", {
		msg: `[ALERJ] ${r.despesas.length} despesa(s) de gabinete de ${r.deputado.deputado} desde ${anoMinimo}, pela base do DOCIGP.`,
	});
	return r.despesas.slice(0, 60);
}
