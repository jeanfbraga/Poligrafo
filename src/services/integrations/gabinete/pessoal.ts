/**
 * Quem trabalha no gabinete do político, para os cruzamentos (services/cruzamentos/gabinete.ts).
 *
 *  - Câmara dos Deputados: Banco de Perfil, `camara_servidores_gabinete` (sync do perfil).
 *  - CMRJ: Banco Principal, `cmrj_vereador_gabinete` (nome de urna → nº do gabinete) e
 *    `cmrj_servidores` (lotação "Gabinete Parlamentar Nº XX").
 *
 * Também traz os eleitos da UF com o mesmo nome (Banco de Perfil, `tse_eleitos`) e em
 * quantos gabinetes da casa cada um desses nomes aparece (filtro de homônimo).
 * Base fora do ar vira `null` com um aviso no log; o dossiê segue sem os cruzamentos de assessor.
 */
import { escolherPorNome } from "@/lib/nome-parlamentar";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabasePerfilAdmin } from "@/lib/supabase-perfil";
import { normalizarNome } from "@/services/core/socio-confirmacao";
import {
	type AlvoGabinete,
	type AssessorGabinete,
	type CasaComGabinete,
	type DadosGabinete,
	type EleitoHomonimo,
	nomesParaConferirNoTse,
} from "@/services/cruzamentos/gabinete";

export interface LinhaEleito {
	sq_candidato: string;
	nr_cpf_candidato: string | null;
	nm_candidato: string;
	ds_cargo: string;
	ano_eleicao: number;
	nm_ue: string | null;
	sg_uf: string;
	ds_sit_tot_turno: string | null;
}

/** As consultas aos bancos (injetáveis nos testes). Cada uma lança erro se o banco falhar. */
export interface ConsultasGabinete {
	gabineteCamara(deputadoId: number): Promise<{ nome: string; cargo: string | null; periodo: string | null }[]>;
	gabinetesCmrj(): Promise<{ nome_urna: string; gabinete_numero: string }[]>;
	servidoresCmrj(lotacao: string): Promise<{ nome: string; cargo: string | null; data_ingresso: string | null }[]>;
	/** `nomes` já normalizados (maiúsculas, sem acento). */
	eleitosPorNomes(nomes: string[], uf: string): Promise<LinhaEleito[]>;
	/** Nomes como a casa grava; devolve um par (nome, gabinete) por linha. */
	gabinetesPorNomes(casa: CasaComGabinete, nomes: string[]): Promise<{ nome: string; gabinete: string }[]>;
}

function dados<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
	if (r.error) throw new Error(r.error.message);
	return r.data ?? [];
}

/** O TSE guarda `nomes_busca` = "nome civil | nome de urna", minúsculo e sem acento. */
function filtroNomesBusca(nomes: string[]): string {
	return nomes.map((n) => `nomes_busca.like."${n.toLowerCase()}*"`).join(",");
}

const LOTE_NOMES = 25;

function lotes<T>(lista: T[], tamanho: number): T[][] {
	return Array.from({ length: Math.ceil(lista.length / tamanho) }, (_, i) => lista.slice(i * tamanho, (i + 1) * tamanho));
}

export const consultasSupabase: ConsultasGabinete = {
	async gabineteCamara(deputadoId) {
		return dados(await supabasePerfilAdmin.from("camara_servidores_gabinete").select("nome, cargo, periodo").eq("deputado_id", deputadoId).limit(2000));
	},
	async gabinetesCmrj() {
		return dados(await supabaseAdmin.from("cmrj_vereador_gabinete").select("nome_urna, gabinete_numero"));
	},
	async servidoresCmrj(lotacao) {
		return dados(await supabaseAdmin.from("cmrj_servidores").select("nome, cargo, data_ingresso").eq("lotacao", lotacao).limit(2000));
	},
	async eleitosPorNomes(nomes, uf) {
		const respostas = await Promise.all(lotes(nomes, LOTE_NOMES).map((lote) =>
			supabasePerfilAdmin
				.from("tse_eleitos")
				.select("sq_candidato, nr_cpf_candidato, nm_candidato, ds_cargo, ano_eleicao, nm_ue, sg_uf, ds_sit_tot_turno")
				.eq("sg_uf", uf)
				.in("ano_eleicao", [2022, 2024])
				.or(filtroNomesBusca(lote))
				.limit(1000),
		));
		return respostas.flatMap((r) => dados(r as { data: LinhaEleito[] | null; error: { message: string } | null }));
	},
	async gabinetesPorNomes(casa, nomes) {
		if (casa === "CAMARA") {
			const linhas = dados(await supabasePerfilAdmin.from("camara_servidores_gabinete").select("nome, deputado_id").in("nome", nomes).limit(5000));
			return linhas.map((l) => ({ nome: String(l.nome), gabinete: String(l.deputado_id) }));
		}
		const linhas = dados(await supabaseAdmin.from("cmrj_servidores").select("nome, lotacao").in("nome", nomes).limit(5000));
		return linhas.map((l) => ({ nome: String(l.nome), gabinete: String(l.lotacao) }));
	},
};

type BaseGabinete = Pick<DadosGabinete, "alvo" | "fonte" | "url" | "assessores">;

function assessor(nome: unknown, cargo: unknown, periodo: string): AssessorGabinete {
	return { nome: String(nome ?? "").trim(), cargo: String(cargo ?? "").trim(), periodo };
}

async function gabineteDaCamara(alvo: AlvoGabinete, c: ConsultasGabinete): Promise<BaseGabinete | null> {
	const linhas = await c.gabineteCamara(Number(alvo.id));
	if (linhas.length === 0) {
		console.warn(`[GABINETE] Nenhum funcionário do gabinete do deputado ${alvo.id} na base (camara_servidores_gabinete).`);
		return null;
	}
	return {
		alvo,
		fonte: "Câmara dos Deputados — pessoal do gabinete",
		url: `https://www.camara.leg.br/deputados/${alvo.id}/pessoal-gabinete`,
		assessores: linhas.map((l) => assessor(l.nome, l.cargo, String(l.periodo ?? ""))),
	};
}

async function gabineteDaCmrj(alvo: AlvoGabinete, c: ConsultasGabinete): Promise<BaseGabinete | null> {
	const gabinete = escolherPorNome(await c.gabinetesCmrj(), alvo.nome, (g) => g.nome_urna);
	if (!gabinete) {
		console.warn(`[GABINETE] Gabinete da CMRJ não encontrado para "${alvo.nome}" (cmrj_vereador_gabinete).`);
		return null;
	}
	const linhas = await c.servidoresCmrj(gabinete.gabinete_numero);
	return {
		alvo,
		fonte: `Câmara Municipal do Rio — servidores do ${gabinete.gabinete_numero}`,
		url: "https://aplicsc.camara.rj.gov.br",
		assessores: linhas.map((l) => assessor(l.nome, l.cargo, l.data_ingresso ? `Desde ${l.data_ingresso}` : "")),
	};
}

function lerEleito(l: LinhaEleito): EleitoHomonimo {
	return {
		sq: String(l.sq_candidato),
		cpf: l.nr_cpf_candidato,
		nome: l.nm_candidato,
		cargo: String(l.ds_cargo ?? "").toUpperCase(),
		ano: Number(l.ano_eleicao),
		municipio: String(l.nm_ue ?? ""),
		uf: l.sg_uf,
		situacao: String(l.ds_sit_tot_turno ?? ""),
	};
}

function contarGabinetes(linhas: { nome: string; gabinete: string }[]): Record<string, number> {
	const porNome = new Map<string, Set<string>>();
	for (const l of linhas) {
		const chave = normalizarNome(l.nome);
		porNome.set(chave, (porNome.get(chave) ?? new Set()).add(l.gabinete));
	}
	return Object.fromEntries([...porNome].map(([nome, gabinetes]) => [nome, gabinetes.size]));
}

/** Eleitos com o nome exato de algum funcionário + em quantos gabinetes esse nome aparece. */
async function homonimosNoTse(base: BaseGabinete, c: ConsultasGabinete): Promise<Pick<DadosGabinete, "eleitos" | "gabinetesPorNome">> {
	const nomes = nomesParaConferirNoTse(base.assessores);
	if (nomes.length === 0) return { eleitos: [], gabinetesPorNome: {} };
	const procurados = new Set(nomes);
	const eleitos = (await c.eleitosPorNomes(nomes, base.alvo.uf)).map(lerEleito).filter((e) => procurados.has(normalizarNome(e.nome)));
	const comEleito = new Set(eleitos.map((e) => normalizarNome(e.nome)));
	const originais = [...new Set(base.assessores.map((a) => a.nome).filter((n) => comEleito.has(normalizarNome(n))))];
	if (originais.length === 0) return { eleitos, gabinetesPorNome: {} };
	return { eleitos, gabinetesPorNome: contarGabinetes(await c.gabinetesPorNomes(base.alvo.casa, originais)) };
}

function mensagem(erro: unknown): string {
	return erro instanceof Error ? erro.message : String(erro);
}

export async function carregarGabinete(alvo: AlvoGabinete, c: ConsultasGabinete = consultasSupabase): Promise<DadosGabinete | null> {
	let base: BaseGabinete | null;
	try {
		base = alvo.casa === "CAMARA" ? await gabineteDaCamara(alvo, c) : await gabineteDaCmrj(alvo, c);
	} catch (erro) {
		console.warn(`[GABINETE] Base indisponível (${mensagem(erro)}); seguindo sem os cruzamentos de assessor.`);
		return null;
	}
	if (!base) return null;
	try {
		return { ...base, ...(await homonimosNoTse(base, c)) };
	} catch (erro) {
		console.warn(`[GABINETE] Eleitos do TSE indisponíveis (${mensagem(erro)}); seguindo sem o cruzamento de mandato.`);
		return { ...base, eleitos: [], gabinetesPorNome: {} };
	}
}
