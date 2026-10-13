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
	/** De onde veio o CPF quando não é do próprio arquivo (ex.: "consulta_cand_2020 (título e nascimento)"). */
	cpf_fonte?: string | null;
}

/** Título de eleitor e data de nascimento: identificam a pessoa entre eleições. */
export interface IdentificacaoEleitoral {
	titulo: string;
	nascimento: string;
}

export function identificacaoDaLinha(r: Record<string, string>): IdentificacaoEleitoral | null {
	const titulo = soDigitos(r.NR_TITULO_ELEITORAL_CANDIDATO);
	const nascimento = texto(r.DT_NASCIMENTO);
	return titulo.length >= 10 && nascimento ? { titulo, nascimento } : null;
}

export interface CpfAnterior {
	cpf: string;
	nascimento: string | null;
	ano: number;
}

/**
 * Linha de uma eleição anterior (2016–2022, CPF ainda publicado): guarda o CPF pelo título,
 * só para títulos que interessam e na primeira vez (as eleições são lidas da mais recente).
 */
export function registrarCpfAnterior(mapa: Map<string, CpfAnterior>, r: Record<string, string>, titulos: Set<string>, ano: number): void {
	const titulo = soDigitos(r.NR_TITULO_ELEITORAL_CANDIDATO);
	if (!titulos.has(titulo) || mapa.has(titulo) || !cpfValido(r.NR_CPF_CANDIDATO)) return;
	mapa.set(titulo, { cpf: soDigitos(r.NR_CPF_CANDIDATO), nascimento: texto(r.DT_NASCIMENTO), ano });
}

/**
 * O TSE esconde o CPF de 2024 ("-4") mas publica título e nascimento: o eleito sem CPF ganha o
 * da candidatura anterior com o MESMO título e a MESMA data de nascimento (as duas coisas;
 * em 12/10/2026, 50.539 de 51.130 ligações pelo título conferiam o nascimento). Devolve quantos.
 */
export function completarCpfPeloTitulo(linhas: LinhaEleito[], idPorSq: Map<string, IdentificacaoEleitoral>, anteriores: Map<string, CpfAnterior>): number {
	let completados = 0;
	for (const l of linhas) {
		const id = idPorSq.get(l.sq_candidato);
		const anterior = id ? anteriores.get(id.titulo) : undefined;
		if (l.nr_cpf_candidato || !anterior || anterior.nascimento !== id?.nascimento) continue;
		l.nr_cpf_candidato = anterior.cpf;
		l.cpf_fonte = `consulta_cand_${anterior.ano} (título e nascimento)`;
		completados++;
	}
	return completados;
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

/** Campos obrigatórios presentes e situação que interessa (eleito/suplente, ou qualquer uma)? */
function essenciais(r: Record<string, string>, qualquerSituacao: boolean) {
	const campos = { cargo: texto(r.CD_CARGO), situacao: texto(r.DS_SIT_TOT_TURNO), nome: texto(r.NM_CANDIDATO), sq: texto(r.SQ_CANDIDATO) };
	const { cargo, situacao } = campos;
	if (Object.values(campos).some((v) => !v)) return null;
	if (!qualquerSituacao && !situacaoInteressa(cargo as string, situacao as string)) return null;
	return campos as { cargo: string; situacao: string; nome: string; sq: string };
}

/**
 * Linha do CSV → registro, ou null se não for eleito/suplente que interessa. `qualquerSituacao`:
 * todo candidato (para conferir quem exerceu mandato pela lista da assembleia).
 */
export function linhaParaEleito(r: Record<string, string>, ano: number, mapaIbge: Map<string, string>, qualquerSituacao = false): LinhaEleito | null {
	const e = essenciais(r, qualquerSituacao);
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
		cpf_fonte: null,
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

/** Cliente mínimo para gravar (o supabase-js real ou um falso nos testes). */
export interface BancoGravacao {
	from(tabela: string): {
		upsert(linhas: LinhaEleito[], opcoes: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
	};
}

/** Upsert em lotes; tabela ausente gera a dica da migração. */
export async function gravarLinhas(banco: BancoGravacao, linhas: LinhaEleito[], lote = 1000): Promise<void> {
	for (let i = 0; i < linhas.length; i += lote) {
		const { error } = await banco.from("tse_eleitos").upsert(linhas.slice(i, i + lote), { onConflict: "sq_candidato,ano_eleicao" });
		if (!error) continue;
		const dica = /relation .* does not exist|Could not find the table/i.test(error.message)
			? " — rode scripts/sql/migracao_perfil_tse_eleitos.sql no Banco de Perfil antes."
			: "";
		throw new Error(`[TSE ELEITOS] upsert falhou: ${error.message}${dica}`);
	}
}

export interface EleitoNaBase {
	sq_candidato: string;
	nm_candidato: string;
	ds_cargo: string | null;
	sg_uf: string;
	nr_cpf_candidato?: string | null;
	ds_sit_tot_turno?: string | null;
	cpf_fonte?: string | null;
}

const CAMPOS_COMPARADOS = ["nm_candidato", "nr_cpf_candidato", "ds_sit_tot_turno", "cpf_fonte"] as const;

/**
 * Só o que é novo ou mudou (CPF, situação, nome, origem do CPF). Regravar as 69 mil linhas
 * de 2024 todo mês deixava dezenas de MB de linhas mortas no Banco de Perfil, perto do limite
 * de 500 MB do plano gratuito (acima dele o banco fica só leitura) — 12/10/2026.
 */
export function linhasQueMudaram(novos: LinhaEleito[], naBase: EleitoNaBase[]): LinhaEleito[] {
	const base = new Map(naBase.map((e) => [e.sq_candidato, e]));
	return novos.filter((l) => {
		const atual = base.get(l.sq_candidato);
		return !atual || CAMPOS_COMPARADOS.some((c) => (atual[c] ?? null) !== (l[c] ?? null));
	});
}

/** Acima disso, sair de uma vez indica arquivo com defeito: nada é apagado. */
export const LIMITE_SAIDA = 0.05;

/**
 * Quem estava na base e não está mais no arquivo do TSE (ex.: diploma cassado e votos
 * anulados — Rodrigo Bacellar, 2026). O arquivo é regerado todo dia; o upsert sozinho
 * nunca tirava ninguém. null = saída grande demais (arquivo suspeito): não apagar.
 */
export function quemSaiu(naBase: EleitoNaBase[], novos: LinhaEleito[]): EleitoNaBase[] | null {
	const atuais = new Set(novos.map((l) => l.sq_candidato));
	const sairam = naBase.filter((e) => !atuais.has(e.sq_candidato));
	return naBase.length > 0 && sairam.length / naBase.length > LIMITE_SAIDA ? null : sairam;
}

/**
 * Chapas presidenciais vencedoras (resultado oficial). Os arquivos de 2002 a 2014 trazem a
 * chapa com a situação "#NULO#" (só a linha do 1º turno): sem esta lista, nenhum presidente
 * dessas eleições entrava. Nome civil como está no arquivo do TSE, sem acento.
 */
export const CHAPAS_ELEITAS: Record<number, string[]> = {
	2002: ["luiz inacio lula da silva", "jose alencar gomes da silva"],
	2006: ["luiz inacio lula da silva", "jose alencar gomes da silva"],
	2010: ["dilma vana rousseff", "michel miguel elias temer lulia"],
	2014: ["dilma vana rousseff", "michel miguel elias temer lulia"],
	2018: ["jair messias bolsonaro", "antonio hamilton martins mourao"],
};

/** Presidente ou vice da chapa vencedora do ano, mesmo com a situação vazia no arquivo. */
export function chapaEleita(r: Record<string, string>, ano: number, mapaIbge: Map<string, string>): LinhaEleito | null {
	if (!["1", "2"].includes(String(r.CD_CARGO)) || !CHAPAS_ELEITAS[ano]?.includes(semAcento(String(r.NM_CANDIDATO ?? "")))) return null;
	return linhaParaEleito({ ...r, DS_SIT_TOT_TURNO: "ELEITO (chapa presidencial vencedora)" }, ano, mapaIbge);
}

/** Assembleias com lista própria no Banco de Perfil (quem recebeu verba de gabinete no mandato). */
export const ASSEMBLEIAS_COM_LISTA: Record<string, "ALERJ" | "ALESP"> = { RJ: "ALERJ", SP: "ALESP" };

/** "Rodrigo Da Silva Bacellar (Rodrigo Bacellar)" → "rodrigo da silva bacellar". */
export function nomeCivilDaLista(deputado: string): string {
	return semAcento(deputado.replace(/\s*\([^)]*\)\s*/g, " ")).replace(/\s+/g, " ");
}

/**
 * Exerceu mandato pela lista da assembleia, mas o TSE não o tem como eleito: diploma cassado
 * e votos anulados (Rodrigo Bacellar, "NÃO ELEITO" no arquivo de 2022) ou suplente que assumiu.
 * Duas fontes oficiais concordando — nome civil COMPLETO idêntico na lista e em UM SÓ candidato
 * a deputado estadual da mesma UF na eleição (como o nome civil do Senado confirma o senador).
 * Devolve as linhas a gravar, com a situação dizendo de onde veio. Eleito já na base fica como está.
 */
export function exercicioPelaAssembleia(candidatos: LinhaEleito[], nomesNaLista: string[], casa: string): LinhaEleito[] {
	const porNome = new Map<string, LinhaEleito[]>();
	for (const c of candidatos) porNome.set(semAcento(c.nm_candidato), [...(porNome.get(semAcento(c.nm_candidato)) ?? []), c]);
	const saida: LinhaEleito[] = [];
	for (const nome of new Set(nomesNaLista.map(nomeCivilDaLista))) {
		const achados = porNome.get(nome) ?? [];
		const unico = achados.length === 1 ? achados[0] : null;
		if (!unico || semAcento(unico.ds_sit_tot_turno ?? "").startsWith("eleito")) continue;
		saida.push({ ...unico, ds_sit_tot_turno: `EXERCEU MANDATO (lista da ${casa}; TSE: ${unico.ds_sit_tot_turno})` });
	}
	return saida;
}

/**
 * Ciclos carregados e cargos de cada um. 2018: senadores (em mandato até 2027) e chapa
 * presidencial; 2002–2014: só a chapa presidencial (presidentes ficam sempre, decisão de
 * 12/10/2026 — o vice entra porque Temer assumiu). `cpfPeloTituloDe`: eleições anteriores
 * (da mais recente à mais antiga) que completam o CPF escondido, pelo título de eleitor +
 * data de nascimento (2014 e 2012 trazem quem voltou depois de anos sem concorrer, como o
 * prefeito de Goiânia). `assembleias`: confere quem exerceu mandato pela lista da assembleia.
 */
export const CICLOS: { ano: number; cargos?: string[]; eleicaoMunicipal?: string; cpfPeloTituloDe?: number[]; assembleias?: boolean }[] = [
	{ ano: 2002, cargos: ["1", "2"] },
	{ ano: 2006, cargos: ["1", "2"] },
	{ ano: 2010, cargos: ["1", "2"] },
	// 2014 publica a chapa sem CPF (Dilma e Temer): vem do arquivo de 2010 pelo título.
	{ ano: 2014, cargos: ["1", "2"], cpfPeloTituloDe: [2010] },
	{ ano: 2018, cargos: ["1", "2", "5"] },
	{ ano: 2022, assembleias: true },
	// 2010: quem ficou fora de 2012 a 2022 (Sandro Mabel, deputado federal eleito em 2010, prefeito de Goiânia).
	{ ano: 2024, eleicaoMunicipal: "619", cpfPeloTituloDe: [2022, 2020, 2018, 2016, 2014, 2012, 2010] },
];
