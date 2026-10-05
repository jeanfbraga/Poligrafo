/* ==========================================================================
   Dossiê exportado — atuação parlamentar do deputado federal (modelo puro).
   Mesmos resumos da página de perfil: gabinete (lib/gabinete), cota mensal
   contra o teto (lib/cota-mensal) e votos nominais (lib/votos).
   ========================================================================== */
import { type ResumoDaCota, resumirCotaMensal } from "@/lib/cota-mensal";
import { dataBR } from "@/lib/format";
import { agruparServidores, type CargoContado, resumoPorCargo } from "@/lib/gabinete";
import type { ProposicaoResumo } from "@/lib/perfil-deputado/proposicoes";
import { idProposicaoPrincipal, limparNomeProjeto, type SentidoVoto, sentidoDoVoto, urlFichaCamara } from "@/lib/votos";

type Registro = Record<string, any>;

/** Votos listados no documento (os mais recentes); o resumo conta todos. */
export const MAX_VOTOS_DOSSIE = 100;

/** O que o servidor consulta no banco de perfil (lib/perfil-deputado/consultas). */
export interface DadosPerfilCamara {
	servidores: Registro[];
	cota: Registro[];
	/** Do mais recente ao mais antigo. */
	votos: Registro[];
	/** Proposição principal (id) → sigla/número/ano, ementa e inteiro teor. */
	proposicoes: Record<string, ProposicaoResumo>;
}

export interface VotoDossie {
	data: string;
	/** "PLP 230/2025" quando conhecido. */
	proposicao: string;
	ementa: string;
	/** O que foi a votação ("Aprovado o Substitutivo…"), sem o placar. */
	votado: string;
	voto: string;
	sentido: SentidoVoto;
	/** Inteiro teor quando conhecido; senão a ficha de tramitação na Câmara. */
	url: string | null;
	integra: boolean;
}

export interface PerfilDossie {
	idCamara: string;
	urlPerfilCamara: string;
	gabinete: { ativos: number; desligados: number; periodos: number; cargos: CargoContado[] };
	/** null = nenhum registro de cota na base. */
	cota: ResumoDaCota | null;
	votos: { total: number; sim: number; nao: number; outros: number; lista: VotoDossie[] };
}

/** idCamara informado, mas a consulta falhou ou estourou o tempo. */
export const PERFIL_INDISPONIVEL = "indisponivel" as const;
export type PerfilNoDossie = PerfilDossie | typeof PERFIL_INDISPONIVEL | null;

export const urlPerfilCamara = (id: string) => `https://www.camara.leg.br/deputados/${encodeURIComponent(id)}`;

function gabineteDe(servidores: Registro[], hoje: Date): PerfilDossie["gabinete"] {
	const pessoas = agruparServidores(servidores, hoje);
	const ativos = pessoas.filter((p) => p.status === "ATIVO").length;
	return { ativos, desligados: pessoas.length - ativos, periodos: servidores.length, cargos: resumoPorCargo(pessoas) };
}

/** Ementa curta: com até 100 votos listados, a tabela já ocupa várias páginas. */
const EMENTA_MAX = 140;

const encurtar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

function votoDe(v: Registro, proposicoes: Record<string, ProposicaoResumo>): VotoDossie {
	const id = idProposicaoPrincipal(v);
	const p = id ? proposicoes[id] : undefined;
	return {
		data: dataBR(v.data_votacao) || "—",
		proposicao: p?.titulo ?? "",
		ementa: p?.ementa ? encurtar(p.ementa, EMENTA_MAX) : "",
		votado: limparNomeProjeto(v.projeto_nome),
		voto: String(v.voto ?? "—"),
		sentido: sentidoDoVoto(v.voto),
		url: p?.integra ?? (id ? urlFichaCamara(id) : null),
		integra: Boolean(p?.integra),
	};
}

function votosDe(votos: Registro[], proposicoes: Record<string, ProposicaoResumo>): PerfilDossie["votos"] {
	const sentidos = votos.map((v) => sentidoDoVoto(v.voto));
	const sim = sentidos.filter((s) => s === "sim").length;
	const nao = sentidos.filter((s) => s === "nao").length;
	return {
		total: votos.length,
		sim,
		nao,
		outros: votos.length - sim - nao,
		lista: votos.slice(0, MAX_VOTOS_DOSSIE).map((v) => votoDe(v, proposicoes)),
	};
}

const lista = (v: unknown): Registro[] => (Array.isArray(v) ? v.filter((x) => typeof x === "object" && x !== null) : []);

export function montarPerfilDossie(idCamara: string, dados: DadosPerfilCamara, hoje: Date): PerfilDossie {
	const cota = lista(dados.cota);
	return {
		idCamara,
		urlPerfilCamara: urlPerfilCamara(idCamara),
		gabinete: gabineteDe(lista(dados.servidores), hoje),
		cota: cota.length > 0 ? resumirCotaMensal(cota) : null,
		votos: votosDe(lista(dados.votos), dados.proposicoes ?? {}),
	};
}
