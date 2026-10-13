/* ==========================================================================
   Janela de mandato: o Polígrafo investiga quem tem mandato no período atual
   (e presidentes da República, sempre). Um lugar só para os períodos de cada
   cargo, a legislatura vigente e as eleições que as cargas precisam guardar.

   Sem import com "@/": as cargas (scripts/etl) também usam este arquivo.
   Posse pela Constituição; a partir de 2027 presidente em 5/jan e governador
   em 6/jan (Emenda Constitucional 111/2021).
   ========================================================================== */

/** Códigos de cargo do TSE (CD_CARGO). */
export const CARGO_TSE = {
	PRESIDENTE: 1,
	VICE_PRESIDENTE: 2,
	GOVERNADOR: 3,
	VICE_GOVERNADOR: 4,
	SENADOR: 5,
	DEPUTADO_FEDERAL: 6,
	DEPUTADO_ESTADUAL: 7,
	DEPUTADO_DISTRITAL: 8,
	PRIMEIRO_SUPLENTE: 9,
	SEGUNDO_SUPLENTE: 10,
	PREFEITO: 11,
	VICE_PREFEITO: 12,
	VEREADOR: 13,
} as const;

export interface Mandato {
	/** Ano da eleição que deu o mandato. */
	eleicao: number;
	/** Primeiro e último dia do mandato (AAAA-MM-DD). */
	inicio: string;
	fim: string;
}

type Grupo = "PRESIDENCIA" | "GOVERNO" | "LEGISLATIVO_GERAL" | "SENADO" | "MUNICIPAL";

const GRUPO_DO_CARGO: Record<number, Grupo> = {
	1: "PRESIDENCIA",
	2: "PRESIDENCIA",
	3: "GOVERNO",
	4: "GOVERNO",
	5: "SENADO",
	6: "LEGISLATIVO_GERAL",
	7: "LEGISLATIVO_GERAL",
	8: "LEGISLATIVO_GERAL",
	9: "SENADO",
	10: "SENADO",
	11: "MUNICIPAL",
	12: "MUNICIPAL",
	13: "MUNICIPAL",
};

/** Posse e último dia do mandato do grupo eleito no ano `eleicao`. */
function mandatoGeral(grupo: Grupo, eleicao: number): Mandato {
	const posse = eleicao + 1;
	const duracao = grupo === "SENADO" ? 8 : 4;
	const fimAno = posse + duracao;
	// Até a posse de 2023, presidente e governador assumiam em 1º/jan; depois, 5 e 6/jan.
	const dia: Record<Grupo, [string, string]> = {
		PRESIDENCIA: [posse >= 2027 ? "01-05" : "01-01", fimAno >= 2027 ? "01-04" : "12-31"],
		GOVERNO: [posse >= 2027 ? "01-06" : "01-01", fimAno >= 2027 ? "01-05" : "12-31"],
		LEGISLATIVO_GERAL: ["02-01", "01-31"],
		SENADO: ["02-01", "01-31"],
		MUNICIPAL: ["01-01", "12-31"],
	};
	const [ini, fim] = dia[grupo];
	const anoFim = fim === "12-31" ? fimAno - 1 : fimAno;
	return { eleicao, inicio: `${posse}-${ini}`, fim: `${anoFim}-${fim}` };
}

const ehEleicaoGeral = (ano: number) => (ano - 2022) % 4 === 0;

/** Eleições (do mesmo calendário do cargo) cujo mandato pode estar vigente em `ano`. */
function eleicoesCandidatas(grupo: Grupo, ano: number): number[] {
	const anos: number[] = [];
	for (let e = ano - 9; e <= ano; e++) {
		const geral = ehEleicaoGeral(e);
		const municipal = (e - 2024) % 4 === 0;
		if ((grupo === "MUNICIPAL" && municipal) || (grupo !== "MUNICIPAL" && geral)) anos.push(e);
	}
	return anos;
}

const hoje = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Mandatos vigentes do cargo na data. Senado tem dois (renovação de 1/3 e 2/3):
 * em 2026, os eleitos em 2018 e em 2022.
 */
export function mandatosVigentes(cargoTse: number, data: Date = new Date()): Mandato[] {
	const grupo = GRUPO_DO_CARGO[cargoTse];
	if (!grupo) return [];
	const dia = hoje(data);
	return eleicoesCandidatas(grupo, data.getUTCFullYear())
		.map((e) => mandatoGeral(grupo, e))
		.filter((m) => m.inicio <= dia && dia <= m.fim);
}

/** O mandato dessa eleição está vigente na data? */
export function emMandato(cargoTse: number, anoEleicao: number, data: Date = new Date()): boolean {
	return mandatosVigentes(cargoTse, data).some((m) => m.eleicao === anoEleicao);
}

/** Presidentes da República (atual e ex) ficam sempre: poucos dados e interesse público. */
export function sempreGuardado(cargoTse: number): boolean {
	// O vice entra junto: Temer (vice eleito em 2014) foi presidente. São poucas linhas.
	return cargoTse === CARGO_TSE.PRESIDENTE || cargoTse === CARGO_TSE.VICE_PRESIDENTE;
}

/** Entra na busca e nas bases: mandato vigente ou presidente. */
export function naJanela(cargoTse: number, anoEleicao: number, data: Date = new Date()): boolean {
	return sempreGuardado(cargoTse) || emMandato(cargoTse, anoEleicao, data);
}

/**
 * Eleições que as cargas precisam guardar na data: as dos mandatos vigentes e a
 * mais recente já realizada (eleitos à espera da posse), para a troca de período
 * acontecer sozinha na data da posse.
 */
export function eleicoesParaCarregar(data: Date = new Date()): number[] {
	const anos = new Set<number>();
	for (const cargo of Object.keys(GRUPO_DO_CARGO).map(Number)) {
		for (const m of mandatosVigentes(cargo, data)) anos.add(m.eleicao);
	}
	const ano = data.getUTCFullYear();
	// Eleição do ano corrente só depois do 1º turno (primeiro domingo de outubro).
	const ultima = data.getUTCMonth() >= 9 ? ano : ano - 1;
	for (let e = ultima; e > ultima - 2; e--) if ((e - 2022) % 2 === 0) anos.add(e);
	return [...anos].sort((a, b) => a - b);
}

/** Legislatura da Câmara na data (57ª: 2023–2027). */
export function legislaturaVigente(data: Date = new Date()): number {
	const m = mandatosVigentes(CARGO_TSE.DEPUTADO_FEDERAL, data)[0];
	const eleicao = m?.eleicao ?? 2022;
	return 57 + (eleicao - 2022) / 4;
}

/** Início do mandato dos deputados na data (57ª legislatura: 2023-02-01). */
export function inicioLegislaturaVigente(data: Date = new Date()): string {
	return mandatosVigentes(CARGO_TSE.DEPUTADO_FEDERAL, data)[0]?.inicio ?? "2023-02-01";
}
