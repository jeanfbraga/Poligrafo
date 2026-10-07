/**
 * Despesa normalizada — um formato só para tudo que vai à triagem.
 *
 * Problemas que resolve (diagnóstico de 06/10/2026):
 *  - clientes de TCE devolviam `fornecedor`/`cnpjFornecedor`/`valorLiquido`,
 *    mas a triagem lê `cnpjCpfFornecedor`/`nomeFornecedor`/`valorDocumento`:
 *    a IA recebia `undefined`;
 *  - contratos e empenhos do MUNICÍPIO INTEIRO (TCEs) eram tratados como
 *    gastos do próprio político e julgados com o prompt de cota parlamentar.
 *
 * `natureza`:
 *  - MANDATO — gasto do gabinete/mandato (CEAP, CEAPS, ALESP, ALERJ, cota da
 *    CMRJ): vai para a triagem;
 *  - ENTE — contrato/empenho do órgão (prefeitura, câmara): vira contexto e,
 *    na Fase 3, fato para o motor de cruzamentos (ver nota 31 do Obsidian).
 */
import { soDigitos } from "@/lib/documento";
import { primeiroNumero, primeiroValor } from "@/lib/valores";

export type NaturezaDespesa = "MANDATO" | "ENTE";

export interface DespesaNormalizada {
	cnpjCpfFornecedor: string;
	nomeFornecedor: string;
	tipoDespesa: string;
	valorDocumento: number;
	dataDocumento: string;
	urlDocumento?: string;
	fonte: string;
	natureza: NaturezaDespesa;
	[k: string]: unknown;
}

function nomeDe(raw: any): string {
	const fornecedorTexto = typeof raw.fornecedor === "string" ? raw.fornecedor : raw.fornecedor?.nome;
	return primeiroValor(raw.nomeFornecedor, fornecedorTexto, raw.favorecido, raw.nomeCredor, raw.razaoSocial, raw.contratado, raw.nome);
}

function documentoDe(raw: any): string {
	return soDigitos(primeiroValor(
		raw.cnpjCpfFornecedor, raw.cnpjFornecedor, raw.cpfCnpj, raw.cnpj, raw.cnpjCpf, raw.cpf_cnpj, raw.fornecedor_cnpj_cpf, raw.documento,
	));
}

export function normalizarDespesa(
	raw: any,
	padrao: { fonte: string; natureza: NaturezaDespesa },
): DespesaNormalizada {
	const r = raw ?? {};
	return {
		...r,
		cnpjCpfFornecedor: documentoDe(r),
		nomeFornecedor: nomeDe(r) || "FORNECEDOR NÃO IDENTIFICADO",
		tipoDespesa: primeiroValor(r.tipoDespesa, r.tipo, r.categoria_despesa, r.modalidade, r.descricao, r.objeto) || "DESPESA",
		valorDocumento: primeiroNumero(r.valorDocumento, r.valorLiquido, r.valor, r.valorEmpenhado, r.valorPago, r.valorGlobal, r.valor_contrato),
		dataDocumento: primeiroValor(r.dataDocumento, r.data, r.data_despesa, r.dataEmissao, r.dataAssinatura),
		urlDocumento: primeiroValor(r.urlDocumento, r.url, r.link) || undefined,
		fonte: primeiroValor(r.fonte, r._fonte, padrao.fonte),
		natureza: r.natureza === "MANDATO" || r.natureza === "ENTE" ? r.natureza : padrao.natureza,
	};
}

export function separarPorNatureza(lista: DespesaNormalizada[]): { mandato: DespesaNormalizada[]; ente: DespesaNormalizada[] } {
	return {
		mandato: lista.filter((d) => d.natureza === "MANDATO"),
		ente: lista.filter((d) => d.natureza === "ENTE"),
	};
}

/**
 * Contratos do órgão como nós de contexto (sem nota da IA), os de maior valor primeiro.
 * `prefixo` separa as fontes (TCE × PNCP) para um id não sobrescrever o outro no cache.
 */
export function nosDeContratosDoEnte(ente: DespesaNormalizada[], pessoaId: string, limite = 20, prefixo = "contrato-ente") {
	return [...ente]
		.sort((a, b) => b.valorDocumento - a.valorDocumento)
		.slice(0, limite)
		.map((d, i) => ({
			id: `${prefixo}-${d.cnpjCpfFornecedor || "sem-doc"}-${i}`,
			type: "CONTRATO",
			_origemId: pessoaId,
			data: {
				label: d.nomeFornecedor,
				objeto: d.tipoDespesa,
				valor: d.valorDocumento,
				dataDocumento: d.dataDocumento,
				documento: d.cnpjCpfFornecedor,
				url: d.urlDocumento,
				fonte: d.fonte,
				natureza: "ENTE",
				motivo_ia: `Contrato/empenho do órgão (${d.fonte}) — contexto, não é gasto do mandato.`,
			},
		}));
}
