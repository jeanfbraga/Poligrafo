/**
 * Dados eleitorais do alvo montados pelas NOSSAS bases, sem ir ao DivulgaCand do TSE:
 * eleito (tse_eleitos, Banco de Perfil) + patrimônio declarado (tse_bens_historico, Principal).
 *
 * O DivulgaCand recusa parte das chamadas (403) e cada consulta leva segundos; antes a
 * investigação ia sempre a ele, e a tela mostrava "TSE não respondeu" mesmo com tudo na base.
 * Agora a consulta ao vivo é só reserva, quando a base não tem o eleito com CPF.
 */
import { cpfValido, soDigitos } from "@/lib/documento";
import {
	CAMPANHAS_GERAIS,
	CAMPANHAS_MUNICIPAIS,
	calcularVariacoesPatrimonio,
	normalizeString,
	type ItemHistoricoTse,
	type TseCandidateResult,
} from "@/app/api/investigar/tse";
import type { EleitoDoAlvo } from "./eleitos";
import { buscarBensHistoricoTSE, type TseBensHistorico } from "./bens";

const CARGOS_MUNICIPAIS = new Set(["11", "12", "13"]);

/** Código da eleição no TSE pelo ano (geral ou municipal); vazio se o ano não estiver na lista. */
export function idEleicaoDoAno(ano: number, cargo: string): string {
	const lista = CARGOS_MUNICIPAIS.has(cargo) ? CAMPANHAS_MUNICIPAIS : CAMPANHAS_GERAIS;
	return lista.find((c) => Number(c.ano) === ano)?.idEleicao ?? "";
}

function bensComoLista(descricao: unknown): any[] {
	return Array.isArray(descricao) ? descricao : [];
}

function historicoDosBens(bens: TseBensHistorico[], eleito: EleitoDoAlvo): ItemHistoricoTse[] {
	return bens.map((b) => ({
		ano: b.ano_eleicao,
		idEleicao: idEleicaoDoAno(b.ano_eleicao, eleito.cd_cargo),
		cargo: eleito.ds_cargo || "Candidato",
		patrimonioTotal: Number(b.valor_total) || 0,
		bensDeclarados: bensComoLista(b.descricao_bens),
		nomeCompleto: b.nome_candidato || eleito.nm_candidato,
	}));
}

function municipioDoEleito(eleito: EleitoDoAlvo): string {
	return eleito.municipio_slug || normalizeString(eleito.nm_ue || eleito.sg_uf).replace(/\s+/g, "-");
}

type BuscarBens = (cpf: string) => Promise<TseBensHistorico[]>;

/**
 * Resultado no mesmo formato do TSE ao vivo, ou null quando a base não basta (eleito não achado,
 * achado só por nome — o CPF dele não é adotado — ou sem CPF válido): aí vale a consulta ao vivo.
 * O ano do resultado é o da declaração de bens mais recente (o patrimônio mostrado é dela).
 */
export async function tseDaBase(
	eleito: EleitoDoAlvo | null | undefined,
	buscarBens: BuscarBens = buscarBensHistoricoTSE,
): Promise<TseCandidateResult | null> {
	if (!eleito || eleito.porNome || !cpfValido(eleito.nr_cpf_candidato)) return null;
	const cpf = soDigitos(eleito.nr_cpf_candidato);
	const bens = [...(await buscarBens(cpf))].sort((a, b) => b.ano_eleicao - a.ano_eleicao);
	const historico = historicoDosBens(bens, eleito);
	const atual = historico[0];
	const ano = atual?.ano ?? eleito.ano_eleicao;
	return {
		cpf,
		documentoPrincipal: cpf,
		cnpjCampanha: null,
		isCnpj: false,
		municipio: municipioDoEleito(eleito),
		idUe: eleito.sg_uf,
		nome: eleito.nm_candidato,
		nomeUrna: eleito.nm_urna_candidato,
		idTse: Number(eleito.sq_candidato),
		anoEleicao: ano,
		idEleicao: idEleicaoDoAno(ano, eleito.cd_cargo),
		patrimonioTotal: atual?.patrimonioTotal ?? 0,
		bensDeclarados: atual?.bensDeclarados ?? [],
		partido: eleito.sg_partido ?? undefined,
		historicoPatrimonio: historico,
		...calcularVariacoesPatrimonio(historico),
	};
}
