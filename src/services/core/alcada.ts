/**
 * Regras de cada alçada, numa tabela só.
 *
 * Antes, o `investigador-principal.ts` repetia cadeias de `if` sobre a casa
 * legislativa para decidir o cargo no TSE, o rótulo do nó, a esfera do
 * prompt e as fontes. Faltavam casos: presidente virava "Político",
 * governador e assembleias caíam na esfera FEDERAL (regras da cota da
 * Câmara no prompt) e emendas federais por nome rodavam para todo cargo.
 * Ver nota 29 do Obsidian.
 */

export type Esfera = "FEDERAL" | "ESTADUAL" | "MUNICIPAL";

export interface PerfilAlcada {
	esfera: Esfera;
	/** Código do cargo no TSE (1 pres., 3 gov., 5 sen., 6 dep. fed., 7 dep. est., 8 distrital, 11 pref., 13 ver.). */
	cargoTse: string;
	/** Rótulo do nó PESSOA. */
	cargoDisplay: string;
	/** Chefe do Executivo (governador, prefeito, presidente). */
	executivo: boolean;
	/** Emendas por nome do autor (Portal da Transparência): só para quem apresenta emenda federal. */
	emendasPorAutor: boolean;
}

const DEPUTADO_ESTADUAL: PerfilAlcada = {
	esfera: "ESTADUAL", cargoTse: "7", cargoDisplay: "Deputado Estadual", executivo: false, emendasPorAutor: false,
};

const VEREADOR: PerfilAlcada = {
	esfera: "MUNICIPAL", cargoTse: "13", cargoDisplay: "Vereador Municipal", executivo: false, emendasPorAutor: false,
};

const PERFIS: Record<string, PerfilAlcada> = {
	CAMARA: { esfera: "FEDERAL", cargoTse: "6", cargoDisplay: "Deputado Federal", executivo: false, emendasPorAutor: true },
	SENADO: { esfera: "FEDERAL", cargoTse: "5", cargoDisplay: "Senador da República", executivo: false, emendasPorAutor: true },
	PRESIDENCIA_DA_REPUBLICA: {
		esfera: "FEDERAL", cargoTse: "1", cargoDisplay: "Presidente da República", executivo: true, emendasPorAutor: false,
	},
	GOVERNO_ESTADUAL: { esfera: "ESTADUAL", cargoTse: "3", cargoDisplay: "Governador", executivo: true, emendasPorAutor: false },
	ALERJ: DEPUTADO_ESTADUAL,
	ALESP: DEPUTADO_ESTADUAL,
	ASSEMBLEIA_LEGISLATIVA: DEPUTADO_ESTADUAL,
	PREFEITURA: { esfera: "MUNICIPAL", cargoTse: "11", cargoDisplay: "Prefeito", executivo: true, emendasPorAutor: false },
};

/** Perfil usado quando a casa é desconhecida (comportamento antigo: federal). */
const PADRAO: PerfilAlcada = {
	esfera: "FEDERAL", cargoTse: "6", cargoDisplay: "Político", executivo: false, emendasPorAutor: false,
};

/** Deputado distrital (DF): cargo 8 no TSE, mesmo papel de deputado estadual. */
const DISTRITAL: PerfilAlcada = { ...DEPUTADO_ESTADUAL, cargoTse: "8", cargoDisplay: "Deputado Distrital" };

export function perfilDaCasa(casa: string | undefined | null, uf?: string | null): PerfilAlcada {
	const c = String(casa ?? "");
	if (c === "ASSEMBLEIA_LEGISLATIVA" && uf === "DF") return DISTRITAL;
	if (c.startsWith("CAMARA_MUNICIPAL")) return VEREADOR;
	return PERFIS[c] ?? PADRAO;
}

/**
 * Casa do vereador. A Câmara do Rio (CMRJ) e a de São Paulo têm bases
 * próprias; qualquer outro município usa a casa genérica — antes, todo
 * vereador do estado do RJ recebia os dados da CMRJ.
 */
export function casaDoVereador(municipio: string | undefined | null): string {
	const m = String(municipio ?? "").toLowerCase().replace(/_/g, "-");
	if (m === "rio-de-janeiro") return "CAMARA_MUNICIPAL_RJ";
	if (m === "sao-paulo") return "CAMARA_MUNICIPAL_SP";
	return "CAMARA_MUNICIPAL_LOCAL";
}
