/**
 * parlamentar-utils.ts
 * Utilitários para normalização semântica, limpeza e clusterização temática de
 * Comissões e Frentes Parlamentares do Congresso Nacional.
 */

export interface FrenteFormatada {
	raw: string;
	label: string;
	sigla?: string;
	isMista: boolean;
	tema: string;
}

export interface ComissaoFormatada {
	raw: string;
	nome: string;
	sigla?: string;
	tipo: "Permanente" | "Especial" | "CPI" | "Externa" | "Conselho" | "Mista" | "Outro";
	cargo?: "Presidente" | "Vice-Presidente" | "Relator" | "Titular" | "Suplente" | "Membro";
	destaque: boolean;
}

// Mapa de siglas conhecidas das comissões permanentes da Câmara
const SIGLAS_COMISSOES_CONHECIDAS: Record<string, string> = {
	"constituicao e justica": "CCJC",
	"constituicao, justica": "CCJC",
	"financas e tributacao": "CFT",
	"fiscalizacao financeira e controle": "CFFC",
	"meio ambiente e desenvolvimento sustentavel": "CMA",
	"meio ambiente": "CMA",
	"seguranca publica e combate ao crime organizado": "CSPCCO",
	"seguranca publica": "CSPCCO",
	"educacao": "CE",
	"saude": "CSAÚDE",
	"seguridade social e familia": "CSSF",
	"agricultura, pecuaria, abastecimento e desenvolvimento rural": "CAPADR",
	"agricultura e pecuaria": "CAPADR",
	"relacoes exteriores e de defesa nacional": "CREDN",
	"direitos humanos, minorias e igualdade racial": "CDHMIR",
	"direitos humanos e minorias": "CDHM",
	"desenvolvimento economico": "CDE",
	"industria, comercio e servicos": "CICS",
	"trabalho": "CTRAB",
	"viacao e transportes": "CVT",
	"minas e energia": "CME",
	"ciencia, tecnologia e inovacao": "CCTI",
	"comunicacao": "CCOM",
	"defesa dos direitos da mulher": "CMULHER",
	"defesa dos direitos da pessoa idosa": "CIDOSO",
	"defesa dos direitos das pessoas com deficiencia": "CPDEF",
	"conselho de etica e decoro parlamentar": "CEDP",
};

/**
 * Remove acentos e normaliza string para comparação
 */
function normalizarTexto(txt: string): string {
	return txt
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim();
}

/**
 * Formata e limpa o nome da frente parlamentar removendo prefixos burocráticos
 */
export function formatarNomeFrente(frenteInput: string | any): FrenteFormatada {
	const raw = typeof frenteInput === "string" ? frenteInput : frenteInput?.titulo || frenteInput?.nome || String(frenteInput || "");
	
	if (!raw || raw.trim() === "") {
		return { raw: "", label: "Frente Parlamentar", isMista: false, tema: "Outras Pautas" };
	}

	const isMista = /mista/i.test(raw);

	// Extrai sigla entre parênteses ou após hífen (ex: "FPA", "FRENCOOP")
	let sigla: string | undefined;
	const matchParen = raw.match(/\((?:FRENTE\s+)?([A-Z0-9\-_]{2,12})\)/i);
	if (matchParen && matchParen[1]) {
		sigla = matchParen[1].toUpperCase();
	} else {
		const matchHifen = raw.match(/-\s*([A-Z0-9\-_]{2,10})$/);
		if (matchHifen && matchHifen[1]) {
			sigla = matchHifen[1].toUpperCase();
		}
	}

	// Remove prefixos burocráticos repetitivos
	let label = raw
		.replace(/\([A-Z0-9\-_]+\)/gi, "")
		.replace(/-\s*[A-Z0-9\-_]+$/gi, "")
		.replace(/^Frente\s+Parlamentar\s+(Mista\s+)?/i, "")
		.replace(/^(em\s+Defesa\s+d[ao]s?\s+|em\s+Apoio\s+([àa]s?|d[ao]s?)\s+|para\s+o?\s+|d[ao]s?\s+|pelo\s+|pela\s+|pr[oó]-?\s*)/i, "")
		.trim();

	if (!label || label.length < 2) {
		label = raw.replace(/^Frente\s+Parlamentar\s+/i, "").trim() || raw;
	}

	// Capitalização da primeira letra
	label = label.charAt(0).toUpperCase() + label.slice(1);

	// Classificação temática
	const tema = identificarTemaFrente(raw);

	return {
		raw,
		label,
		sigla,
		isMista,
		tema,
	};
}

/**
 * Identifica o eixo temático da frente para agrupamento tático
 */
export function identificarTemaFrente(texto: string): string {
	// Remove expressões comuns como "em defesa d..." antes de classificar
	const textoLimpo = texto
		.replace(/^Frente\s+Parlamentar\s+(Mista\s+)?(em\s+Defesa\s+d[ao]s?\s+|em\s+Apoio\s+([àa]s?|d[ao]s?)\s+|para\s+o?\s+|d[ao]s?\s+|pelo\s+|pela\s+|pr[oó]-?\s*)/i, "")
		.trim();
	const norm = normalizarTexto(textoLimpo);

	if (/agro|rural|pecuaria|ambiental|florest|pesca|hidric|agronegocio|cafe|graos|soja|leite|cana|irrigacao|clima|amazonia|cerrado|pantanal|indigena/i.test(norm)) {
		return "Agro & Meio Ambiente";
	}
	if (/saude|medicin|hospital|enfermagem|farmaceut|doencas|cancer|vacina|mental|odontologia|terapia|upa|sus/i.test(norm)) {
		return "Saúde & Assistência";
	}
	if (/educa|escola|universidad|ensino|cientific|pesquisa|professor|tecnico|estudante|infancia|primeira infancia/i.test(norm)) {
		return "Educação & Ciência";
	}
	if (/seguran|polici|defesa nacional|defesa civil|armas|penal|militar|fronteira|bombeir|guarda municipal|penitenciari|combate ao crime|exercito|marinha|aeronautica/i.test(norm)) {
		return "Segurança & Defesa";
	}
	if (/econom|tribut|empree|comerci|industr|tecnolog|mercado|livre mercado|inovacao|startups|financas|turismo|servicos|portos|logistica|infraestrutura|mineracao|energia|petroleo/i.test(norm)) {
		return "Economia & Mercado";
	}
	if (/direitos humanos|mulher|idoso|deficiencia|familia|cultura|religio|evangelic|catolic|igualdade|racismo|lgbt|esporte|comunidade/i.test(norm)) {
		return "Direitos & Cidadania";
	}
	if (/servidor|publico|carreiras|estado|auditor|advocacia|oab|judiciario|magistratura|ministerio publico|municip|prefeitos|vereadores|reforma administrativa/i.test(norm)) {
		return "Gestão Pública & Carreiras";
	}

	return "Outras Pautas";
}

/**
 * Agrupa uma lista de frentes parlamentares em dicionário temático
 */
export function agruparFrentesPorTema(frentes: (string | any)[]): Record<string, FrenteFormatada[]> {
	const grupos: Record<string, FrenteFormatada[]> = {
		"Agro & Meio Ambiente": [],
		"Economia & Mercado": [],
		"Segurança & Defesa": [],
		"Saúde & Assistência": [],
		"Educação & Ciência": [],
		"Direitos & Cidadania": [],
		"Gestão Pública & Carreiras": [],
		"Outras Pautas": [],
	};

	for (const item of frentes) {
		if (!item) continue;
		const f = formatarNomeFrente(item);
		if (grupos[f.tema]) {
			grupos[f.tema].push(f);
		} else {
			grupos["Outras Pautas"].push(f);
		}
	}

	// Remove temas vazios
	const resultado: Record<string, FrenteFormatada[]> = {};
	for (const [tema, lista] of Object.entries(grupos)) {
		if (lista.length > 0) {
			resultado[tema] = lista;
		}
	}

	return resultado;
}

/**
 * Formata e normaliza os dados de comissões legislativas
 */
export function formatarComissao(comissaoInput: string | any): ComissaoFormatada {
	const raw = typeof comissaoInput === "string" ? comissaoInput : comissaoInput?.nomeOrgao || comissaoInput?.nome || String(comissaoInput || "");
	
	if (!raw || raw.trim() === "") {
		return { raw: "", nome: "Comissão Legislativa", tipo: "Outro", destaque: false };
	}

	const norm = normalizarTexto(raw);

	// 1. Determina Sigla
	let sigla: string | undefined = typeof comissaoInput === "object" ? comissaoInput?.siglaOrgao : undefined;
	if (!sigla) {
		for (const [termo, s] of Object.entries(SIGLAS_COMISSOES_CONHECIDAS)) {
			if (norm.includes(termo)) {
				sigla = s;
				break;
			}
		}
	}

	// 2. Determina Tipo
	let tipo: ComissaoFormatada["tipo"] = "Permanente";
	if (/cpi\b|comissao parlamentar de inquerito/i.test(norm)) {
		tipo = "CPI";
	} else if (/especial/i.test(norm)) {
		tipo = "Especial";
	} else if (/externa/i.test(norm)) {
		tipo = "Externa";
	} else if (/conselho de etica/i.test(norm)) {
		tipo = "Conselho";
	} else if (/mista/i.test(norm)) {
		tipo = "Mista";
	} else if (!/comissao\s+(de|do|da|permanente)?/i.test(norm)) {
		tipo = "Outro";
	}

	// 3. Determina Cargo/Papel
	let cargo: ComissaoFormatada["cargo"] | undefined;
	if (typeof comissaoInput === "object" && comissaoInput?.titulo) {
		const tit = normalizarTexto(comissaoInput.titulo);
		if (tit.includes("presidente")) cargo = "Presidente";
		else if (tit.includes("vice")) cargo = "Vice-Presidente";
		else if (tit.includes("relator")) cargo = "Relator";
		else if (tit.includes("titular")) cargo = "Titular";
		else if (tit.includes("suplente")) cargo = "Suplente";
		else cargo = "Membro";
	} else {
		// Tenta inferir se houver no texto (ex: "[Titular] Comissão de...")
		if (/presidente/i.test(raw)) cargo = "Presidente";
		else if (/vice-?presidente/i.test(raw)) cargo = "Vice-Presidente";
		else if (/titular/i.test(raw)) cargo = "Titular";
		else if (/suplente/i.test(raw)) cargo = "Suplente";
	}

	// 4. Limpa Nome para leitura fluida
	let nomeLimpo = raw
		.replace(/^\[.*?\]\s*/, '')
		.replace(/^Comiss[aã]o\s+(Permanente\s+|Especial\s+|Externa\s+|Mista\s+)?(destinada\s+a\s+|de\s+|do\s+|da\s+)?/i, '')
		.replace(/^CPI\s*-\s*/i, '')
		.trim();

	nomeLimpo = nomeLimpo.charAt(0).toUpperCase() + nomeLimpo.slice(1);

	const destaque = cargo === "Presidente" || cargo === "Vice-Presidente" || cargo === "Relator" || tipo === "CPI" || tipo === "Conselho";

	return {
		raw,
		nome: nomeLimpo || raw,
		sigla,
		tipo,
		cargo: cargo || "Titular",
		destaque,
	};
}
