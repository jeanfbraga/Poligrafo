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

function extrairSiglaFrente(raw: string): string | undefined {
	const matchParen = raw.match(/\((?:FRENTE\s+)?([A-Z0-9\-_]{2,12})\)/i);
	if (matchParen?.[1]) return matchParen[1].toUpperCase();

	const matchHifen = raw.match(/-\s*([A-Z0-9\-_]{2,10})$/);
	if (matchHifen?.[1]) return matchHifen[1].toUpperCase();

	return undefined;
}

function limparLabelFrente(raw: string): string {
	let label = raw
		.replace(/\([A-Z0-9\-_]+\)/gi, "")
		.replace(/-\s*[A-Z0-9\-_]+$/gi, "")
		.replace(/^Frente\s+Parlamentar\s+(Mista\s+)?/i, "")
		.replace(/^(em\s+Defesa\s+d[ao]s?\s+|em\s+Apoio\s+([àa]s?|d[ao]s?)\s+|para\s+o?\s+|d[ao]s?\s+|pelo\s+|pela\s+|pr[oó]-?\s*)/i, "")
		.trim();

	if (!label || label.length < 2) {
		label = raw.replace(/^Frente\s+Parlamentar\s+/i, "").trim() || raw;
	}

	return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Formata e limpa o nome da frente parlamentar removendo prefixos burocráticos
 */
export function formatarNomeFrente(frenteInput: string | any): FrenteFormatada {
	const raw = typeof frenteInput === "string" ? frenteInput : frenteInput?.titulo || frenteInput?.nome || String(frenteInput || "");
	
	if (!raw || raw.trim() === "") {
		return { raw: "", label: "Frente Parlamentar", isMista: false, tema: "Outras Pautas" };
	}

	return {
		raw,
		label: limparLabelFrente(raw),
		sigla: extrairSiglaFrente(raw),
		isMista: /mista/i.test(raw),
		tema: identificarTemaFrente(raw),
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

function determinarSiglaComissao(comissaoInput: any, norm: string): string | undefined {
	if (typeof comissaoInput === "object" && comissaoInput?.siglaOrgao) {
		return comissaoInput.siglaOrgao;
	}
	for (const [termo, s] of Object.entries(SIGLAS_COMISSOES_CONHECIDAS)) {
		if (norm.includes(termo)) return s;
	}
	return undefined;
}

function determinarTipoComissao(norm: string): ComissaoFormatada["tipo"] {
	if (/cpi\b|comissao parlamentar de inquerito/i.test(norm)) return "CPI";
	if (/especial/i.test(norm)) return "Especial";
	if (/externa/i.test(norm)) return "Externa";
	if (/conselho de etica/i.test(norm)) return "Conselho";
	if (/mista/i.test(norm)) return "Mista";
	if (!/comissao\s+(de|do|da|permanente)?/i.test(norm)) return "Outro";
	return "Permanente";
}

function determinarCargoComissao(comissaoInput: any, raw: string): ComissaoFormatada["cargo"] {
	const fonte = typeof comissaoInput === "object" && comissaoInput?.titulo ? comissaoInput.titulo : raw;
	const norm = normalizarTexto(fonte);

	if (norm.includes("vice")) return "Vice-Presidente";
	if (norm.includes("presidente")) return "Presidente";
	if (norm.includes("relator")) return "Relator";
	if (norm.includes("suplente")) return "Suplente";
	return "Titular";
}

function limparNomeComissao(raw: string): string {
	const limpo = raw
		.replace(/^\[.*?\]\s*/, "")
		.replace(/^Comiss[aã]o\s+(Permanente\s+|Especial\s+|Externa\s+|Mista\s+)?(destinada\s+a\s+|de\s+|do\s+|da\s+)?/i, "")
		.replace(/^CPI\s*-\s*/i, "")
		.trim();

	const final = limpo.charAt(0).toUpperCase() + limpo.slice(1);
	return final || raw;
}

const CARGOS_DESTAQUE = new Set(["Presidente", "Vice-Presidente", "Relator"]);
const TIPOS_DESTAQUE = new Set(["CPI", "Conselho"]);

function isComissaoDestaque(cargo?: string, tipo?: string) {
	return CARGOS_DESTAQUE.has(cargo || "") || TIPOS_DESTAQUE.has(tipo || "");
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
	const sigla = determinarSiglaComissao(comissaoInput, norm);
	const tipo = determinarTipoComissao(norm);
	const cargo = determinarCargoComissao(comissaoInput, raw);
	const destaque = isComissaoDestaque(cargo, tipo);

	return {
		raw,
		nome: limparNomeComissao(raw),
		sigla,
		tipo,
		cargo,
		destaque,
	};
}
