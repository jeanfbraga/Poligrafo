import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Normaliza qualquer nome de político / termo de busca para caixa normal (Title Case).
 * Exemplo:
 * - "giordano" -> "Giordano"
 * - "rafael brito" -> "Rafael Brito"
 * - "GUILHERME BOULOS" -> "Guilherme Boulos"
 * - "luiz philippe de orleans" -> "Luiz Philippe de Orleans"
 */
export function formatName(name: string): string {
	if (!name) return "";
	const trimmed = name.trim();

	return trimmed
		.split(/\s+/)
		.map((word) => {
			if (!word) return "";
			const lower = word.toLowerCase();
			// Preposições em minúsculo
			if (["de", "da", "do", "dos", "das", "e"].includes(lower)) {
				return lower;
			}
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.join(" ");
}

interface PortalFallback {
	mensagem: string;
	link: string;
	textoLink: string;
}

const PORTAL_FALLBACKS: Record<string, PortalFallback> = {
	CAMARA: {
		mensagem: "A Câmara dos Deputados não disponibilizou o link direto desta nota fiscal eletrônica.",
		link: "https://dadosabertos.camara.leg.br/",
		textoLink: "Portal de Dados da Câmara",
	},
	SENADO: {
		mensagem: "O Senado Federal não disponibiliza o link direto do documento fiscal em sua API de Dados Abertos.",
		link: "https://www12.senado.leg.br/transparencia",
		textoLink: "Portal do Senado",
	},
	ALERJ: {
		mensagem: "A ALERJ não disponibilizou o link direto desta nota fiscal na consulta.",
		link: "https://www.alerj.rj.gov.br/Transparencia/",
		textoLink: "Transparência ALERJ",
	},
	ALESP: {
		mensagem: "A ALESP não disponibilizou o link direto desta nota fiscal na consulta.",
		link: "https://www.al.sp.gov.br/transparencia/",
		textoLink: "Transparência ALESP",
	},
};

export function getPortalTransparenciaFallback(casa?: string, uri?: string): PortalFallback {
	if (casa && PORTAL_FALLBACKS[casa]) {
		return PORTAL_FALLBACKS[casa];
	}

	if (casa === "PREFEITURA" || casa === "GOVERNO_ESTADUAL") {
		return {
			mensagem: "O portal do executivo não disponibilizou o link direto deste documento.",
			link: uri || "#",
			textoLink: "Portal da Transparência",
		};
	}

	if (casa?.startsWith("CAMARA_MUNICIPAL_")) {
		return {
			mensagem: "O portal legislativo municipal não forneceu o link do documento fiscal.",
			link: uri || "#",
			textoLink: "Busque no portal da Câmara de seu município",
		};
	}

	return {
		mensagem: "O documento fiscal não possui link público de acesso direto disponível.",
		link: uri || "https://portaldatransparencia.gov.br/",
		textoLink: "Portal da Transparência",
	};
}

function parseIsoDate(datePart: string): string | null {
	if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
		const [y, m, d] = datePart.split("-");
		return `${d}/${m}/${y}`;
	}
	return null;
}

function parseDateObjectFallback(datePart: string, rawStr: string): string | null {
	const parsed = new Date(datePart.includes("-") ? datePart : rawStr);
	if (!isNaN(parsed.getTime())) {
		const formatted = parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" });
		if (formatted !== "Invalid Date") return formatted;
	}
	return null;
}

/**
 * Formata qualquer string de data para formato legível (DD/MM/YYYY) descartando horários/timestamps.
 */
export function formatDateOnly(dateStr?: string | null): string {
	if (!dateStr) return "DATA INDISPONÍVEL";
	const str = String(dateStr).trim();
	if (!str) return "DATA INDISPONÍVEL";
	if (str.includes(" a ")) return str;

	const datePart = str.includes("T") ? str.split("T")[0] : str.split(" ")[0];
	if (/^\d{2}\/\d{2}\/\d{4}$/.test(datePart)) return datePart;

	return parseIsoDate(datePart) || parseDateObjectFallback(datePart, str) || datePart;
}

export function formatCurrency(value: number | string | null | undefined): string {
	if (value == null) return "R$ 0,00";
	const numericValue = typeof value === "string" ? parseFloat(value) : value;
	if (isNaN(numericValue)) return "R$ 0,00";

	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(numericValue);
}

function getIdFromPoliticoOriginal(data?: any): string | null {
	if (!data?.idPoliticoOriginal) return null;
	const str = String(data.idPoliticoOriginal);
	return /^\d+$/.test(str) ? str : null;
}

function getIdFromRef(data?: any): string | null {
	if (!data?.ref) return null;
	const parts = String(data.ref).split(":");
	const last = parts[parts.length - 1];
	return /^\d+$/.test(last) ? last : null;
}

function getIdFromDirectId(data?: any, nodeId?: string): string | null {
	if (nodeId && /^\d+$/.test(nodeId)) return nodeId;
	if (data?.id && /^\d+$/.test(String(data.id))) return String(data.id);
	return null;
}

function getIdFromPessoaPrefix(data?: any, nodeId?: string): string | null {
	const candidateId = nodeId || (data?.id ? String(data.id) : "");
	const match = candidateId.match(/^pessoa-(\d+)$/i);
	return match ? match[1] : null;
}

function getIdFromPhotoUrl(data?: any): string | null {
	const fotoUrl = extractDeputyPhotoUrl(data);
	const match = fotoUrl.match(/bandep\/(\d+)\.jpg/i);
	return match ? match[1] : null;
}

/**
 * Extrai o ID numérico canônico do deputado federal para links de perfil.
 * Decomposto em helpers especializados garantindo complexidade ciclomática < 10.
 */
export function extractDeputyId(data?: any, nodeId?: string): string | null {
	if (!data && !nodeId) return null;

	return (
		getIdFromPoliticoOriginal(data) ||
		getIdFromRef(data) ||
		getIdFromDirectId(data, nodeId) ||
		getIdFromPessoaPrefix(data, nodeId) ||
		getIdFromPhotoUrl(data)
	);
}

/**
 * Retorna a melhor URL de foto disponível para repassar no query param.
 */
export function extractDeputyPhotoUrl(data?: any): string {
	if (!data) return "";
	const candidates = [data.urlFoto, data.urlFotoFallback, data.foto, data.fotoFallback];
	const found = candidates.find((url) => typeof url === "string" && url.trim().length > 0);
	return found || "";
}

export function sanitizarIdDeputado(id: any): number {
	const cleanStr = String(id || "").replace(/\D/g, "");
	return Number(cleanStr) || 0;
}

export function criarNodeResumoCeap(
	pessoaId: string,
	casa: string,
	despesas: any[]
): any {
	const totalGasto = despesas.reduce(
		(acc: number, d: any) =>
			acc + (Number(d.valorDocumento ?? d.valorLiquido ?? d.valor ?? 0) || 0),
		0
	);
	const valorFmt = totalGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

	return {
		id: `ceap-resumo-${pessoaId}`,
		type: "CEAP_RESUMO",
		_origemId: pessoaId,
		data: {
			label: `COTA PARLAMENTAR (${despesas.length} NOTAS AUDITADAS)`,
			totalNotas: despesas.length,
			totalAuditado: totalGasto,
			valorFormatado: `R$ ${valorFmt}`,
			casa: casa || "CAMARA",
			alertas: [
				`${despesas.length} despesas da cota parlamentar auditadas.`,
				`Total amostrado: R$ ${valorFmt}`,
			],
			score_letalidade: 10,
		},
	};
}

/**
 * Retorna o primeiro valor definido e não vazio da lista de candidatos.
 * Complexidade ciclomática estrita: 3.
 */
export function primeiroValorTexto(...valores: any[]): string {
	for (const v of valores) {
		if (v !== undefined && v !== null && String(v).trim().length > 0) {
			return String(v);
		}
	}
	return "";
}

/**
 * Retorna o primeiro valor numérico válido da lista de candidatos.
 * Complexidade ciclomática estrita: 4.
 */
export function primeiroValorNumero(...valores: any[]): number {
	for (const v of valores) {
		if (v !== undefined && v !== null) {
			const parsed = parseFloat(String(v));
			if (!Number.isNaN(parsed)) return parsed;
		}
	}
	return 0;
}


