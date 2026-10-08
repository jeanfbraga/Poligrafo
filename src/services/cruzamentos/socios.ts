/**
 * QSA dos fornecedores que importam → quem é sócio de quem recebe dinheiro
 * ligado ao mandato. Ver nota 31 do Obsidian.
 *
 * Para os maiores fornecedores (cota, órgão, emenda e campanha), lê o QSA
 * (BrasilAPI, com cache) e compara cada sócio pessoa física, por nome igual E
 * pelos 6 dígitos do meio do CPF (o QSA mostra `***456789**`), com:
 *  - o político → fato EMPRESA_DO_POLITICO para aquele CNPJ;
 *  - os doadores pessoa física → fato SOCIO_DE_FORNECEDOR no CPF do doador;
 *  - os funcionários do gabinete do político (só nome completo com 3+ palavras próprias,
 *    porque a casa não publica o CPF) → fato EMPRESA_DE_ASSESSOR no CNPJ.
 * Nome igual com dígitos diferentes não conta (homônimo).
 */
import { mioloCpf, soDigitos } from "@/lib/documento";
import { type EmpresaQsa, normalizarNome } from "@/services/core/socio-confirmacao";
import { buscarJson } from "@/lib/fonte-http";
import { nomeDistintivo, type PessoaDoGabinete, resumoVinculos } from "./gabinete";
import type { Fato, Papel } from "./tipos";

const PAPEIS_FORNECEDOR: Papel[] = ["FORNECEDOR_COTA", "CONTRATADO_ENTE", "BENEFICIARIO_EMENDA", "FORNECEDOR_CAMPANHA"];
export const LIMITE_QSA = 10;

const ROTULO_PAPEL: Partial<Record<Papel, string>> = {
	FORNECEDOR_COTA: "paga com a cota do mandato",
	CONTRATADO_ENTE: "contratada pelo órgão ligado ao mandato",
	BENEFICIARIO_EMENDA: "beneficiada por emenda",
	FORNECEDOR_CAMPANHA: "fornecedora da campanha",
};

export interface Politico {
	nomes: string[];
	cpf: string | null;
}

type BuscarQsa = (cnpj: string) => Promise<EmpresaQsa | null>;

export const buscarQsaPadrao: BuscarQsa = async (cnpj) => {
	const r = await buscarJson<EmpresaQsa>(`https://brasilapi.com.br/api/cnpj/v1/${soDigitos(cnpj)}`, {
		fonte: "brasilapi-cnpj",
		timeoutMs: 5000,
		tentativas: 2,
		memoria: { ttlMs: 6 * 60 * 60 * 1000 },
	});
	return r.ok ? r.dados : null;
};

/** CNPJs de fornecedores por valor somado (maiores primeiro). */
export function fornecedoresParaQsa(fatos: Fato[], limite = LIMITE_QSA): string[] {
	const total = new Map<string, number>();
	for (const f of fatos) {
		if (!PAPEIS_FORNECEDOR.includes(f.papel) || f.documento.length !== 14) continue;
		total.set(f.documento, (total.get(f.documento) ?? 0) + (f.valor ?? 0));
	}
	return [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, limite).map(([c]) => c);
}

function chave(nome: string, miolo: string | null): string | null {
	const n = normalizarNome(nome);
	return n && miolo ? `${n}|${miolo}` : null;
}

function papeisDoCnpj(fatos: Fato[], cnpj: string): string {
	const papeis = [...new Set(fatos.filter((f) => f.documento === cnpj).map((f) => ROTULO_PAPEL[f.papel]).filter(Boolean))];
	return papeis.join(", ");
}

function procedenciaQsa(cnpj: string, coletadoEm: string) {
	return { fonte: "Receita Federal — QSA (BrasilAPI)", chave: `cnpj=${cnpj}`, coletadoEm, url: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}` };
}

/** Doadores pessoa física indexados por nome normalizado + miolo do CPF. */
function indiceDoadores(fatos: Fato[]): Map<string, Fato> {
	const idx = new Map<string, Fato>();
	for (const f of fatos) {
		const k = f.papel === "DOADOR" && f.documento.length === 11 ? chave(f.nome, mioloCpf(f.documento)) : null;
		if (k && !idx.has(k)) idx.set(k, f);
	}
	return idx;
}

function chavesDoPolitico(p: Politico): Set<string> {
	const miolo = mioloCpf(p.cpf);
	return new Set(p.nomes.map((n) => chave(n, miolo)).filter((k): k is string => Boolean(k)));
}

interface Contexto {
	fatos: Fato[];
	doadores: Map<string, Fato>;
	politico: Set<string>;
	assessores: Map<string, PessoaDoGabinete>;
	coletadoEm: string;
}

/** Funcionários com nome distintivo, por nome normalizado. */
function indiceAssessores(pessoas: PessoaDoGabinete[]): Map<string, PessoaDoGabinete> {
	return new Map(pessoas.filter((p) => nomeDistintivo(p.chave)).map((p) => [p.chave, p]));
}

function fatoEmpresaDeAssessor(cnpj: string, i: number, nomeEmpresa: string, papeis: string, p: PessoaDoGabinete, coletadoEm: string): Fato {
	return {
		id: `fato-empresa_de_assessor-${cnpj}-qsa${i}`,
		papel: "EMPRESA_DE_ASSESSOR",
		documento: cnpj,
		nome: nomeEmpresa,
		periodo: { inicio: p.inicio, fim: p.fim },
		detalhe: `sócio ${p.nome} tem o nome completo de funcionário do gabinete (${resumoVinculos(p)}); empresa ${papeis}`,
		procedencia: procedenciaQsa(cnpj, coletadoEm),
	};
}

function fatosDaEmpresa(cnpj: string, qsa: EmpresaQsa, ctx: Contexto): Fato[] {
	const nomeEmpresa = String(qsa.razao_social ?? "");
	const papeis = papeisDoCnpj(ctx.fatos, cnpj);
	const saida: Fato[] = [];
	(qsa.qsa ?? []).forEach((s, i) => {
		const assessor = ctx.assessores.get(normalizarNome(String(s.nome_socio ?? "")));
		if (assessor) saida.push(fatoEmpresaDeAssessor(cnpj, i, nomeEmpresa, papeis, assessor, ctx.coletadoEm));
		const k = chave(String(s.nome_socio ?? ""), mioloCpf(s.cnpj_cpf_do_socio));
		if (!k) return;
		if (ctx.politico.has(k)) {
			saida.push({ id: `fato-empresa_do_politico-${cnpj}-qsa${i}`, papel: "EMPRESA_DO_POLITICO", documento: cnpj, nome: nomeEmpresa, detalhe: `sócio no QSA (nome e CPF conferidos); empresa ${papeis}`, procedencia: procedenciaQsa(cnpj, ctx.coletadoEm) });
		}
		const doador = ctx.doadores.get(k);
		if (doador) {
			saida.push({ id: `fato-socio_de_fornecedor-${doador.documento}-${cnpj}`, papel: "SOCIO_DE_FORNECEDOR", documento: doador.documento, nome: doador.nome, detalhe: `sócio de ${nomeEmpresa || cnpj} (${cnpj}), empresa ${papeis}`, procedencia: procedenciaQsa(cnpj, ctx.coletadoEm) });
		}
	});
	return saida;
}

export async function fatosDeSocios(
	fatos: Fato[],
	politico: Politico | null,
	coletadoEm: string,
	buscar: BuscarQsa = buscarQsaPadrao,
	limite = LIMITE_QSA,
	gabinete: PessoaDoGabinete[] = [],
): Promise<Fato[]> {
	const doadores = indiceDoadores(fatos);
	const doPolitico = politico ? chavesDoPolitico(politico) : new Set<string>();
	const assessores = indiceAssessores(gabinete);
	if (doadores.size === 0 && doPolitico.size === 0 && assessores.size === 0) return [];
	const cnpjs = fornecedoresParaQsa(fatos, limite);
	const respostas = await Promise.allSettled(cnpjs.map((c) => buscar(c)));
	const ctx: Contexto = { fatos, doadores, politico: doPolitico, assessores, coletadoEm };
	return respostas.flatMap((r, i) => (r.status === "fulfilled" && r.value ? fatosDaEmpresa(cnpjs[i], r.value, ctx) : []));
}
