/**
 * Funcionários do gabinete do PRÓPRIO político → fatos para o motor. Ver nota 31.
 *
 * A Câmara dos Deputados e a CMRJ publicam nome, cargo e período de quem trabalha
 * no gabinete, mas não o CPF. Por isso o funcionário só vira fato quando o nome
 * completo bate com alguém que TEM documento, dentro de um contexto pequeno:
 *  - doador da campanha do próprio político (contas do TSE por sq_candidato) →
 *    ASSESSOR_DO_GABINETE no CPF do doador;
 *  - eleito do TSE (não suplente) na mesma UF, com mandato no período do vínculo →
 *    ASSESSOR_DO_GABINETE + MANDATO_ELETIVO no CPF (2022) ou no nº do TSE (2024, sem CPF).
 *    Só com nome de 3 ou mais palavras próprias, único entre os eleitos da UF e presente
 *    em um só gabinete: em 08/10/2026, "Rodrigo de Souza" aparecia em três gabinetes e
 *    como prefeito de Petrolândia (homônimos);
 *  - sócio de fornecedor: socios.ts (EMPRESA_DE_ASSESSOR).
 *
 * Parentesco NÃO é inferido: sobrenome igual não prova vínculo. Dois gabinetes ao mesmo
 * tempo também não: o RH da Câmara não permite, e os 14 casos da base eram homônimos.
 */
import { normalizarNome } from "@/services/core/socio-confirmacao";
import type { Fato } from "./tipos";

export type CasaComGabinete = "CAMARA" | "CAMARA_MUNICIPAL_RJ" | "ALEPE";

export interface AlvoGabinete {
	casa: CasaComGabinete;
	/** Id do deputado na Câmara (na CMRJ e na ALEPE o gabinete é achado pelo nome). */
	id?: number;
	nome: string;
	uf: string;
}

export interface AssessorGabinete {
	nome: string;
	cargo: string;
	/** Como a casa publica: "De 03/02/2023 a 17/02/2026", "Desde 01/01/2025". */
	periodo: string;
}

export interface EleitoHomonimo {
	sq: string;
	cpf: string | null;
	nome: string;
	cargo: string;
	ano: number;
	municipio: string;
	uf: string;
	situacao: string;
}

export interface DadosGabinete {
	alvo: AlvoGabinete;
	/** Nome legível da fonte (vai na procedência do fato). */
	fonte: string;
	url: string;
	assessores: AssessorGabinete[];
	/** Eleitos da UF com o nome exato de algum funcionário (antes dos filtros). */
	eleitos: EleitoHomonimo[];
	/** Em quantos gabinetes da casa aparece cada nome (normalizado) que bateu com um eleito. */
	gabinetesPorNome: Record<string, number>;
}

/** Uma pessoa com todos os seus períodos no gabinete. */
export interface PessoaDoGabinete {
	nome: string;
	chave: string;
	vinculos: AssessorGabinete[];
	/** ISO; o início mais antigo. */
	inicio: string | null;
	/** ISO; null = algum vínculo em aberto. */
	fim: string | null;
}

const PARTICULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
const DATA_BR = /(\d{2})\/(\d{2})\/(\d{4})/g;
const CARGOS_COM_MANDATO = new Set(["VEREADOR", "PREFEITO", "VICE-PREFEITO", "DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL"]);

function texto(v: unknown): string {
	return String(v ?? "").trim();
}

type MontarAlvo = (nome: string, id: number, uf: string) => AlvoGabinete | null;

/** Casas que publicam a lista do gabinete em formato aberto (casa do pipe → alvo). */
const ALVOS_COM_GABINETE: Record<string, MontarAlvo> = {
	CAMARA: (nome, id, uf) => (id > 0 ? { casa: "CAMARA", id, nome, uf } : null),
	CAMARA_MUNICIPAL_RJ: (nome) => (nome ? { casa: "CAMARA_MUNICIPAL_RJ", nome, uf: "RJ" } : null),
	// ALEPE: API de dados abertos com a lotação "GAB.DEP. {nome}" (08/10/2026). As outras assembleias não publicam.
	ASSEMBLEIA_LEGISLATIVA: (nome, _id, uf) => (nome && uf === "PE" ? { casa: "ALEPE", nome, uf } : null),
};

/** Deputado federal (pelo id da Câmara), vereador do Rio ou deputado estadual de PE; as outras casas não publicam a lista. */
export function alvoDoGabinete(d: { casa?: unknown; id?: unknown; nome?: unknown; uf?: unknown } | null | undefined): AlvoGabinete | null {
	const montar = ALVOS_COM_GABINETE[texto(d?.casa)];
	return montar ? montar(texto(d?.nome), Number(d?.id), texto(d?.uf).toUpperCase()) : null;
}

export function palavrasProprias(nome: string): string[] {
	return normalizarNome(nome).split(" ").filter((p) => p && !PARTICULAS.has(p));
}

/** Nome com 3+ palavras próprias: o único tipo que vale comparar com listas grandes (eleitos, QSA). */
export function nomeDistintivo(nome: string): boolean {
	return palavrasProprias(nome).length >= 3;
}

export function periodoDoVinculo(periodo: string): { inicio: string | null; fim: string | null } {
	const datas = [...texto(periodo).matchAll(DATA_BR)].map((m) => `${m[3]}-${m[2]}-${m[1]}`);
	return { inicio: datas[0] ?? null, fim: datas[1] ?? null };
}

function juntarPeriodos(vinculos: AssessorGabinete[]): { inicio: string | null; fim: string | null } {
	const periodos = vinculos.map((v) => periodoDoVinculo(v.periodo));
	const inicios = periodos.map((p) => p.inicio).filter((x): x is string => Boolean(x)).sort();
	const aberto = periodos.some((p) => p.inicio && !p.fim);
	const fins = periodos.map((p) => p.fim).filter((x): x is string => Boolean(x)).sort();
	return { inicio: inicios[0] ?? null, fim: aberto ? null : (fins.at(-1) ?? null) };
}

export function pessoasDoGabinete(assessores: AssessorGabinete[]): PessoaDoGabinete[] {
	const porChave = new Map<string, AssessorGabinete[]>();
	for (const a of assessores) {
		const chave = normalizarNome(a.nome);
		if (chave) porChave.set(chave, [...(porChave.get(chave) ?? []), a]);
	}
	return [...porChave.entries()].map(([chave, vinculos]) => ({ nome: vinculos[0].nome.trim(), chave, vinculos, ...juntarPeriodos(vinculos) }));
}

/** Nomes (normalizados) que vale procurar entre os eleitos do TSE. */
export function nomesParaConferirNoTse(assessores: AssessorGabinete[]): string[] {
	return pessoasDoGabinete(assessores).map((p) => p.chave).filter(nomeDistintivo);
}

/** "Secretário parlamentar, De 03/02/2023 a 17/02/2026 (e mais 2 períodos)": o vínculo mais recente primeiro. */
export function resumoVinculos(p: PessoaDoGabinete): string {
	const recentes = [...p.vinculos].sort((a, b) => (periodoDoVinculo(b.periodo).inicio ?? "").localeCompare(periodoDoVinculo(a.periodo).inicio ?? ""));
	const extra = recentes.length > 1 ? ` (e mais ${recentes.length - 1} período(s))` : "";
	return [recentes[0].cargo, recentes[0].periodo].filter(Boolean).join(", ") + extra;
}

const LIGACAO = { doador: "doador da campanha", eleito: "eleito" } as const;

function fatoAssessor(d: DadosGabinete, p: PessoaDoGabinete, documento: string, ligacao: keyof typeof LIGACAO, coletadoEm: string): Fato {
	return {
		id: `fato-assessor_do_gabinete-${documento}-${ligacao}`,
		papel: "ASSESSOR_DO_GABINETE",
		documento,
		nome: p.nome,
		periodo: { inicio: p.inicio, fim: p.fim },
		detalhe: resumoVinculos(p),
		procedencia: { fonte: d.fonte, url: d.url, chave: `nome completo igual ao do ${LIGACAO[ligacao]} (a casa não publica o CPF)`, coletadoEm },
	};
}

/** Doadores pessoa física da campanha do político, por nome. Dois CPFs com o mesmo nome = ambíguo, fica de fora. */
function doadoresPorNome(fatos: Fato[]): Map<string, Fato | null> {
	const idx = new Map<string, Fato | null>();
	for (const f of fatos) {
		if (f.papel !== "DOADOR" || f.documento.length !== 11) continue;
		const chave = normalizarNome(f.nome);
		const ja = idx.get(chave);
		idx.set(chave, ja === undefined || ja?.documento === f.documento ? f : null);
	}
	return idx;
}

/** Só o nome com um único candidato (sq) na UF; dois eleitos com o mesmo nome = homônimo. */
function eleitosUnicosPorNome(eleitos: EleitoHomonimo[]): Map<string, EleitoHomonimo> {
	const porNome = new Map<string, EleitoHomonimo[]>();
	for (const e of eleitos) {
		const chave = normalizarNome(e.nome);
		porNome.set(chave, [...(porNome.get(chave) ?? []), e]);
	}
	const unicos = new Map<string, EleitoHomonimo>();
	for (const [chave, lista] of porNome) if (new Set(lista.map((e) => e.sq)).size === 1) unicos.set(chave, lista[0]);
	return unicos;
}

/** Mandato: municipal (eleição em ano múltiplo de 4) começa em janeiro; assembleia, em fevereiro. */
export function mandatoDoEleito(e: Pick<EleitoHomonimo, "ano">): { inicio: string; fim: string } {
	if (e.ano % 4 === 0) return { inicio: `${e.ano + 1}-01-01`, fim: `${e.ano + 4}-12-31` };
	return { inicio: `${e.ano + 1}-02-01`, fim: `${e.ano + 5}-01-31` };
}

function sobrepoe(p: PessoaDoGabinete, m: { inicio: string; fim: string }): boolean {
	return p.inicio !== null && p.inicio <= m.fim && (p.fim ?? "9999-12-31") >= m.inicio;
}

function eleitoComMandato(p: PessoaDoGabinete, d: DadosGabinete, eleitos: Map<string, EleitoHomonimo>): EleitoHomonimo | null {
	if (!nomeDistintivo(p.chave) || d.gabinetesPorNome[p.chave] !== 1) return null;
	const e = eleitos.get(p.chave);
	if (!e || !CARGOS_COM_MANDATO.has(e.cargo) || /SUPLENTE/i.test(e.situacao)) return null;
	return sobrepoe(p, mandatoDoEleito(e)) ? e : null;
}

function cargoLegivel(cargo: string): string {
	return cargo.charAt(0) + cargo.slice(1).toLowerCase();
}

function fatosDoMandato(d: DadosGabinete, p: PessoaDoGabinete, e: EleitoHomonimo, coletadoEm: string): Fato[] {
	const documento = /^\d{11}$/.test(e.cpf ?? "") ? String(e.cpf) : `SQ-${e.sq}`;
	const mandato = mandatoDoEleito(e);
	const local = e.ano % 4 === 0 ? `${e.municipio}/${e.uf}` : e.uf;
	return [
		fatoAssessor(d, p, documento, "eleito", coletadoEm),
		{
			id: `fato-mandato_eletivo-${documento}`,
			papel: "MANDATO_ELETIVO",
			documento,
			nome: e.nome,
			data: mandato.inicio,
			periodo: mandato,
			detalhe: `${cargoLegivel(e.cargo)} eleito em ${e.ano} — ${local} (mandato ${mandato.inicio.slice(0, 4)}–${mandato.fim.slice(0, 4)})`,
			procedencia: {
				fonte: `TSE — candidatos eleitos ${e.ano}`,
				url: `https://dadosabertos.tse.jus.br/dataset/candidatos-${e.ano}`,
				chave: `nome completo + UF=${e.uf} (um só eleito com esse nome na UF; nome em um só gabinete)`,
				coletadoEm,
			},
		},
	];
}

export function fatosDoGabinete(d: DadosGabinete, fatos: Fato[], coletadoEm: string): Fato[] {
	const doadores = doadoresPorNome(fatos);
	const eleitos = eleitosUnicosPorNome(d.eleitos);
	return pessoasDoGabinete(d.assessores).flatMap((p) => {
		const saida: Fato[] = [];
		const doador = doadores.get(p.chave);
		if (doador) saida.push(fatoAssessor(d, p, doador.documento, "doador", coletadoEm));
		const eleito = eleitoComMandato(p, d, eleitos);
		if (eleito) saida.push(...fatosDoMandato(d, p, eleito, coletadoEm));
		return saida;
	});
}
