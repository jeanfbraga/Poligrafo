// lib/dou/client.ts
// Client para busca no Diário Oficial da União (DOU) via Imprensa Nacional
// Portado do mcp-brasil v0.14.0 — data/diario_oficial/client_dou.py
// Baseado no projeto Ro-dou (https://github.com/gestaogovbr/Ro-dou)

import type { PublicacaoDOU, ResultadoDOU } from "./types";
import { DOU_PERIODS, DOU_SECTIONS } from "./types";

// ==========================================
// Constantes
// ==========================================
const DOU_API_BASE = "https://www.in.gov.br";
const DOU_SEARCH_URL = `${DOU_API_BASE}/consulta/-/buscar/dou`;
const DOU_ARTICLE_URL = `${DOU_API_BASE}/en/web/dou/-`;

// Script tag ID que contém o JSON com resultados de busca
const SCRIPT_TAG_ID =
	"_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params";

// Regex para extrair JSON do HTML (a busca do in.gov.br retorna HTML com JSON embutido)
const SCRIPT_RE = new RegExp(
	`<script[^>]+id="${SCRIPT_TAG_ID}"[^>]*>(.*?)</script>`,
	"s",
);

// Headers para simular browser (in.gov.br bloqueia requisições sem headers)
const DOU_HEADERS: Record<string, string> = {
	Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
	Referer: "https://www.in.gov.br/consulta",
	"Cache-Control": "no-cache",
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// ==========================================
// Helpers
// ==========================================

/** Converte YYYY-MM-DD → dd-mm-yyyy para a API do DOU */
function toDMY(dateStr: string): string {
	if (dateStr.length === 10 && dateStr[4] === "-") {
		const [y, m, d] = dateStr.split("-");
		return `${d}-${m}-${y}`;
	}
	return dateStr;
}

/** Extrai JSON de resultados embutido no HTML da resposta do DOU */
export function extractJsonFromHtml(html: string): {
	jsonArray?: any[];
	total?: number;
} {
	const match = SCRIPT_RE.exec(html);
	if (!match) {
		console.warn("[DOU] Script tag com resultados não encontrada na resposta");
		return {};
	}

	const raw = match[1].trim();
	if (!raw) return {};

	try {
		return JSON.parse(raw);
	} catch (e) {
		console.warn("[DOU] Falha ao parsear JSON embutido:", e);
		return {};
	}
}

/** Parseia um item de resultado do DOU para nosso tipo */
export function parsePublicacao(item: Record<string, any>): PublicacaoDOU {
	return {
		titulo: item.title || item.titulo || null,
		resumo: item.abstract || item.resumo || null,
		urlTitulo: item.urlTitle || item.url_titulo || null,
		orgao: item.pubName || item.orgao || null,
		tipoPublicacao: item.artType || item.tipo_publicacao || null,
		secao: item.pubType || item.secao || null,
		dataPublicacao: item.pubDate || item.data_publicacao || null,
		edicao: item.numberPage || item.edicao || null,
		pagina: item.pageNumber || item.pagina || null,
		conteudo: item.content || item.conteudo || null,
		assinante: item.assina || item.assinante || null,
		cargoAssinante: item.cargo || item.cargo_assinante || null,
	};
}

// ==========================================
// API Pública
// ==========================================

export interface BuscarDOUOptions {
	termo: string;
	secao?: string; // SECAO_1, SECAO_2, SECAO_3, TODOS (default: TODOS)
	periodo?: string; // DIA, SEMANA, MES, ANO, PERSONALIZADO (default: MES)
	dataInicio?: string; // YYYY-MM-DD (para PERSONALIZADO)
	dataFim?: string; // YYYY-MM-DD (para PERSONALIZADO)
	orgao?: string;
	tipoPublicacao?: string;
	campo?: string; // TUDO, TITULO, CONTEUDO (default: TUDO)
	pagina?: number; // 0-indexed
	tamanho?: number; // default 20
	timeout?: number; // timeout em ms (default: 8000)
}

/**
 * Busca publicações no Diário Oficial da União via Imprensa Nacional.
 * A busca retorna HTML com JSON embutido em um <script> tag.
 *
 * @example
 * const resultado = await buscarDOU({ termo: 'João Silva', secao: 'SECAO_2', periodo: 'ANO' });
 * // Seção 2 = atos de pessoal (nomeações, exonerações)
 */
export async function buscarDOU(
	options: BuscarDOUOptions,
): Promise<ResultadoDOU> {
	const {
		termo,
		secao = "TODOS",
		periodo = "MES",
		dataInicio,
		dataFim,
		orgao,
		tipoPublicacao,
		campo = "TUDO",
		pagina = 0,
		tamanho = 20,
		timeout = 8000,
	} = options;

	// Mapeia nomes legíveis para códigos da API
	const secaoCode = DOU_SECTIONS[secao] ?? secao;
	const periodoCode = DOU_PERIODS[periodo] ?? periodo.toLowerCase();

	const params = new URLSearchParams({
		q: termo,
		s: secaoCode,
		exactDate: periodoCode,
		sortType: "0",
		delta: String(tamanho),
		currentPage: String(pagina),
	});

	// Período personalizado com datas
	if (dataInicio && dataFim) {
		params.set("exactDate", "personalizado");
		params.set("publishFrom", toDMY(dataInicio));
		params.set("publishTo", toDMY(dataFim));
	}

	if (orgao) params.set("orgPrin", orgao);
	if (tipoPublicacao) params.set("artType", tipoPublicacao);
	if (campo !== "TUDO") params.set("searchType", campo);

	const url = `${DOU_SEARCH_URL}?${params.toString()}`;

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		const response = await fetch(url, {
			headers: DOU_HEADERS,
			signal: controller.signal,
		});

		clearTimeout(timer);

		if (!response.ok) {
			console.warn(
				`[DOU] API retornou HTTP ${response.status} para "${termo}"`,
			);
			return { total: 0, publicacoes: [] };
		}

		const html = await response.text();
		const data = extractJsonFromHtml(html);

		if (!data?.jsonArray) {
			return { total: 0, publicacoes: [] };
		}

		const publicacoes = data.jsonArray.map(parsePublicacao);
		return { total: data.total ?? publicacoes.length, publicacoes };
	} catch (e: any) {
		if (e.name === "AbortError") {
			console.warn(`[DOU] Timeout (${timeout}ms) buscando "${termo}"`);
		} else {
			console.warn(`[DOU] Erro ao buscar "${termo}":`, e.message);
		}
		return { total: 0, publicacoes: [] };
	}
}

/**
 * Lê o conteúdo completo de uma publicação do DOU pelo urlTitle.
 */
export async function lerPublicacaoDOU(
	urlTitulo: string,
): Promise<PublicacaoDOU | null> {
	const url = `${DOU_ARTICLE_URL}/${urlTitulo}`;

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 6000);

		const response = await fetch(url, {
			headers: { ...DOU_HEADERS, Accept: "application/json" },
			signal: controller.signal,
		});

		clearTimeout(timer);

		if (!response.ok) return null;

		const data = await response.json();
		if (!data || typeof data !== "object") return null;

		return parsePublicacao(data);
	} catch {
		return null;
	}
}

/**
 * Busca nomeações/exonerações de uma pessoa no DOU.
 * Shortcut otimizado para o caso de uso principal do Polígrafo:
 * detectar nomeação de familiares/sócios em cargos comissionados.
 */
export async function buscarNomeacoesDOU(
	nomeCompleto: string,
	periodo = "ANO",
): Promise<ResultadoDOU> {
	return buscarDOU({
		termo: `"${nomeCompleto}"`, // Busca exata (entre aspas)
		secao: "SECAO_2", // Seção 2 = atos de pessoal
		periodo,
		campo: "TUDO",
		tamanho: 10,
		timeout: 10000,
	});
}
