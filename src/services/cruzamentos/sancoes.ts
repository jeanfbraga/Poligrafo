/**
 * Fatos SANCIONADO: consulta CEIS/CNEP/CEPIM só para os CNPJs que já
 * aparecem em algum papel (empresa do político, doador, fornecedor da cota,
 * contratado do ente, beneficiário de emenda), em ordem de importância e com
 * limite — o Portal da Transparência aceita ~80 consultas por minuto e cada
 * CNPJ custa 3. Antes, sanção só era checada para despesa com nota ≥ 85 da IA.
 */
import { soDigitos } from "@/lib/documento";
import { buscarSancoesEmpresa, type SancaoEmpresa } from "@/services/integrations/transparencia/sancoes-empresa";
import { dataIso } from "./datas";
import type { Fato, Papel } from "./tipos";

const PRIORIDADE: Papel[] = ["EMPRESA_DO_POLITICO", "DOADOR", "FORNECEDOR_COTA", "CONTRATADO_ENTE", "BENEFICIARIO_EMENDA"];
export const LIMITE_CNPJS_SANCOES = 10;

type BuscarSancoes = (cnpj: string) => Promise<SancaoEmpresa[]>;

/** CNPJs a conferir: por papel (ordem acima) e, dentro do papel, pelo valor somado. */
export function cnpjsParaConferir(fatos: Fato[], limite = LIMITE_CNPJS_SANCOES): string[] {
	const total = new Map<string, number>();
	for (const f of fatos) total.set(f.documento, (total.get(f.documento) ?? 0) + (f.valor ?? 0));
	const ordenados = PRIORIDADE.flatMap((papel) =>
		[...new Set(fatos.filter((f) => f.papel === papel && f.documento.length === 14).map((f) => f.documento))]
			.sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0)),
	);
	return [...new Set(ordenados)].slice(0, limite);
}

function texto(v: unknown): string {
	if (v && typeof v === "object") {
		const o = v as Record<string, unknown>;
		return String(o.descricaoResumida ?? o.descricaoPortal ?? o.nome ?? "");
	}
	return String(v ?? "");
}

function periodo(r: Record<string, any>): string {
	const fim = r.dataFimSancao || r.dataFinalSancao;
	const inicio = r.dataInicioSancao || r.dataPublicacao;
	return [inicio && `desde ${inicio}`, fim && `até ${fim}`].filter(Boolean).join(" ");
}

/** Vigência em ISO para comparar com a data dos contratos (regra contratoDuranteSancao). */
function periodoDaSancao(r: Record<string, any>): { inicio: string | null; fim: string | null } {
	return { inicio: dataIso(r.dataInicioSancao || r.dataPublicacao), fim: dataIso(r.dataFimSancao || r.dataFinalSancao) };
}

export function sancaoParaFato(cnpj: string, s: SancaoEmpresa, i: number, coletadoEm: string): Fato {
	const r = (s.registro ?? {}) as Record<string, any>;
	const sancionado = r.sancionado || r.pessoaSancionada || {};
	const tipo = texto(r.tipoSancao || r.tipoPenalidade);
	const orgao = texto(r.orgaoSancionador);
	return {
		id: `fato-sancionado-${cnpj}-${s.base}-${i}`,
		papel: "SANCIONADO",
		documento: cnpj,
		nome: String(sancionado.nome || sancionado.razaoSocialReceita || ""),
		data: r.dataInicioSancao || undefined,
		periodo: periodoDaSancao(r),
		detalhe: [s.nomeBase, tipo, orgao && `órgão: ${orgao}`, periodo(r)].filter(Boolean).join(" — "),
		procedencia: {
			fonte: `Portal da Transparência — ${s.base.toUpperCase()}`,
			chave: `cnpj=${cnpj}`,
			coletadoEm,
			url: `https://portaldatransparencia.gov.br/busca?termo=${cnpj}`,
		},
	};
}

export async function fatosDeSancoes(
	fatos: Fato[],
	coletadoEm: string,
	buscar: BuscarSancoes = (cnpj) => buscarSancoesEmpresa(cnpj),
	limite = LIMITE_CNPJS_SANCOES,
): Promise<Fato[]> {
	const cnpjs = cnpjsParaConferir(fatos, limite);
	const resultados = await Promise.allSettled(cnpjs.map((c) => buscar(soDigitos(c))));
	return resultados.flatMap((r, k) =>
		r.status === "fulfilled" ? r.value.map((s, i) => sancaoParaFato(cnpjs[k], s, i, coletadoEm)) : [],
	);
}
