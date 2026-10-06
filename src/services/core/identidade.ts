/**
 * Identidade verificada — quem é a pessoa investigada, com que documento e
 * com que confiança. Ver nota 31 do Obsidian.
 *
 * Problemas que resolve (diagnóstico de 06/10/2026):
 *  - o CPF era adotado PELO NOME a partir de `tse_bens_historico` (primeira
 *    linha com as mesmas palavras, de qualquer UF/cargo) e usado em CGU,
 *    DataJud, TCU e cartão: homônimo virava alvo;
 *  - o TSE sobrescrevia nome civil, patrimônio e foto sem conferir se o CPF
 *    batia com o da Câmara;
 *  - CPF mascarado passava como documento.
 *
 * Regras:
 *  - documento só com dígito verificador válido (src/lib/documento.ts);
 *  - CPF oficial da casa (Câmara) > documento da ref escolhida > base de
 *    eleitos (tse_eleitos, Banco de Perfil) > TSE ao vivo;
 *  - CPF do TSE diferente do oficial = conflito: os dados do TSE não são usados;
 *  - v2: o eleito da ref (número do candidato) confere o nome do TSE ao vivo —
 *    nome diferente = homônimo, dados descartados. Sem CPF público (o TSE
 *    mascara o CPF de 2024), o número do candidato dá confiança média;
 *  - nunca adota CPF achado só pelo nome.
 */
import { cnpjValido, cpfValido, soDigitos } from "@/lib/documento";

export type Confianca = "alta" | "media" | "baixa";

export interface DadosTseIdentidade {
	cpf?: string | null;
	documentoPrincipal?: string | null;
	cnpjCampanha?: string | null;
	isCnpj?: boolean;
	nome?: string;
}

/** Linha da base tse_eleitos achada pelo documento da ref (número do candidato ou CPF). */
export interface EleitoIdentidade {
	sq_candidato: string;
	nr_cpf_candidato?: string | null;
	nm_candidato: string;
	ds_cargo?: string | null;
	nm_ue?: string | null;
	ano_eleicao?: number;
}

export interface EntradaIdentidade {
	/** CPF vindo da API oficial da casa (hoje só a Câmara expõe). */
	cpfOficial?: string | null;
	/** Documento embutido na ref escolhida pelo usuário (TSE/assembleia). */
	docDaRef?: string | null;
	/** Resultado do TSE consultado com cargo e UF do alvo. */
	tse?: DadosTseIdentidade | null;
	/** Eleito da base tse_eleitos (Banco de Perfil) correspondente à ref. */
	eleito?: EleitoIdentidade | null;
}

export interface IdentidadeVerificada {
	/** CPF válido da pessoa (ou null). */
	cpf: string | null;
	/** CNPJ do comitê de campanha (nunca é "empresa do político"). */
	cnpjCampanha: string | null;
	/** Documento usado pelo pipeline: CPF, senão CNPJ de campanha, senão null. */
	documento: string | null;
	documentoIsCnpj: boolean;
	confianca: Confianca;
	/** Os dados do TSE (nome civil, patrimônio, foto) são da mesma pessoa. */
	usarDadosTse: boolean;
	/** Número do candidato no TSE (sq_candidato), quando a base de eleitos confirmou. */
	sqCandidato: string | null;
	evidencias: string[];
	conflitos: string[];
}

function cpfOuNulo(valor: unknown): string | null {
	return cpfValido(valor) ? soDigitos(valor) : null;
}

function cpfDoTse(tse: DadosTseIdentidade | null | undefined): string | null {
	const candidatos = [tse?.cpf, tse?.isCnpj ? null : tse?.documentoPrincipal];
	const valido = candidatos.find((c) => cpfValido(c));
	return valido ? soDigitos(valido) : null;
}

function cnpjDoTse(tse: DadosTseIdentidade | null | undefined): string | null {
	const candidatos = [tse?.cnpjCampanha, tse?.isCnpj ? tse?.documentoPrincipal : null];
	const valido = candidatos.find((c) => cnpjValido(c));
	return valido ? soDigitos(valido) : null;
}

interface Base {
	cpf: string | null;
	fonte: string;
}

/** CPF com maior precedência: oficial da casa > ref escolhida > base de eleitos > TSE ao vivo. */
function escolherCpf(e: EntradaIdentidade, cpfTse: string | null): Base {
	const ordem: [string | null, string][] = [
		[cpfOuNulo(e.cpfOficial), "CPF da API oficial da casa legislativa"],
		[cpfOuNulo(e.docDaRef), "CPF da referência escolhida (lista oficial/TSE)"],
		[cpfOuNulo(e.eleito?.nr_cpf_candidato), "CPF do candidato eleito (base de eleitos do TSE)"],
		[cpfTse, "CPF do TSE (consulta por cargo e UF)"],
	];
	const achado = ordem.find(([cpf]) => cpf);
	return achado ? { cpf: achado[0], fonte: achado[1] } : { cpf: null, fonte: "" };
}

function normalizarNome(nome: string | undefined): string {
	return String(nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** O TSE ao vivo devolveu outra pessoa (nome civil diferente do eleito da ref)? */
function tseDivergeDoEleito(eleito: EleitoIdentidade | null | undefined, tse: DadosTseIdentidade | null | undefined): boolean {
	if (!eleito || !tse?.nome) return false;
	return normalizarNome(tse.nome) !== normalizarNome(eleito.nm_candidato);
}

function avaliarTse(cpf: string | null, cpfTse: string | null, e: EntradaIdentidade) {
	const tse = e.tse;
	if (!tse) return { usar: false, evidencia: "TSE sem resultado", conflito: null };
	if (cpf && cpfTse && cpf !== cpfTse) {
		return { usar: false, evidencia: "", conflito: "CPF do TSE diferente do CPF oficial: dados do TSE descartados (possível homônimo)" };
	}
	if (cpf && cpfTse === cpf) return { usar: true, evidencia: "TSE confere com o CPF", conflito: null };
	if (tseDivergeDoEleito(e.eleito, tse)) {
		return { usar: false, evidencia: "", conflito: "Nome do TSE diferente do eleito escolhido: dados do TSE descartados (possível homônimo)" };
	}
	return { usar: true, evidencia: "TSE sem CPF para conferir (casado por nome, cargo e UF)", conflito: null };
}

function descreverEleito(eleito: EleitoIdentidade): string {
	const local = [eleito.ds_cargo, eleito.nm_ue].filter(Boolean).join(" — ");
	return `Eleito confirmado na base do TSE${eleito.ano_eleicao ? ` (${eleito.ano_eleicao})` : ""}${local ? `: ${local}` : ""}`;
}

/** Eleito da base com CPF diferente do escolhido = não é a mesma pessoa. */
function avaliarEleito(cpf: string | null, eleito: EleitoIdentidade | null | undefined) {
	if (!eleito) return { valido: false, evidencia: "", conflito: null };
	const cpfEleito = cpfOuNulo(eleito.nr_cpf_candidato);
	if (cpf && cpfEleito && cpf !== cpfEleito) {
		return { valido: false, evidencia: "", conflito: "CPF da base de eleitos diferente do CPF oficial: registro do eleito ignorado" };
	}
	return { valido: true, evidencia: descreverEleito(eleito), conflito: null };
}

/**
 * O CPF escolhido vem sempre de fonte por cargo/UF ou oficial (nunca só por
 * nome), então é "alta". Sem CPF, o número do candidato confirmado na base de
 * eleitos (ou o CNPJ de campanha) dá "média".
 */
function nivel(cpf: string | null, cnpj: string | null, eleitoValido: boolean): Confianca {
	if (cpf) return "alta";
	if (cnpj || eleitoValido) return "media";
	return "baixa";
}

export function resolverIdentidade(e: EntradaIdentidade): IdentidadeVerificada {
	const cpfTse = cpfDoTse(e.tse);
	const { cpf, fonte } = escolherCpf(e, cpfTse);
	const tse = avaliarTse(cpf, cpfTse, e);
	const eleito = avaliarEleito(cpf, e.eleito);
	const cnpjCampanha = cnpjDoTse(e.tse) ?? (cnpjValido(e.docDaRef) ? soDigitos(e.docDaRef) : null);
	const conflitos = [tse.conflito, eleito.conflito].filter((c): c is string => Boolean(c));
	const evidencias = [fonte, eleito.evidencia, tse.evidencia].filter(Boolean);
	if (!cpf && cnpjCampanha) evidencias.push("Só o CNPJ de campanha está disponível");
	return {
		cpf,
		cnpjCampanha,
		documento: cpf ?? cnpjCampanha,
		documentoIsCnpj: !cpf && Boolean(cnpjCampanha),
		confianca: nivel(cpf, cnpjCampanha, eleito.valido),
		usarDadosTse: tse.usar,
		sqCandidato: eleito.valido && e.eleito ? e.eleito.sq_candidato : null,
		evidencias,
		conflitos,
	};
}

/** Fontes consultadas por CPF (sanções, TCU, DataJud, cartão…) exigem confiança alta. */
export function podeConsultarPorCpf(id: IdentidadeVerificada): boolean {
	return id.confianca === "alta" && Boolean(id.cpf);
}
