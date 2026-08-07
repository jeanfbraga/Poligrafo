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

export function getPortalTransparenciaFallback(casa?: string, uri?: string) {
	switch (casa) {
		case "CAMARA":
			return {
				mensagem:
					"A Câmara dos Deputados não disponibilizou o link direto desta nota fiscal eletrônica.",
				link: "https://dadosabertos.camara.leg.br/",
				textoLink: "Portal de Dados da Câmara",
			};
		case "SENADO":
			return {
				mensagem:
					"O Senado Federal não disponibiliza o link direto do documento fiscal em sua API de Dados Abertos.",
				link: "https://www12.senado.leg.br/transparencia",
				textoLink: "Portal do Senado",
			};
		case "ALERJ":
			return {
				mensagem:
					"A ALERJ não disponibilizou o link direto desta nota fiscal na consulta.",
				link: "https://www.alerj.rj.gov.br/Transparencia/",
				textoLink: "Transparência ALERJ",
			};
		case "ALESP":
			return {
				mensagem:
					"A ALESP não disponibilizou o link direto desta nota fiscal na consulta.",
				link: "https://www.al.sp.gov.br/transparencia/",
				textoLink: "Transparência ALESP",
			};
		case "PREFEITURA":
		case "GOVERNO_ESTADUAL":
			return {
				mensagem:
					"O portal do executivo não disponibilizou o link direto deste documento.",
				link: uri || "#",
				textoLink: "Portal da Transparência",
			};
		default:
			if (casa?.startsWith("CAMARA_MUNICIPAL_")) {
				return {
					mensagem:
						"O portal legislativo municipal não forneceu o link do documento fiscal.",
					link: uri || "#",
					textoLink: "Busque no portal da Câmara de seu município",
				};
			}
			return {
				mensagem:
					"O documento fiscal não possui link público de acesso direto disponível.",
				link: uri || "https://portaldatransparencia.gov.br/",
				textoLink: "Portal da Transparência",
			};
	}
}

/**
 * Formata qualquer string de data para formato legível (DD/MM/YYYY) descartando horários/timestamps (ex: "2025-12-16T00:00:00" -> "16/12/2025").
 */
export function formatDateOnly(dateStr?: string | null): string {
	if (!dateStr) return "DATA INDISPONÍVEL";
	const str = String(dateStr).trim();
	if (!str) return "DATA INDISPONÍVEL";

	// Se contiver intervalo (ex: "01/01/2024 a 31/12/2024")
	if (str.includes(" a ")) return str;

	// Separa e descarta a parte do horário ('T00:00:00' ou ' 00:00:00')
	const datePart = str.includes("T") ? str.split("T")[0] : str.split(" ")[0];

	// Se for ISO YYYY-MM-DD
	if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
		const [y, m, d] = datePart.split("-");
		return `${d}/${m}/${y}`;
	}

	// Se já for DD/MM/YYYY
	if (/^\d{2}\/\d{2}\/\d{4}$/.test(datePart)) {
		return datePart;
	}

	// Fallback via Date
	const parsed = new Date(datePart.includes("-") ? datePart : str);
	if (!isNaN(parsed.getTime())) {
		const formatted = parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" });
		if (formatted !== "Invalid Date") return formatted;
	}

	return datePart;
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
