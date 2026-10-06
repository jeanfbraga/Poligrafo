/**
 * Adaptadores: o que o pipe já coletou → fatos do motor de cruzamentos.
 *
 * Lê os dados no formato em que já chegam (lista de doadores do TSE, CNPJs
 * das empresas confirmadas, despesas do mandato normalizadas e os nós do
 * grafo), sem nova consulta. Cada fato leva fonte, link e chave. Ver nota 31.
 */
import { cnpjValido, cpfValido, soDigitos } from "@/lib/documento";
import type { DespesaNormalizada } from "@/services/core/despesa-normalizada";
import type { Fato, Papel, Procedencia } from "./tipos";

export interface NoGrafo {
	id: string;
	type?: string;
	data?: Record<string, any>;
}

function documentoOuNulo(valor: unknown): string | null {
	const d = soDigitos(valor);
	return cnpjValido(d) || cpfValido(d) ? d : null;
}

function procedencia(fonte: string, chave: string, coletadoEm: string, url?: string): Procedencia {
	return { fonte, chave, coletadoEm, ...(url ? { url } : {}) };
}

function fato(papel: Papel, documento: string, i: number, resto: Omit<Fato, "id" | "papel" | "documento">): Fato {
	return { id: `fato-${papel.toLowerCase()}-${documento}-${i}`, papel, documento, ...resto };
}

/** Doadores do TSE (lista de CPF/CNPJ). CPF de pessoa física entra para cruzar, mas nunca vai ao prompt sem máscara. */
export function fatosDeDoadores(doadores: unknown[], coletadoEm: string, chave = "candidato no TSE"): Fato[] {
	const docs = [...new Set(doadores.map(documentoOuNulo).filter((d): d is string => d !== null))];
	return docs.map((d, i) =>
		fato("DOADOR", d, i, { nome: "", detalhe: "doação de campanha", procedencia: procedencia("TSE — doadores de campanha", chave, coletadoEm) }),
	);
}

export function fatosDeEmpresasDoPolitico(cnpjs: string[], coletadoEm: string): Fato[] {
	const docs = [...new Set(cnpjs.map(soDigitos).filter((d) => cnpjValido(d)))];
	return docs.map((d, i) =>
		fato("EMPRESA_DO_POLITICO", d, i, {
			nome: "",
			detalhe: "sócio confirmado no QSA",
			procedencia: procedencia("Receita Federal — QSA (BrasilAPI)", `cnpj=${d}`, coletadoEm, `https://brasilapi.com.br/api/cnpj/v1/${d}`),
		}),
	);
}

export function fatosDeDespesasMandato(despesas: DespesaNormalizada[], coletadoEm: string): Fato[] {
	return despesas.flatMap((d, i) => {
		const doc = documentoOuNulo(d.cnpjCpfFornecedor);
		if (!doc) return [];
		return [fato("FORNECEDOR_COTA", doc, i, {
			nome: d.nomeFornecedor,
			valor: d.valorDocumento || undefined,
			data: d.dataDocumento || undefined,
			detalhe: d.tipoDespesa,
			procedencia: procedencia(d.fonte, `fornecedor=${doc}`, coletadoEm, d.urlDocumento),
		})];
	});
}

/** Linha de tse_campanha_contas (Banco de Perfil). */
export interface ContaCampanhaFato {
	ano_eleicao: number;
	tipo: "DOADOR" | "FORNECEDOR";
	documento: string;
	nome: string | null;
	valor_total: number;
	quantidade: number;
	origem: string | null;
}

/** Contas de campanha pelo número do candidato: doadores (CPF) e fornecedores (CNPJ) com valor. */
export function fatosDeContasCampanha(contas: ContaCampanhaFato[], coletadoEm: string, sq: string): Fato[] {
	return contas.flatMap((c, i) => {
		const doc = documentoOuNulo(c.documento);
		if (!doc) return [];
		const papel: Papel = c.tipo === "DOADOR" ? "DOADOR" : "FORNECEDOR_CAMPANHA";
		const arquivo = c.tipo === "DOADOR" ? "receitas" : "despesas contratadas";
		return [fato(papel, doc, i, {
			nome: c.nome ?? "",
			valor: Number(c.valor_total) || undefined,
			data: String(c.ano_eleicao),
			detalhe: [c.origem, c.quantidade > 1 ? `${c.quantidade} lançamentos` : ""].filter(Boolean).join(" — "),
			procedencia: procedencia(
				`TSE — prestação de contas ${c.ano_eleicao} (${arquivo})`,
				`sq_candidato=${sq}`,
				coletadoEm,
				"https://dadosabertos.tse.jus.br/dataset/?q=presta%C3%A7%C3%A3o+de+contas",
			),
		})];
	});
}

type LeitorNo = (no: NoGrafo, coletadoEm: string) => Fato[];

/** Contrato/empenho do órgão (TCE etc.): nós de nosDeContratosDoEnte. */
const contratoDoEnte: LeitorNo = (no, coletadoEm) => {
	const d = no.data ?? {};
	const doc = documentoOuNulo(d.documento);
	if (no.type !== "CONTRATO" || d.natureza !== "ENTE" || !doc) return [];
	return [fato("CONTRATADO_ENTE", doc, 0, {
		nome: String(d.label ?? ""),
		valor: Number(d.valor) || undefined,
		data: d.dataDocumento || undefined,
		detalhe: String(d.objeto ?? ""),
		procedencia: procedencia(String(d.fonte ?? "Tribunal de Contas"), `fornecedor=${doc}`, coletadoEm, d.url),
	})].map((f) => ({ ...f, id: `${f.id}-${no.id}` }));
};

/** Contratos públicos de doador (doadores-contratos.ts): um fato por contrato. */
const contratosDeDoador: LeitorNo = (no, coletadoEm) => {
	const d = no.data ?? {};
	const doc = documentoOuNulo(d.documento);
	// "toma-la-da-ca-" é o id antigo do mesmo nó.
	if (!/^(doador-contrato-|toma-la-da-ca-)/.test(no.id) || !doc || !Array.isArray(d.contratos)) return [];
	return d.contratos.map((c: any, i: number) =>
		fato("CONTRATADO_PUBLICO", doc, i, {
			nome: "",
			valor: Number(c.valor) || undefined,
			data: c.data || undefined,
			detalhe: [c.orgao, c.objeto].filter(Boolean).join(" — "),
			procedencia: procedencia(String(c.fonte ?? "Contratos públicos"), `fornecedor=${doc}`, coletadoEm, c.url),
		}),
	);
};

/** Beneficiário de emenda (TransfereGov), quando a emenda traz o CNPJ. */
const beneficiarioDeEmenda: LeitorNo = (no, coletadoEm) => {
	const d = no.data ?? {};
	const doc = documentoOuNulo(d.beneficiario?.cnpj);
	if (no.type !== "EMENDA" || !doc) return [];
	return [fato("BENEFICIARIO_EMENDA", doc, 0, {
		nome: String(d.beneficiario?.nome ?? ""),
		valor: Number(d.valor) || undefined,
		data: d.ano ? String(d.ano) : undefined,
		detalhe: `emenda ${d.codigo ?? ""}`.trim(),
		procedencia: procedencia("Portal da Transparência / TransfereGov — emendas", `emenda=${d.codigo ?? ""}`, coletadoEm),
	})].map((f) => ({ ...f, id: `${f.id}-${no.id}` }));
};

const LEITORES: LeitorNo[] = [contratoDoEnte, contratosDeDoador, beneficiarioDeEmenda];

export function fatosDeNos(nos: NoGrafo[], coletadoEm: string): Fato[] {
	return nos.flatMap((no) => LEITORES.flatMap((ler) => ler(no, coletadoEm)));
}

/** Nomes vindos de outros fatos completam doador/empresa (que chegam só com o documento). */
export function completarNomes(fatos: Fato[]): Fato[] {
	const nomes = new Map<string, string>();
	for (const f of fatos) if (f.nome && !nomes.has(f.documento)) nomes.set(f.documento, f.nome);
	return fatos.map((f) => (f.nome ? f : { ...f, nome: nomes.get(f.documento) ?? "" }));
}
