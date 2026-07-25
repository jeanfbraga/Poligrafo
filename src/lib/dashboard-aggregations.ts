// ==========================================================================
// Agregações financeiras do dashboard (funções puras — testáveis).
//
// agruparCeapPorUf:
//   Antes do fix de 2026-07, a API guardava apenas os 5 maiores gastadores
//   de cada UF e o frontend somava esses 5 como se fosse o "total do estado"
//   — o que derrubava o ranking e fazia UFs diferentes exibirem o mesmo
//   valor arredondado (ex.: RS, RR e AC todos em "4,4 mi"). Aqui o total da
//   UF é a soma de TODOS os deputados da UF na janela da view (ano >= 2025);
//   a lista de deputados (máx. 5) serve apenas ao painel de detalhe.
//
// agregarEmendasPorUf:
//   A coluna uf_destino do ETL mistura formatos ("SP" e "SÃO PAULO (UF)"),
//   o que duplicava estados no ranking. Normalizamos tudo para a sigla.
// ==========================================================================

export interface CeapEstadoGrupo<T = unknown> {
	/** Soma do gasto CEAP de TODOS os deputados da UF na janela da view. */
	total: number;
	/** Até `limiteDetalhe` maiores gastadores da UF (painel de detalhe). */
	deputados: T[];
}

interface RowCeapUf {
	uf?: string;
	total_gasto: number;
}

export function agruparCeapPorUf<T extends RowCeapUf>(
	rows: T[],
	limiteDetalhe = 5,
): Record<string, CeapEstadoGrupo<T>> {
	const grupos: Record<string, CeapEstadoGrupo<T>> = {};

	for (const item of rows) {
		const uf = item.uf;
		if (!uf || uf === "BR") continue; // sem UF confiável: não entra no mapa
		const grupo = (grupos[uf] ??= { total: 0, deputados: [] });
		grupo.total += Number(item.total_gasto) || 0;
		if (grupo.deputados.length < limiteDetalhe) grupo.deputados.push(item);
	}

	// Chaves em ordem alfabética (estética do payload; o ranking é por total)
	return Object.keys(grupos)
		.sort()
		.reduce(
			(acc, uf) => {
				acc[uf] = grupos[uf];
				return acc;
			},
			{} as Record<string, CeapEstadoGrupo<T>>,
		);
}

// --------------------------------------------------------------------------

const NOME_ESTADO_PARA_UF: Record<string, string> = {
	ACRE: "AC",
	ALAGOAS: "AL",
	AMAPA: "AP",
	AMAZONAS: "AM",
	BAHIA: "BA",
	CEARA: "CE",
	"DISTRITO FEDERAL": "DF",
	"ESPIRITO SANTO": "ES",
	GOIAS: "GO",
	MARANHAO: "MA",
	"MATO GROSSO": "MT",
	"MATO GROSSO DO SUL": "MS",
	"MINAS GERAIS": "MG",
	PARA: "PA",
	PARAIBA: "PB",
	PARANA: "PR",
	PERNAMBUCO: "PE",
	PIAUI: "PI",
	"RIO DE JANEIRO": "RJ",
	"RIO GRANDE DO NORTE": "RN",
	"RIO GRANDE DO SUL": "RS",
	RONDONIA: "RO",
	RORAIMA: "RR",
	"SANTA CATARINA": "SC",
	"SAO PAULO": "SP",
	SERGIPE: "SE",
	TOCANTINS: "TO",
};

const removerAcentos = (str: string) =>
	str
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");

/**
 * Normaliza uf_destino do ETL de emendas para a sigla de 2 letras.
 * Aceita "SP", "SÃO PAULO (UF)", "São Paulo"; preserva valores que já são
 * sigla e rótulos especiais como "MÚLTIPLO".
 */
export function normalizarUfDestino(ufDestino: string): string {
	const limpo = (ufDestino ?? "").trim();
	const semSufixo = limpo.replace(/\s*\(UF\)\s*$/i, "").trim();
	if (/^[A-Z]{2}$/.test(semSufixo)) return semSufixo;
	const chave = removerAcentos(semSufixo).toUpperCase();
	return NOME_ESTADO_PARA_UF[chave] ?? limpo;
}

interface RowEmendaUf {
	uf_destino: string;
	total_pix: number;
}

/**
 * Funde grupos de uf_destino equivalentes (ex.: "SP" + "SÃO PAULO (UF)")
 * somando os valores pagos e reordenando do maior para o menor.
 */
export function agregarEmendasPorUf(
	rows: RowEmendaUf[],
): { uf_destino: string; total_pix: number }[] {
	const soma = new Map<string, number>();
	for (const row of rows ?? []) {
		const uf = normalizarUfDestino(row.uf_destino);
		soma.set(uf, (soma.get(uf) ?? 0) + (Number(row.total_pix) || 0));
	}
	return [...soma.entries()]
		.map(([uf_destino, total_pix]) => ({ uf_destino, total_pix }))
		.sort((a, b) => b.total_pix - a.total_pix);
}
