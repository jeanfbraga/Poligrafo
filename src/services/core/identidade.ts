/**
 * Identidade verificada (v1) — quem é a pessoa investigada, com que
 * documento e com que confiança. Ver nota 31 do Obsidian.
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
 *  - CPF oficial da casa (Câmara) > documento da ref escolhida > TSE;
 *  - CPF do TSE diferente do oficial = conflito: os dados do TSE não são usados;
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

export interface EntradaIdentidade {
	/** CPF vindo da API oficial da casa (hoje só a Câmara expõe). */
	cpfOficial?: string | null;
	/** Documento embutido na ref escolhida pelo usuário (TSE/assembleia). */
	docDaRef?: string | null;
	/** Resultado do TSE consultado com cargo e UF do alvo. */
	tse?: DadosTseIdentidade | null;
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
	evidencias: string[];
	conflitos: string[];
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

/** CPF com maior precedência: oficial da casa > ref escolhida > TSE. */
function escolherCpf(e: EntradaIdentidade, cpfTse: string | null): Base {
	if (cpfValido(e.cpfOficial)) return { cpf: soDigitos(e.cpfOficial), fonte: "CPF da API oficial da casa legislativa" };
	if (cpfValido(e.docDaRef)) return { cpf: soDigitos(e.docDaRef), fonte: "CPF da referência escolhida (lista oficial/TSE)" };
	if (cpfTse) return { cpf: cpfTse, fonte: "CPF do TSE (consulta por cargo e UF)" };
	return { cpf: null, fonte: "" };
}

function avaliarTse(cpf: string | null, cpfTse: string | null, tse: DadosTseIdentidade | null | undefined) {
	if (!tse) return { usar: false, evidencia: "TSE sem resultado", conflito: null };
	if (cpf && cpfTse && cpf !== cpfTse) {
		return { usar: false, evidencia: "", conflito: "CPF do TSE diferente do CPF oficial: dados do TSE descartados (possível homônimo)" };
	}
	if (cpf && cpfTse === cpf) return { usar: true, evidencia: "TSE confere com o CPF", conflito: null };
	return { usar: true, evidencia: "TSE sem CPF para conferir (casado por nome, cargo e UF)", conflito: null };
}

/**
 * O CPF escolhido vem sempre de fonte por cargo/UF ou oficial (nunca só por
 * nome), então é "alta". Um conflito com o TSE derruba os dados do TSE, não
 * o CPF oficial.
 */
function nivel(cpf: string | null, cnpj: string | null): Confianca {
	if (cpf) return "alta";
	if (cnpj) return "media";
	return "baixa";
}

export function resolverIdentidade(e: EntradaIdentidade): IdentidadeVerificada {
	const cpfTse = cpfDoTse(e.tse);
	const { cpf, fonte } = escolherCpf(e, cpfTse);
	const tse = avaliarTse(cpf, cpfTse, e.tse);
	const cnpjCampanha = cnpjDoTse(e.tse) ?? (cnpjValido(e.docDaRef) ? soDigitos(e.docDaRef) : null);
	const conflitos = tse.conflito ? [tse.conflito] : [];
	const evidencias = [fonte, tse.evidencia].filter(Boolean);
	if (!cpf && cnpjCampanha) evidencias.push("Só o CNPJ de campanha está disponível");
	return {
		cpf,
		cnpjCampanha,
		documento: cpf ?? cnpjCampanha,
		documentoIsCnpj: !cpf && Boolean(cnpjCampanha),
		confianca: nivel(cpf, cnpjCampanha),
		usarDadosTse: tse.usar,
		evidencias,
		conflitos,
	};
}

/** Fontes consultadas por CPF (sanções, TCU, DataJud, cartão…) exigem confiança alta. */
export function podeConsultarPorCpf(id: IdentidadeVerificada): boolean {
	return id.confianca === "alta" && Boolean(id.cpf);
}
