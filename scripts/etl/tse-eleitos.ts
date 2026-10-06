/**
 * Regras puras do ETL tse_eleitos (testadas em __tests__/unit/tse-eleitos.test.ts).
 *
 * Do CSV nacional `consulta_cand_{ano}_BRASIL.csv` (TSE, cp1252, `;`) ficam:
 *  - quem foi ELEITO (qualquer cargo do ciclo);
 *  - SUPLENTES de casas legislativas estaduais e federais (podem assumir).
 * Ideia do `datasets/tse_candidatos` do mcp-brasil (ver nota 31 do Obsidian).
 */
import { cpfValido, soDigitos } from "../../src/lib/documento";

export interface LinhaEleito {
	sq_candidato: string;
	ano_eleicao: number;
	cd_cargo: string;
	ds_cargo: string | null;
	sg_uf: string;
	sg_ue: string | null;
	nm_ue: string | null;
	municipio_slug: string | null;
	cd_municipio_ibge: string | null;
	nm_candidato: string;
	nm_urna_candidato: string | null;
	nr_cpf_candidato: string | null;
	sg_partido: string | null;
	ds_sit_tot_turno: string | null;
	nomes_busca: string;
}

/** Cargos municipais (a UE é o município): prefeito, vice e vereador. */
const CARGOS_MUNICIPAIS = new Set(["11", "12", "13"]);
/** Casas legislativas cujos suplentes interessam. */
const CARGOS_COM_SUPLENTE = new Set(["5", "6", "7", "8"]);

export function semAcento(texto: string): string {
	return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function slugMunicipio(nome: string): string {
	return semAcento(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Nome civil + nome de urna, sem acento, para busca por trigrama. */
export function nomesBusca(nome: string, urna?: string | null): string {
	const partes = [nome, urna].filter((p): p is string => Boolean(p && p.trim()));
	return [...new Set(partes.map(semAcento))].join(" | ");
}

export function situacaoInteressa(cargo: string, situacao: string): boolean {
	const s = semAcento(situacao);
	if (s.startsWith("eleito")) return true;
	return s === "suplente" && CARGOS_COM_SUPLENTE.has(cargo);
}

/** TSE→IBGE a partir de `mun-e{eleição}-cm.json` (abr[].mu[] com cd e cdi). */
export function montarMapaIbge(json: { abr?: { mu?: { cd: string; cdi: string }[] }[] }): Map<string, string> {
	const mapa = new Map<string, string>();
	for (const uf of json.abr ?? []) {
		for (const m of uf.mu ?? []) mapa.set(String(Number(m.cd)), String(m.cdi));
	}
	return mapa;
}

function texto(v: unknown): string | null {
	const s = String(v ?? "").trim();
	return s && s !== "#NULO#" && s !== "#NE#" && s !== "-1" ? s : null;
}

/** Município (slug e código IBGE) só nos cargos municipais; nos demais a UE é a UF. */
function municipio(cargo: string, ue: string | null, nmUe: string | null, mapaIbge: Map<string, string>) {
	if (!CARGOS_MUNICIPAIS.has(cargo)) return { municipio_slug: null, cd_municipio_ibge: null };
	return {
		municipio_slug: nmUe ? slugMunicipio(nmUe) : null,
		cd_municipio_ibge: ue ? mapaIbge.get(String(Number(ue))) ?? null : null,
	};
}

/** Campos obrigatórios presentes e situação que interessa (eleito/suplente)? */
function essenciais(r: Record<string, string>) {
	const campos = { cargo: texto(r.CD_CARGO), situacao: texto(r.DS_SIT_TOT_TURNO), nome: texto(r.NM_CANDIDATO), sq: texto(r.SQ_CANDIDATO) };
	const { cargo, situacao } = campos;
	if (Object.values(campos).some((v) => !v) || !situacaoInteressa(cargo as string, situacao as string)) return null;
	return campos as { cargo: string; situacao: string; nome: string; sq: string };
}

/** Linha do CSV → registro, ou null se não for eleito/suplente que interessa. */
export function linhaParaEleito(r: Record<string, string>, ano: number, mapaIbge: Map<string, string>): LinhaEleito | null {
	const e = essenciais(r);
	if (!e) return null;
	const ue = texto(r.SG_UE);
	const nmUe = texto(r.NM_UE);
	const urna = texto(r.NM_URNA_CANDIDATO);
	return {
		sq_candidato: e.sq,
		ano_eleicao: ano,
		cd_cargo: e.cargo,
		ds_cargo: texto(r.DS_CARGO),
		sg_uf: (texto(r.SG_UF) ?? "").toUpperCase(),
		sg_ue: ue,
		nm_ue: nmUe,
		...municipio(e.cargo, ue, nmUe, mapaIbge),
		nm_candidato: e.nome,
		nm_urna_candidato: urna,
		nr_cpf_candidato: cpfValido(r.NR_CPF_CANDIDATO) ? soDigitos(r.NR_CPF_CANDIDATO) : null,
		sg_partido: texto(r.SG_PARTIDO),
		ds_sit_tot_turno: e.situacao,
		nomes_busca: nomesBusca(e.nome, urna),
	};
}

/**
 * Uma linha por candidato: no 2º turno o mesmo `sq_candidato` aparece duas vezes;
 * fica a situação final (a do maior turno).
 */
export function deduplicar(linhas: { linha: LinhaEleito; turno: number }[]): LinhaEleito[] {
	const porSq = new Map<string, { linha: LinhaEleito; turno: number }>();
	for (const item of linhas) {
		const atual = porSq.get(item.linha.sq_candidato);
		if (!atual || item.turno >= atual.turno) porSq.set(item.linha.sq_candidato, item);
	}
	return [...porSq.values()].map((x) => x.linha);
}

/** Ciclos carregados e cargos de cada um (2018: só senadores, ainda em mandato até 2027). */
export const CICLOS: { ano: number; cargos?: string[]; eleicaoMunicipal?: string }[] = [
	{ ano: 2018, cargos: ["5"] },
	{ ano: 2022 },
	{ ano: 2024, eleicaoMunicipal: "619" },
];
