/**
 * Lê a ref estruturada do alvo (vinda da busca, do índice ou da URL) e
 * devolve um formato único. Aceita os formatos antigos: o cache
 * `pesquisas.termo_busca` e `contagem_pesquisas.ref` guardam refs antigas.
 *
 * Formatos:
 *   FEDERAL:CAMARA:{id} · FEDERAL:SENADO:{id}
 *   ALERJ:DEPUTADO_ESTADUAL:{nome}:{doc} · ALESP:DEPUTADO_ESTADUAL:{nome}:{doc}
 *   ESTADUAL:{UF}:{doc}                       (deputado estadual/distrital pelo TSE)
 *   GOVERNADOR|PREFEITO|PRESIDENTE:{UF}:{nome}
 *   {UF}:PREFEITO|VEREADOR:{municipio}:{doc}
 *   SP|RJ:{x}:{municipio}:{id} e SP|RJ:{x}:{id}   (legado: vereador da capital)
 *
 * Bug corrigido: antes as refs `SP:`/`RJ:` eram testadas antes da genérica,
 * então `SP:PREFEITO:sao-paulo:...` virava vereador; e `ESTADUAL:` não tinha
 * tratamento (a investigação terminava em erro).
 */
import { casaDoVereador } from "./alcada";

export type AlvoRef =
	| { tipo: "CAMARA"; id: string }
	| { tipo: "SENADO"; id: string }
	| { tipo: "MUNICIPAL"; uf: string; cargo: "PREFEITO" | "VEREADOR"; municipio: string; doc: string }
	| { tipo: "ASSEMBLEIA"; uf: string; casa: "ALERJ" | "ALESP" | "ASSEMBLEIA_LEGISLATIVA"; nome?: string; doc: string }
	| { tipo: "EXECUTIVO"; cargo: "GOVERNADOR" | "PREFEITO" | "PRESIDENTE"; uf: string; nome: string }
	| { tipo: "DESCONHECIDA"; bruto: string };

function decodificar(texto: string | undefined): string | undefined {
	if (!texto) return undefined;
	let t = texto;
	for (let i = 0; i < 2 && t.includes("%"); i++) {
		try {
			t = decodeURIComponent(t);
		} catch {
			break;
		}
	}
	return t;
}

const CAPITAL_LEGADA: Record<string, string> = { SP: "sao-paulo", RJ: "rio-de-janeiro" };

type Leitor = [RegExp, (m: RegExpMatchArray) => AlvoRef];

const LEITORES: Leitor[] = [
	[/^FEDERAL:CAMARA:(.+)$/, (m) => ({ tipo: "CAMARA", id: m[1] })],
	[/^FEDERAL:SENADO:(.+)$/, (m) => ({ tipo: "SENADO", id: m[1] })],
	[/^(ALERJ|ALESP):[^:]*:?([^:]*):?(.*)$/, (m) => ({
		tipo: "ASSEMBLEIA", uf: m[1] === "ALERJ" ? "RJ" : "SP", casa: m[1] as "ALERJ" | "ALESP",
		nome: decodificar(m[2]), doc: m[3] ?? "",
	})],
	[/^ESTADUAL:([A-Z]{2}):(.+)$/, (m) => ({ tipo: "ASSEMBLEIA", uf: m[1], casa: "ASSEMBLEIA_LEGISLATIVA", doc: m[2] })],
	[/^(GOVERNADOR|PREFEITO|PRESIDENTE):([^:]*):?(.*)$/, (m) => ({
		tipo: "EXECUTIVO", cargo: m[1] as "GOVERNADOR" | "PREFEITO" | "PRESIDENTE",
		uf: (m[2] || "BR").toUpperCase(), nome: decodificar(m[3]) ?? "",
	})],
	// Genérica ANTES do legado de SP/RJ (era a causa do prefeito virar vereador).
	[/^([A-Z]{2}):(PREFEITO|VEREADOR):([^:]*):?(.*)$/, (m) => ({
		tipo: "MUNICIPAL", uf: m[1], cargo: m[2] as "PREFEITO" | "VEREADOR", municipio: m[3], doc: m[4] ?? "",
	})],
	[/^(SP|RJ):[^:]*:([^:]+):(.+)$/, (m) => ({ tipo: "MUNICIPAL", uf: m[1], cargo: "VEREADOR", municipio: m[2], doc: m[3] })],
	[/^(SP|RJ):[^:]*:([^:]+)$/, (m) => ({
		tipo: "MUNICIPAL", uf: m[1], cargo: "VEREADOR", municipio: CAPITAL_LEGADA[m[1]], doc: m[2],
	})],
];

export function interpretarRef(ref: string | null | undefined): AlvoRef {
	const bruto = String(ref ?? "").trim();
	for (const [regex, montar] of LEITORES) {
		const m = bruto.match(regex);
		if (m) return montar(m);
	}
	return { tipo: "DESCONHECIDA", bruto };
}

const URL_ASSEMBLEIA: Record<string, string> = {
	ALERJ: "https://www.alerj.rj.gov.br/Deputados/QuemSao",
	ALESP: "https://www.al.sp.gov.br/alesp/deputados",
	ASSEMBLEIA_LEGISLATIVA: "",
};

/**
 * Monta o "deputadoBasico" para refs que não precisam de consulta externa
 * (municipais e assembleias). Câmara, Senado e Executivo continuam no
 * orquestrador porque consultam índice/API/TSE.
 */
export function alvoLocalDaRef(ref: AlvoRef, nomeFallback: string): Record<string, any> | null {
	if (ref.tipo === "MUNICIPAL") {
		return {
			id: ref.doc || nomeFallback,
			uri: ref.municipio,
			nome: nomeFallback.toUpperCase(),
			uf: ref.uf,
			idLegislatura: 2024,
			casa: ref.cargo === "PREFEITO" ? "PREFEITURA" : casaDoVereador(ref.municipio),
			// Município de atuação (slug) — usado por SICONFI/FNDE/TransfereGov
			_nomeMunicipio: ref.municipio ? ref.municipio.replace(/-/g, " ") : undefined,
		};
	}
	if (ref.tipo === "ASSEMBLEIA") {
		const nome = ref.nome || nomeFallback.toUpperCase();
		return {
			id: ref.doc || nome,
			uri: URL_ASSEMBLEIA[ref.casa],
			nome,
			uf: ref.uf,
			idLegislatura: 2023,
			casa: ref.casa,
		};
	}
	return null;
}
