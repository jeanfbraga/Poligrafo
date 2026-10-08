/**
 * Cota parlamentar (CEAP) da Câmara e do Senado AGRUPADA → Banco de Perfil
 * (`ceap_fornecedores_ano`), na janela de 4 anos do mandato (decisão do dono, 08/10/2026).
 *
 * Por quê: o motor de cruzamentos só enxergava os fornecedores das 60 notas de maior
 * valor (o dossiê e a IA continuam com elas). Agrupada por parlamentar + ano +
 * fornecedor + tipo, a cota cabe inteira: ~50 mil linhas por ano contra ~245 mil notas.
 *
 * Fontes oficiais (as mesmas dos ETLs de notas): ZIP anual da Câmara
 * (`camara.leg.br/cotas/Ano-{ano}.csv.zip`) e CSV anual do Senado (adm.senado.gov.br).
 * Nota sem CNPJ/CPF válido não entra (não serve para cruzar); o log diz quantas.
 *
 * Uso:
 *   npm run sync:ceap-fornecedores               → só mede (linhas e tamanho por ano)
 *   npm run sync:ceap-fornecedores -- --gravar   → grava, ano a ano e casa a casa:
 *                                                  valida, apaga o ano e insere
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { credenciaisBancoPerfil } from "./banco-perfil";
import { downloadAndExtractForYear, lerRegistros } from "./ceap-sync";
import { baixarCsv, despesasDoCsv } from "./ceap-senado-sync";

export type Casa = "CAMARA" | "SENADO";

export interface NotaCota {
	casa: Casa;
	id_parlamentar: number;
	ano: number;
	documento: string | null;
	fornecedor: string;
	tipo_despesa: string;
	valor: number;
	data: string | null;
}

export interface LinhaAgrupada {
	casa: Casa;
	id_parlamentar: number;
	ano: number;
	documento: string;
	tipo_despesa: string;
	fornecedor: string;
	valor_total: number;
	notas: number;
	primeira_data: string | null;
	ultima_data: string | null;
}

/** Janela de 4 anos: o ano atual e os 3 anteriores (um mandato). */
export function anosDaJanela(agora = new Date()): number[] {
	const ano = agora.getFullYear();
	return [ano - 3, ano - 2, ano - 1, ano];
}

/** "2025-02-28T00:00:00" (Câmara) ou "2025-03-20" (Senado) → "2025-02-28"; o resto → null. */
export function dataDaNota(valor: unknown): string | null {
	return String(valor ?? "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function documentoValido(doc: string | null): string | null {
	const d = String(doc ?? "").replace(/\D/g, "");
	return d.length === 11 || d.length === 14 ? d : null;
}

function menor(a: string | null, b: string | null): string | null {
	if (!a) return b;
	return b && b < a ? b : a;
}

function maior(a: string | null, b: string | null): string | null {
	if (!a) return b;
	return b && b > a ? b : a;
}

export class AgrupadorDaCota {
	private readonly grupos = new Map<string, LinhaAgrupada>();
	/** Notas sem CNPJ/CPF válido (ficam fora). */
	semDocumento = 0;

	adicionar(n: NotaCota): void {
		const documento = documentoValido(n.documento);
		if (!documento) {
			this.semDocumento++;
			return;
		}
		const chave = `${n.casa}|${n.id_parlamentar}|${n.ano}|${documento}|${n.tipo_despesa}`;
		const data = dataDaNota(n.data);
		const atual = this.grupos.get(chave);
		if (!atual) {
			this.grupos.set(chave, { casa: n.casa, id_parlamentar: n.id_parlamentar, ano: n.ano, documento, tipo_despesa: n.tipo_despesa, fornecedor: n.fornecedor, valor_total: n.valor, notas: 1, primeira_data: data, ultima_data: data });
			return;
		}
		atual.valor_total += n.valor;
		atual.notas += 1;
		atual.primeira_data = menor(atual.primeira_data, data);
		atual.ultima_data = maior(atual.ultima_data, data);
	}

	linhas(): LinhaAgrupada[] {
		return [...this.grupos.values()].map((l) => ({ ...l, valor_total: Math.round(l.valor_total * 100) / 100 }));
	}
}

/** Abaixo disso o arquivo do ano é considerado ruim e a base existente fica como está. */
export function minimoDeLinhas(casa: Casa, ano: number, agora = new Date()): number {
	const anoFechado = ano < agora.getFullYear();
	if (casa === "CAMARA") return anoFechado ? 20_000 : 1_000;
	return anoFechado ? 1_500 : 100;
}

type Leitor = (ano: number, dir: string, agrupador: AgrupadorDaCota) => Promise<void>;

const lerCamara: Leitor = async (ano, dir, agrupador) => {
	const csv = await downloadAndExtractForYear(ano, dir);
	for await (const d of lerRegistros(csv, ano)) {
		agrupador.adicionar({ casa: "CAMARA", id_parlamentar: d.id_deputado, ano, documento: d.cnpj_cpf_fornecedor, fornecedor: d.nome_fornecedor, tipo_despesa: d.tipo_despesa, valor: d.valor_documento, data: d.data_documento });
	}
};

const lerSenado: Leitor = async (ano, dir, agrupador) => {
	const texto = fs.readFileSync(baixarCsv(ano, dir), "utf8");
	for (const d of despesasDoCsv(texto, ano)) {
		agrupador.adicionar({ casa: "SENADO", id_parlamentar: d.id_deputado, ano, documento: d.cnpj_cpf_fornecedor, fornecedor: d.nome_fornecedor, tipo_despesa: d.tipo_despesa, valor: d.valor_documento, data: d.data_documento });
	}
};

export const LEITORES: Record<Casa, Leitor> = { CAMARA: lerCamara, SENADO: lerSenado };

type ClientePerfil = Pick<SupabaseClient, "from">;

async function gravarAno(cliente: ClientePerfil, casa: Casa, ano: number, linhas: LinhaAgrupada[]): Promise<void> {
	const { error: erroApagar } = await cliente.from("ceap_fornecedores_ano").delete().eq("casa", casa).eq("ano", ano);
	if (erroApagar) throw new Error(`Falha ao apagar ${casa} ${ano}: ${erroApagar.message}`);
	for (let i = 0; i < linhas.length; i += 1000) {
		const { error } = await cliente.from("ceap_fornecedores_ano").insert(linhas.slice(i, i + 1000));
		if (error) throw new Error(`Falha ao inserir ${casa} ${ano}: ${error.message}`);
	}
}

export interface ResultadoAno {
	casa: Casa;
	ano: number;
	linhas: number;
	semDocumento: number;
	gravado: boolean;
	erro?: string;
}

/** Lê, agrupa, valida e (com `gravar`) grava um ano de uma casa. Nunca lança. */
export async function processarAno(casa: Casa, ano: number, opcoes: { cliente?: ClientePerfil; gravar: boolean; leitores?: Record<Casa, Leitor>; agora?: Date }): Promise<ResultadoAno> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "poligrafo-cota-agrupada-"));
	try {
		const agrupador = new AgrupadorDaCota();
		await (opcoes.leitores ?? LEITORES)[casa](ano, dir, agrupador);
		const linhas = agrupador.linhas();
		const minimo = minimoDeLinhas(casa, ano, opcoes.agora);
		if (linhas.length < minimo) throw new Error(`${linhas.length} grupos (< ${minimo}); base existente preservada`);
		if (opcoes.gravar && opcoes.cliente) await gravarAno(opcoes.cliente, casa, ano, linhas);
		return { casa, ano, linhas: linhas.length, semDocumento: agrupador.semDocumento, gravado: Boolean(opcoes.gravar && opcoes.cliente) };
	} catch (erro) {
		return { casa, ano, linhas: 0, semDocumento: 0, gravado: false, erro: (erro as Error)?.message ?? String(erro) };
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/** ~200 bytes por linha com o índice da chave (medido na prática nas bases agregadas). */
export function linhaDoLog(r: ResultadoAno): string {
	if (r.erro) return `[COTA AGRUPADA] ${r.casa} ${r.ano}: falhou (${r.erro}).`;
	const mb = ((r.linhas * 200) / 1e6).toFixed(1);
	return `[COTA AGRUPADA] ${r.casa} ${r.ano}: ${r.linhas} grupos (~${mb} MB); ${r.semDocumento} nota(s) sem CNPJ/CPF ficaram fora${r.gravado ? "; gravado" : "; só medido"}.`;
}

async function main() {
	dotenv.config({ path: ".env.local" });
	const gravar = process.argv.includes("--gravar");
	const { url, key } = credenciaisBancoPerfil();
	const cliente = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
	let falhas = 0;
	for (const ano of anosDaJanela()) {
		for (const casa of ["CAMARA", "SENADO"] as Casa[]) {
			const r = await processarAno(casa, ano, { cliente, gravar });
			console.log(linhaDoLog(r));
			if (r.erro) falhas++;
		}
	}
	if (falhas) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main().catch((e) => {
		console.error("[COTA AGRUPADA] Erro fatal:", e?.message ?? e);
		process.exit(1);
	});
}
