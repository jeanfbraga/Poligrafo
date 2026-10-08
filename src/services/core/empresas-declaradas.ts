/**
 * Empresas que o próprio político declarou ao TSE (quotas e participações societárias).
 *
 * O vínculo político → empresa é a declaração dele; o risco está no CNPJ. Primeiro vale
 * a base socios_politicos (QSA do arquivo aberto da Receita, conferido por nome + CPF);
 * na reserva, a busca na web, que devolve páginas com vários CNPJs: só vale o candidato
 * cuja razão social tem todas as palavras do nome declarado E cujo quadro de sócios tem
 * o político (socio-confirmacao.ts). Sem isso o nó fica sem CNPJ e o drilldown procura
 * de novo, com a mesma conferência.
 *
 * Em 08/10/2026 qualquer bem com "ação", "capital" ou "empresa" no texto virava empresa
 * ("APLICAÇÃO FINANCEIRA DE RENDA FIXA", "TÍTULO DE CAPITALIZAÇÃO": 15 nós falsos num
 * deputado) e o primeiro CNPJ da página de busca era adotado sem conferência. Agora o
 * tipo do bem precisa ser de participação societária e a descrição precisa trazer um
 * nome próprio (as declarações de 2026 dizem só "PARTICIPAÇÃO SOCIETÁRIA EM EMPRESA PRIVADA").
 */
import { cnpjValido, soDigitos } from "@/lib/documento";
import { documentoFormatado } from "@/lib/format";
import { buscarDadosCnpj, type ResultadoCnpj } from "@/services/integrations/receita/cnpj";
import { type EmpresaDoPolitico, empresasDoPoliticoNaBase } from "@/services/integrations/receita/socios-politicos";
import { confirmarVinculoSocietario, type EmpresaQsa, normalizarNome, type Veredito } from "./socio-confirmacao";
import { coletarCnpjsMotoresBusca } from "./socio-search";

export interface EmpresaDeclarada {
	/** Ano da eleição da declaração (0 se desconhecido) e posição do bem nela: dão o id estável do nó. */
	ano: number;
	indice: number;
	nome: string;
	descricao: string;
	tipo: string;
	valor: number;
	/** CNPJ escrito na própria descrição (dígitos verificadores conferidos). */
	cnpjDeclarado: string | null;
}

export interface ReferenciaPolitico {
	/** Nomes civil/urna normalizados (nomesDeReferencia). */
	nomes: string[];
	cpf: string | null;
}

export interface CnpjConfirmado {
	cnpj: string;
	dados: EmpresaQsa;
	veredito: Extract<Veredito, { confirmado: true }>;
}

export interface DependenciasEmpresas {
	/** Empresas do político no QSA da Receita (base socios_politicos): funciona em produção. */
	empresasDaBase: (ref: ReferenciaPolitico) => Promise<EmpresaDoPolitico[]>;
	/** Reserva: CNPJs na página de busca da web (recusada na Vercel), conferidos na Receita. */
	buscarCnpjs: (termo: string) => Promise<string[]>;
	dadosCnpj: (cnpj: string) => Promise<ResultadoCnpj>;
}

const PADRAO: DependenciasEmpresas = {
	empresasDaBase: (ref) => empresasDoPoliticoNaBase(ref),
	buscarCnpjs: (t) => coletarCnpjsMotoresBusca(t),
	dadosCnpj: (c) => buscarDadosCnpj(c),
};

/** Mais que isso numa declaração é carteira de investimento, não empresa do político. */
const MAX_EMPRESAS = 6;
const MAX_CANDIDATOS = 4;

const TIPO_SOCIETARIO = /\bquotas? ou quinh|\bparticipac(?:ao|oes) societ/;
const FUNDO = /\bFUNDOS?\b/;

/** Palavras que abrem a descrição antes do nome ("50% PARTICIPAÇÃO DA EMPRESA ..."). */
const PREFIXOS = new Set([
	"PARTICIPACAO", "PARTICIPACOES", "SOCIETARIA", "SOCIETARIAS", "QUOTA", "QUOTAS", "COTA", "COTAS",
	"QUINHAO", "QUINHOES", "CAPITAL", "SOCIAL", "EMPRESA", "SOCIEDADE",
	"DE", "DA", "DO", "DAS", "DOS", "NA", "NO", "NAS", "NOS", "EM", "E", "OU", "A", "O",
]);

/** Palavras que não identificam uma empresa (tipo societário, conectivos, investimentos). */
const GENERICAS = new Set([
	...PREFIXOS,
	"EMPRESAS", "EMPRESARIA", "EMPRESARIAL", "EMPRESARIO", "SOCIEDADES", "LIMITADA", "LTDA", "ME", "EPP",
	"EIRELI", "SA", "S", "CIA", "MEI", "SLU", "UNIPESSOAL", "INDIVIDUAL", "SIMPLES", "PRIVADA", "PRIVADO",
	"PUBLICA", "ADVOCACIA", "ADVOGADOS", "INVESTIMENTO", "INVESTIMENTOS", "POSICAO", "ACOES", "ACAO",
	"OUTRA", "OUTRAS", "OUTROS", "DIVERSAS", "DIVERSOS", "VARIAS", "VALOR", "NOME", "CNPJ", "SOCIO", "SOCIA",
	"SOCIOS", "COM", "PARA", "RENDA", "FIXA", "APLICACAO", "APLICACOES", "FINANCEIRA", "TITULO", "CAPITALIZACAO",
]);

function semAcento(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function texto(v: unknown): string {
	return String(v ?? "").trim();
}

/** O TSE usou `descricaoDeTipoDeBem` (até 2022) e `tipoBem` (2026). */
export function tipoDoBem(bem: Record<string, unknown>): string {
	return texto(bem.descricaoDeTipoDeBem ?? bem.tipoBem);
}

/** Palavras que identificam a empresa (fora tipo societário, conectivos e números). */
export function palavrasProprias(nome: string): string[] {
	return normalizarNome(nome)
		.split(" ")
		.filter((p) => p.length > 1 && !GENERICAS.has(p) && !/^\d+$/.test(p));
}

function semAbertura(descricao: string): string {
	const palavras = descricao.split(/\s+/);
	let i = 0;
	while (i < palavras.length) {
		const p = normalizarNome(palavras[i]);
		if (p && !PREFIXOS.has(p) && !/^\d+$/.test(p)) break;
		i++;
	}
	return palavras.slice(i).join(" ");
}

/** "50% participação da Empresa Bolsotini Chocolates e Café LTDA" → "Bolsotini Chocolates e Café LTDA". */
export function nomeDaEmpresa(descricao: string): string | null {
	const corte = texto(descricao)
		.replace(/\s*[-–—]?\s*\bCNPJ\b.*$/i, "")
		.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, " ")
		.replace(/\s+[-–—]\s+(?:valor|quotas?|cotas?)\b.*$/i, "");
	const nome = semAbertura(corte).replace(/^[\s\-–—:,.;]+|[\s\-–—:,.;]+$/g, "");
	if (FUNDO.test(normalizarNome(nome)) || palavrasProprias(nome).length === 0) return null;
	return nome;
}

function cnpjNaDescricao(descricao: string): string | null {
	const achado = descricao.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0];
	return achado && cnpjValido(achado) ? soDigitos(achado) : null;
}

function empresaDoBem(bem: unknown, ano: number, indice: number): EmpresaDeclarada | null {
	if (!bem || typeof bem !== "object") return null;
	const b = bem as Record<string, unknown>;
	const tipo = tipoDoBem(b);
	if (!TIPO_SOCIETARIO.test(semAcento(tipo))) return null;
	const descricao = texto(b.descricao);
	const nome = nomeDaEmpresa(descricao);
	if (!nome) return null;
	return { ano, indice, nome, descricao, tipo, valor: Number(b.valor) || 0, cnpjDeclarado: cnpjNaDescricao(descricao) };
}

/** Uma declaração de bens ao TSE (a do nó PESSOA ou uma do histórico). */
export interface Declaracao {
	ano?: number;
	bens: unknown;
}

/**
 * Participações societárias com nome de empresa em todas as declarações, da mais recente
 * para a mais antiga, uma por nome. A empresa declarada em 2018 continua sendo um fato
 * mesmo quando a declaração de 2026 só diz "PARTICIPAÇÃO SOCIETÁRIA EM EMPRESA PRIVADA".
 */
export function empresasDeclaradas(declaracoes: Declaracao[]): EmpresaDeclarada[] {
	const ordenadas = [...declaracoes].sort((a, b) => (Number(b.ano) || 0) - (Number(a.ano) || 0));
	const porNome = new Map<string, EmpresaDeclarada>();
	for (const d of ordenadas) {
		const bens = Array.isArray(d.bens) ? d.bens : [];
		bens.forEach((bem, i) => {
			const e = empresaDoBem(bem, Number(d.ano) || 0, i);
			const chave = e ? palavrasProprias(e.nome).join(" ") : "";
			if (e && !porNome.has(chave)) porNome.set(chave, e);
		});
	}
	return [...porNome.values()].slice(0, MAX_EMPRESAS);
}

/** Declaração atual e histórico do nó PESSOA (campos bensDeclarados/anoPatrimonio/historicoPatrimonio). */
export function declaracoesDoPolitico(dados: { bensDeclarados?: unknown; anoPatrimonio?: unknown; historicoPatrimonio?: unknown }): Declaracao[] {
	const historico = Array.isArray(dados.historicoPatrimonio) ? dados.historicoPatrimonio : [];
	return [
		{ ano: Number(dados.anoPatrimonio) || undefined, bens: dados.bensDeclarados },
		...historico.map((h: { ano?: unknown; bensDeclarados?: unknown }) => ({ ano: Number(h?.ano) || undefined, bens: h?.bensDeclarados })),
	];
}

/** Todas as palavras próprias do nome declarado estão na razão social (ou no nome fantasia)? */
export function razaoSocialConfere(nome: string, dados: EmpresaQsa): boolean {
	const alvo = palavrasProprias(nome);
	if (alvo.length === 0) return false;
	return [dados.razao_social, dados.nome_fantasia].some((r) => {
		const palavras = new Set(normalizarNome(r).split(" "));
		return alvo.every((p) => palavras.has(p));
	});
}

async function conferirCandidato(cnpj: string, nome: string, ref: ReferenciaPolitico, deps: DependenciasEmpresas): Promise<CnpjConfirmado | null> {
	const r = await deps.dadosCnpj(cnpj);
	if (!r.ok) return null;
	if (!razaoSocialConfere(nome, r.dados)) {
		console.log(`[EMPRESAS DECLARADAS] ${cnpj} descartado para "${nome}": razão social "${r.dados.razao_social ?? "?"}" não confere.`);
		return null;
	}
	const veredito = confirmarVinculoSocietario(r.dados, ref.nomes, ref.cpf);
	if (!veredito.confirmado) {
		console.log(`[EMPRESAS DECLARADAS] ${cnpj} descartado para "${nome}": ${veredito.motivo}.`);
		return null;
	}
	return { cnpj, dados: r.dados, veredito };
}

/** Empresa do político na base da Receita com a razão social do nome declarado. */
async function daBaseDaReceita(nome: string, ref: ReferenciaPolitico, deps: DependenciasEmpresas): Promise<CnpjConfirmado | null> {
	const empresas = await deps.empresasDaBase(ref).catch(() => [] as EmpresaDoPolitico[]);
	const e = empresas.find((x) => razaoSocialConfere(nome, { razao_social: x.razao_social ?? undefined }));
	if (!e) return null;
	const porCpf = Boolean(ref.cpf && e.cpf_politico === ref.cpf);
	return {
		cnpj: e.cnpj,
		dados: { razao_social: e.razao_social ?? undefined },
		veredito: {
			confirmado: true,
			forca: porCpf ? "CPF_E_NOME" : "NOME",
			motivo: `${e.qualificacao_socio ?? "sócio"} no quadro de sócios da Receita (arquivo aberto de CNPJ de ${e.referencia}), conferido por nome${porCpf ? " e CPF" : " civil"}`,
		},
	};
}

/**
 * CNPJ da empresa pelo nome: primeiro as empresas do político no QSA da Receita (nossa base);
 * depois candidatos da busca na web, conferidos um a um (razão social + político no QSA).
 * null quando nenhum confere.
 */
export async function resolverCnpjDaEmpresa(
	nome: string,
	ref: ReferenciaPolitico,
	deps: DependenciasEmpresas = PADRAO,
): Promise<CnpjConfirmado | null> {
	if (palavrasProprias(nome).length === 0 || ref.nomes.length === 0) return null;
	const daBase = await daBaseDaReceita(nome, ref, deps);
	if (daBase) return daBase;
	const achados = await deps.buscarCnpjs(nome).catch(() => [] as string[]);
	const candidatos = [...new Set(achados.map(soDigitos))].filter((c) => cnpjValido(c)).slice(0, MAX_CANDIDATOS);
	for (const cnpj of candidatos) {
		const confirmado = await conferirCandidato(cnpj, nome, ref, deps);
		if (confirmado) return confirmado;
	}
	return null;
}

export interface NoEmpresaDeclarada {
	id: string;
	type: "EMPRESA";
	_origemId: string;
	data: Record<string, unknown>;
}

function motivoDoCnpj(e: EmpresaDeclarada, confirmado: CnpjConfirmado | null): string {
	if (confirmado) return ` CNPJ conferido na Receita: ${confirmado.veredito.motivo}.`;
	if (e.cnpjDeclarado) return " CNPJ informado na própria declaração.";
	return " CNPJ não localizado com segurança: o drilldown procura de novo, conferindo o quadro de sócios.";
}

export function noDaEmpresaDeclarada(e: EmpresaDeclarada, pessoaId: string, confirmado: CnpjConfirmado | null): NoEmpresaDeclarada {
	const cnpj = confirmado?.cnpj ?? e.cnpjDeclarado;
	const quando = e.ano ? ` em ${e.ano}` : "";
	return {
		id: `empresa-tse-${pessoaId}-${e.ano}-${e.indice}`,
		type: "EMPRESA",
		_origemId: pessoaId,
		data: {
			label: e.nome,
			cnpj: cnpj ? documentoFormatado(cnpj) : undefined,
			situacao: confirmado?.dados.descricao_situacao_cadastral,
			valor: e.valor,
			tipo: e.tipo,
			ano: e.ano || undefined,
			origem: `Declaração de bens ao TSE${quando}`,
			forcaVinculo: confirmado?.veredito.forca,
			motivo_ia: `Participação declarada pelo próprio político ao TSE${quando}: "${e.descricao}".${motivoDoCnpj(e, confirmado)}`,
			score_letalidade: 40,
		},
	};
}

export interface EntradaEmpresasDeclaradas {
	declaracoes: Declaracao[];
	pessoaId: string;
	referencia: ReferenciaPolitico;
	status?: (msg: string) => void;
}

/** Nós EMPRESA das participações declaradas, com o CNPJ só quando conferido. Nunca lança. */
export async function nosDasEmpresasDeclaradas(
	entrada: EntradaEmpresasDeclaradas,
	deps: DependenciasEmpresas = PADRAO,
): Promise<NoEmpresaDeclarada[]> {
	const nos: NoEmpresaDeclarada[] = [];
	// Uma empresa por vez: cada uma é uma busca na web e até 4 consultas à Receita.
	for (const e of empresasDeclaradas(entrada.declaracoes)) {
		const confirmado = e.cnpjDeclarado ? null : await resolverCnpjDaEmpresa(e.nome, entrada.referencia, deps).catch(() => null);
		nos.push(noDaEmpresaDeclarada(e, entrada.pessoaId, confirmado));
	}
	if (nos.length > 0) {
		const comCnpj = nos.filter((n) => n.data.cnpj).length;
		entrada.status?.(`[TSE] ${nos.length} empresa(s) declarada(s) pelo político; CNPJ conferido em ${comCnpj}.`);
	}
	return nos;
}
