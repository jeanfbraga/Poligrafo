import * as cheerio from "cheerio";

const BASE_URL = "https://www.gov.br/saude/pt-br/composicao/denasus";
const ATIVIDADES_URL = `${BASE_URL}/criacao-de-atividades-de-auditoria`;
const USER_AGENT = "Poligrafo-Investigador/1.0";

export interface AtividadeAuditoria {
	titulo: string;
	data: string | null;
	uf: string | null;
	tipo: string;
	situacao: string;
	resumo: string | null;
	url_detalhe: string | null;
}

const UFS_BRASIL = new Set([
	"AC",
	"AL",
	"AP",
	"AM",
	"BA",
	"CE",
	"DF",
	"ES",
	"GO",
	"MA",
	"MT",
	"MS",
	"MG",
	"PA",
	"PB",
	"PR",
	"PE",
	"PI",
	"RJ",
	"RN",
	"RS",
	"RO",
	"RR",
	"SC",
	"SP",
	"SE",
	"TO",
]);

function extrairUF(titulo: string): string | null {
	const match = titulo.match(/\b([A-Z]{2})\b/);
	if (match && UFS_BRASIL.has(match[1])) {
		return match[1];
	}
	return null;
}

function classificarTipo(titulo: string): string {
	const lower = titulo.toLowerCase();
	if (lower.includes("auditoria")) return "Auditoria";
	if (lower.includes("verificação") || lower.includes("verificacao"))
		return "Verificação";
	if (lower.includes("monitoramento")) return "Monitoramento";
	if (lower.includes("inspeção") || lower.includes("inspecao"))
		return "Inspeção";
	return "Outro";
}

function encontrarItensHtml($: cheerio.CheerioAPI): {
	items: cheerio.Cheerio<any>;
	strategy: string;
} {
	const content = $("#content-core, #content, .documentContent");
	if (content.length > 0) {
		const h2s = content
			.find("h2")
			.filter((_, el) => $(el).find("a").length > 0);
		if (h2s.length > 0) return { items: h2s, strategy: "h2" };

		const dts = content
			.find("dt")
			.filter((_, el) => $(el).find("a").length > 0);
		if (dts.length > 0) return { items: dts, strategy: "dt" };
	}

	const headings = $("h2, h3").filter((_, el) => $(el).find("a").length > 0);
	if (headings.length > 0) return { items: headings, strategy: "h2" };

	return { items: $("article, .item-lista, .tileItem"), strategy: "legacy" };
}

function extrairDadosNextEl(nextEl: cheerio.Cheerio<any>) {
	if (nextEl.length > 0 && (nextEl.is("dd") || nextEl.is("p"))) {
		const text = nextEl.text().trim();
		const dateMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);
		return {
			dataText: dateMatch ? dateMatch[0] : null,
			resumoText: text.substring(0, 500),
		};
	}
	return { dataText: null, resumoText: null };
}

function resolveTituloEl($item: cheerio.Cheerio<any>, strategy: string) {
	if (strategy === "dt" || strategy === "h2") {
		const link = $item.find("a");
		if (link.length > 0) return link;
	}
	return $item.find("h2, h3, a").first();
}

function parseItemAtividade(
	$: cheerio.CheerioAPI,
	el: any,
	strategy: string,
): AtividadeAuditoria | null {
	const $item = $(el);
	const $tituloEl = resolveTituloEl($item, strategy);
	if ($tituloEl.length === 0) return null;

	const titulo = $tituloEl.text().trim();
	if (!titulo) return null;

	const href = $tituloEl.attr("href") || null;
	const { dataText, resumoText } = extrairDadosNextEl($item.next());

	return {
		titulo,
		data: dataText,
		uf: extrairUF(titulo),
		tipo: classificarTipo(titulo),
		situacao: "Concluída",
		resumo: resumoText,
		url_detalhe: href,
	};
}

export async function listarAtividadesAuditoria(): Promise<
	AtividadeAuditoria[]
> {
	try {
		const res = await fetch(ATIVIDADES_URL, {
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "text/html,application/xhtml+xml",
			},
			signal: AbortSignal.timeout(15000),
		});

		if (!res.ok) {
			console.warn(`[DENASUS] HTTP ${res.status} ao carregar atividades.`);
			return [];
		}

		const html = await res.text();
		const $ = cheerio.load(html);
		const atividades: AtividadeAuditoria[] = [];
		const { items, strategy } = encontrarItensHtml($);

		items.each((_, el) => {
			const item = parseItemAtividade($, el, strategy);
			if (item) atividades.push(item);
		});

		return atividades;
	} catch (e: any) {
		console.warn("[DENASUS] Falha ao listar atividades de auditoria:", e.message);
		return [];
	}
}
