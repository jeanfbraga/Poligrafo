/**
 * Tipos do canário de fontes (teste semanal de cada endpoint governamental).
 * Ideia portada do `scripts/canary_sources.py` do mcp-brasil.
 */

export type Alcada = "federal" | "estadual" | "municipal";

/**
 * OK      — respondeu como esperado.
 * ALERTA  — respondeu, mas confirma um problema conhecido (ex.: filtro ignorado).
 * FALHA   — não respondeu, ou respondeu algo inutilizável.
 * PULADA  — falta chave/variável para testar.
 */
export type EstadoSonda = "OK" | "ALERTA" | "FALHA" | "PULADA";

export interface Veredito {
	estado: EstadoSonda;
	detalhe: string;
}

export interface ContextoSonda {
	env: Record<string, string | undefined>;
	timeoutMs: number;
}

export interface Sonda {
	id: string;
	alcada: Alcada;
	/** Nome legível da fonte. */
	fonte: string;
	/** Onde o Polígrafo usa (ou vai usar) esta fonte. */
	usadaEm: string;
	/** Se falhar, o workflow fica vermelho. */
	critica: boolean;
	executar(ctx: ContextoSonda): Promise<Veredito>;
}

export interface ResultadoSonda extends Veredito {
	id: string;
	alcada: Alcada;
	fonte: string;
	usadaEm: string;
	critica: boolean;
	ms: number;
}
