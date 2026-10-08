/**
 * Regras puras do ETL socios_politicos (testadas em __tests__/unit/socios-politicos-etl.test.ts).
 *
 * Do arquivo aberto de CNPJ da Receita (compartilhamento "CNPJ - SERPRO+", pastas mensais
 * AAAA-MM com Socios0..9.zip e Empresas0..9.zip; CSV `;`, aspas, latin1) ficam as empresas
 * em que um eleito com CPF na base tse_eleitos é sócio: NOME COMPLETO igual ao do QSA E os
 * 6 dígitos do meio do CPF iguais aos do CPF mascarado do sócio (`***123456**`). As duas
 * coisas juntas, como em services/core/socio-confirmacao.ts — nome sozinho é homônimo.
 *
 * Serve à investigação em produção, onde a busca de empresas pela web é recusada.
 */
import { mioloCpf, soDigitos } from "../../src/lib/documento";
import { normalizarNome } from "../../src/services/core/socio-confirmacao";

export interface PoliticoComCpf {
	nr_cpf_candidato: string | null;
	nm_candidato: string;
}

interface CpfDoPolitico {
	cpf: string;
	miolo: string;
}

/** Nome normalizado → CPFs dos eleitos com esse nome (homônimos entre eleitos ficam todos). */
export type MapaPoliticos = Map<string, CpfDoPolitico[]>;

export function mapaPoliticos(eleitos: PoliticoComCpf[]): MapaPoliticos {
	const mapa: MapaPoliticos = new Map();
	for (const e of eleitos) {
		const cpf = soDigitos(e.nr_cpf_candidato);
		const miolo = mioloCpf(cpf);
		const nome = normalizarNome(e.nm_candidato);
		if (cpf.length !== 11 || !miolo || nome.split(" ").length < 2) continue;
		const lista = mapa.get(nome) ?? [];
		if (!lista.some((x) => x.cpf === cpf)) lista.push({ cpf, miolo });
		mapa.set(nome, lista);
	}
	return mapa;
}

export interface VinculoSocio {
	cpf_politico: string;
	cnpj_basico: string;
	nome_politico: string;
	qualificacao_codigo: string;
	data_entrada: string | null;
}

/** "20050518" → "2005-05-18"; vazio ou inválido → null. */
export function dataReceita(v: string | undefined): string | null {
	const m = String(v ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
	return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Linha de Socios*.csv: cnpj_basico; identificador (2 = pessoa física); nome; CPF mascarado;
 * qualificação; data de entrada; ... → vínculo, se for um eleito (nome + miolo do CPF).
 */
export function vinculoDaLinha(colunas: string[], mapa: MapaPoliticos): VinculoSocio | null {
	const [basico, identificador, nomeSocio, cpfMascarado, qualificacao, dataEntrada] = colunas;
	if (identificador !== "2" || !basico) return null;
	const nome = normalizarNome(nomeSocio);
	const candidatos = mapa.get(nome);
	const miolo = candidatos ? mioloCpf(cpfMascarado) : null;
	const politico = miolo ? candidatos?.find((c) => c.miolo === miolo) : undefined;
	if (!politico) return null;
	return {
		cpf_politico: politico.cpf,
		cnpj_basico: basico.padStart(8, "0"),
		nome_politico: nome,
		qualificacao_codigo: String(qualificacao ?? "").trim(),
		data_entrada: dataReceita(dataEntrada),
	};
}

export interface EmpresaReceita {
	cnpj_basico: string;
	razao_social: string;
	natureza_codigo: string;
	capital_social: number | null;
}

/** Linha de Empresas*.csv: cnpj_basico; razão social; natureza jurídica; qualif. do responsável; capital ("1000,00"). */
export function empresaDaLinha(colunas: string[]): EmpresaReceita | null {
	const [basico, razao, natureza, , capital] = colunas;
	if (!basico || !razao) return null;
	const valor = Number(String(capital ?? "").replace(/\./g, "").replace(",", "."));
	return {
		cnpj_basico: basico.padStart(8, "0"),
		razao_social: razao.trim(),
		natureza_codigo: String(natureza ?? "").trim(),
		capital_social: Number.isFinite(valor) ? valor : null,
	};
}

/** Natureza 409-0 "Candidato a Cargo Político Eletivo": CNPJ de campanha, não empresa. */
export const NATUREZAS_FORA = new Set(["4090"]);

function digitoCnpj(base: string): number {
	const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
	const soma = [...base].reduce((s, c, i) => s + Number(c) * pesos[i], 0);
	const resto = soma % 11;
	return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ da matriz (estabelecimento 0001) a partir dos 8 dígitos básicos. */
export function cnpjDaMatriz(basico: string): string {
	const base = `${basico.padStart(8, "0")}0001`;
	const d1 = digitoCnpj(base);
	return `${base}${d1}${digitoCnpj(`${base}${d1}`)}`;
}

/** Tabelas de domínio (Qualificacoes, Naturezas): "codigo";"descrição". */
export function linhaDominio(colunas: string[], mapa: Map<string, string>): void {
	const [codigo, descricao] = colunas;
	if (codigo && descricao) mapa.set(codigo.trim(), descricao.trim());
}

export interface LinhaSocioPolitico {
	cpf_politico: string;
	cnpj_basico: string;
	cnpj: string;
	nome_politico: string;
	razao_social: string | null;
	natureza_juridica: string | null;
	qualificacao_socio: string | null;
	data_entrada: string | null;
	capital_social: number | null;
	referencia: string;
}

export interface Dominios {
	qualificacoes: Map<string, string>;
	naturezas: Map<string, string>;
}

/** Vínculo + empresa → registro; null para CNPJ de campanha. */
export function montarRegistro(v: VinculoSocio, empresa: EmpresaReceita | undefined, dominios: Dominios, referencia: string): LinhaSocioPolitico | null {
	if (empresa && NATUREZAS_FORA.has(empresa.natureza_codigo)) return null;
	const natureza = empresa ? (dominios.naturezas.get(empresa.natureza_codigo) ?? empresa.natureza_codigo) : null;
	return {
		cpf_politico: v.cpf_politico,
		cnpj_basico: v.cnpj_basico,
		cnpj: cnpjDaMatriz(v.cnpj_basico),
		nome_politico: v.nome_politico,
		razao_social: empresa?.razao_social ?? null,
		natureza_juridica: natureza,
		qualificacao_socio: dominios.qualificacoes.get(v.qualificacao_codigo) ?? (v.qualificacao_codigo || null),
		data_entrada: v.data_entrada,
		capital_social: empresa?.capital_social ?? null,
		referencia,
	};
}

/** Pasta mensal mais recente na listagem WebDAV ("/public.php/webdav/2026-09/"). */
export function pastaMaisRecente(hrefs: string[]): string | null {
	const meses = hrefs.map((h) => h.match(/\/(\d{4}-\d{2})\/?$/)?.[1]).filter((m): m is string => Boolean(m));
	return meses.sort().at(-1) ?? null;
}
