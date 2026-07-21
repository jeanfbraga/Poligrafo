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
