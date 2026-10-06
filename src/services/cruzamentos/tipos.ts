/**
 * Motor de cruzamentos — tipos. Ver nota 31 do Obsidian.
 *
 * Fato: algo verificado que uma fonte oficial disse sobre um documento (CNPJ
 * ou CPF), com o papel que ele tem na investigação e de onde veio.
 * Achado: dois papéis diferentes no MESMO documento (ex.: doador que também é
 * fornecedor da cota). O achado é gerado por regra, sem IA; a IA só explica.
 */

export type Papel =
	| "EMPRESA_DO_POLITICO"
	| "DOADOR"
	| "FORNECEDOR_CAMPANHA"
	| "FORNECEDOR_COTA"
	| "BENEFICIARIO_EMENDA"
	| "CONTRATADO_ENTE"
	| "CONTRATADO_PUBLICO"
	| "SANCIONADO";

export interface Procedencia {
	/** Nome legível da fonte (ex.: "Câmara dos Deputados — CEAP"). */
	fonte: string;
	/** Link para conferir (documento, página oficial ou API). */
	url?: string;
	/** Como o dado foi buscado (ex.: "cnpj=…", "nome+UE+cargo"). */
	chave: string;
	/** Quando a consulta foi feita (ISO). */
	coletadoEm: string;
}

export interface Fato {
	/** Estável dentro da investigação: papel + documento + índice da origem. */
	id: string;
	papel: Papel;
	/** Só dígitos: CNPJ (14) ou CPF (11). */
	documento: string;
	nome: string;
	valor?: number;
	data?: string;
	/** Texto curto que identifica o registro (órgão, objeto, base da sanção…). */
	detalhe?: string;
	procedencia: Procedencia;
}

export type Severidade = "ALTA" | "MEDIA" | "BAIXA";

export interface Regra {
	id: string;
	titulo: string;
	papeis: [Papel, Papel];
	severidade: Severidade;
	/** Por que importa, em uma frase (vai no resumo do achado). */
	porque: string;
}

export interface Achado {
	/** Estável: regra + documento (o mesmo achado não se repete). */
	id: string;
	regra: string;
	titulo: string;
	severidade: Severidade;
	documento: string;
	nome: string;
	/** Coincidência só na raiz do CNPJ (matriz × filial): severidade um nível abaixo. */
	somenteRaiz: boolean;
	/** Ids dos fatos que sustentam o achado. */
	fatos: string[];
	/** Resumo montado sem IA, só com os fatos. */
	resumo: string;
}
