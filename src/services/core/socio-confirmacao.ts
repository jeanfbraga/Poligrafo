/**
 * O político é mesmo sócio desta empresa? (identidade v2, nota 31 do Obsidian)
 *
 * A busca reversa por nome (socio-search.ts) acha empresas de homônimos. Antes
 * a empresa entrava quando o nome de algum sócio no QSA era igual ao do
 * político. Agora, com o CPF do político confirmado, o QSA da Receita ajuda:
 * ele mostra o CPF do sócio mascarado (`***456789**`), e os 6 dígitos do meio
 * precisam bater (ideia do `lgpd.py` do mcp-brasil, ao contrário: lá mascara,
 * aqui confere).
 *
 *  - nome igual + miolo do CPF igual → confirmado (forte);
 *  - nome igual + miolo diferente     → homônimo, descartado;
 *  - nome igual sem CPF para conferir → confirmado só pelo nome (como antes);
 *  - QSA vazio (MEI/empresário individual): razão social com o nome; se trouxer
 *    um CPF inteiro (padrão do MEI), ele precisa ser o do político.
 */
import { mioloCpf, soDigitos } from "@/lib/documento";
import { buscarDadosCnpj } from "@/services/integrations/receita/cnpj";

export interface SocioQsa {
	nome_socio?: string;
	cnpj_cpf_do_socio?: string;
	qualificacao_socio?: string;
	faixa_etaria?: string;
}

/** Campos da Receita no formato da BrasilAPI (o Minha Receita usa o mesmo; a ReceitaWS é convertida). */
export interface EmpresaQsa {
	razao_social?: string;
	nome_fantasia?: string;
	descricao_situacao_cadastral?: string;
	cnae_fiscal_descricao?: string;
	capital_social?: number;
	municipio?: string;
	uf?: string;
	qsa?: SocioQsa[];
}

export type ForcaVinculo = "CPF_E_NOME" | "NOME" | "RAZAO_SOCIAL";

export type Veredito =
	| { confirmado: true; forca: ForcaVinculo; motivo: string }
	| { confirmado: false; motivo: string };

export function normalizarNome(nome: string | null | undefined): string {
	return String(nome ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z0-9 ]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** "FULANO DE TAL (FULANINHO)" → ["FULANO DE TAL", "FULANINHO"]. */
function separarUrna(nome: string | null | undefined): string[] {
	const s = String(nome ?? "");
	return [s.replace(/\s*\([^)]*\)\s*/g, " "), s.match(/\(([^)]+)\)/)?.[1] ?? ""];
}

/** Nomes civil/urna do político normalizados; nomes curtos demais não servem para casar. */
export function nomesDeReferencia(nomes: (string | null | undefined)[]): string[] {
	return [...new Set(nomes.flatMap(separarUrna).map(normalizarNome).filter((n) => n.length > 5))];
}

function avaliarSocio(socio: SocioQsa, miolo: string | null): Veredito {
	const mioloSocio = mioloCpf(socio.cnpj_cpf_do_socio);
	if (miolo && mioloSocio && miolo !== mioloSocio) {
		return { confirmado: false, motivo: "nome igual, mas o CPF do sócio no QSA é de outra pessoa (homônimo)" };
	}
	if (miolo && mioloSocio) return { confirmado: true, forca: "CPF_E_NOME", motivo: "nome e CPF do sócio no QSA conferem com o político" };
	return { confirmado: true, forca: "NOME", motivo: "nome do sócio no QSA idêntico ao nome civil/urna do político (sem CPF para conferir)" };
}

/** MEI/empresário individual: razão social com o nome e, se houver, o CPF inteiro do político. */
function avaliarRazaoSocial(razao: string | undefined, nomes: string[], cpf: string | null): Veredito {
	const r = normalizarNome(razao);
	if (!nomes.some((n) => r.includes(n))) return { confirmado: false, motivo: "QSA vazio e razão social sem o nome do político" };
	const fim = String(razao ?? "").match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\s*$/)?.[1];
	const cpfNaRazao = fim ? soDigitos(fim) : null;
	if (cpf && cpfNaRazao && cpfNaRazao !== cpf) {
		return { confirmado: false, motivo: "razão social com o nome, mas com o CPF de outra pessoa (homônimo)" };
	}
	return { confirmado: true, forca: "RAZAO_SOCIAL", motivo: "empresa individual com o nome do político na razão social" };
}

export function confirmarVinculoSocietario(empresa: EmpresaQsa, nomes: string[], cpf: string | null): Veredito {
	const qsa = empresa.qsa ?? [];
	if (qsa.length === 0) return avaliarRazaoSocial(empresa.razao_social, nomes, cpf);
	const miolo = mioloCpf(cpf);
	const vereditos = qsa.filter((s) => nomes.includes(normalizarNome(s.nome_socio))).map((s) => avaliarSocio(s, miolo));
	const melhor = vereditos.find((v) => v.confirmado && v.forca === "CPF_E_NOME") ?? vereditos.find((v) => v.confirmado);
	return melhor ?? vereditos[0] ?? { confirmado: false, motivo: "nenhum sócio no QSA com o nome do político" };
}

/** Consulta o QSA (BrasilAPI, reserva Minha Receita, com cache) e decide. Falha na consulta = não confirmado. */
export async function verificarEmpresaDoPolitico(
	cnpj: string,
	nomes: string[],
	cpf: string | null,
	fetchFn?: typeof fetch,
): Promise<Veredito> {
	const r = await buscarDadosCnpj(cnpj, fetchFn);
	if (!r.ok) return { confirmado: false, motivo: `QSA indisponível (${r.motivo})` };
	return confirmarVinculoSocietario(r.dados, nomes, cpf);
}
