import { parse } from 'csv-parse/sync';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// CSV oficial (UTF-8, delimitador ";", cabeçalho na 1ª linha):
// ID;TIPO_DOCUMENTO;ANO;MÊS;COD_SENADOR;NOME_SENADOR;TIPO_DESPESA;CPF_CNPJ_FORNECEDOR;
// NOME_FORNECEDOR;DOCUMENTO;DATA;DETALHAMENTO;VALOR_REEMBOLSADO

const ANO_INICIO = 2024; // = ANO_INICIO_CEAP (src/lib/investigacao/cota.ts)
const BATCH_SIZE = 1000;
/** Abaixo disso o CSV é considerado inválido e o cache existente é preservado. */
const MINIMO_REGISTROS_ANO_ANTERIOR = 5_000;
const MINIMO_REGISTROS_ANO_ATUAL = 500;
const TAMANHO_MINIMO_ARQUIVO = 100_000;

type ClienteSenado = Pick<SupabaseClient, 'from'>;
type RegistroCsv = Record<string, string>;

export interface DespesaSenado {
	id_deputado: number;
	ano: number;
	cnpj_cpf_fornecedor: string | null;
	nome_fornecedor: string;
	tipo_despesa: string;
	valor_documento: number;
	data_documento: string;
	url_documento: null;
	casa: 'SENADO';
	atualizado_em: string;
}

/** "1.234,56" → 1234.56 (valor vazio ou inválido → 0). */
export function extrairValorReembolsado(val?: string): number {
	if (!val) return 0;
	const n = Number(val.replace(/\./g, '').replace(',', '.'));
	return Number.isFinite(n) ? n : 0;
}

export function parsearCsvSenado(texto: string): RegistroCsv[] {
	return parse(texto, {
		columns: true,
		skip_empty_lines: true,
		delimiter: ';',
		relax_quotes: true,
		relax_column_count: true,
		bom: true,
	}) as RegistroCsv[];
}

export function mapearRegistroSenado(record: RegistroCsv, ano: number, agora: Date = new Date()): DespesaSenado | null {
	if (!record['NOME_SENADOR']) return null;
	const idSenador = parseInt(record['COD_SENADOR'] || '0', 10);
	if (!idSenador) return null;
	const doc = (record['CPF_CNPJ_FORNECEDOR'] || '').replace(/\D/g, '');
	return {
		id_deputado: idSenador,
		ano,
		cnpj_cpf_fornecedor: doc || null,
		nome_fornecedor: record['NOME_FORNECEDOR'] || 'FORNECEDOR NÃO IDENTIFICADO',
		tipo_despesa: record['TIPO_DESPESA'] || 'SEM TIPO',
		valor_documento: extrairValorReembolsado(record['VALOR_REEMBOLSADO']),
		data_documento: record['DATA'] || `${ano}-01-01`,
		url_documento: null, // DOCUMENTO é o número do documento, não uma URL
		casa: 'SENADO',
		atualizado_em: agora.toISOString(),
	};
}

export function despesasDoCsv(texto: string, ano: number): DespesaSenado[] {
	return parsearCsvSenado(texto)
		.map((r) => mapearRegistroSenado(r, ano))
		.filter((d): d is DespesaSenado => d !== null);
}

export function minimoRegistros(ano: number, hoje: Date = new Date()): number {
	return ano < hoje.getFullYear() ? MINIMO_REGISTROS_ANO_ANTERIOR : MINIMO_REGISTROS_ANO_ATUAL;
}

/** Baixa o CSV oficial do ano (também usada pela cota agrupada, ceap-fornecedores-sync.ts). */
export function baixarCsv(ano: number, diretorio: string): string {
	const destino = path.join(diretorio, `Senado-${ano}.csv`);
	const url = `https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${ano}/csv`;
	console.log(`[SENADO SYNC] Baixando ${url}`);
	execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', [
		'--fail', '--location', '--silent', '--show-error',
		'--user-agent', 'Poligrafo-Bot/1.0 (Auditoria Publica)',
		'--proto', '=https', '--proto-redir', '=https',
		'--max-time', '180', '--connect-timeout', '45',
		'--output', destino, url,
	], { stdio: 'inherit' });
	if (fs.statSync(destino).size < TAMANHO_MINIMO_ARQUIVO) throw new Error(`CSV ${ano} pequeno demais.`);
	return destino;
}

async function limparAno(client: ClienteSenado, ano: number): Promise<void> {
	const { error } = await client.from('ceap_despesas_cache').delete().eq('ano', ano).eq('casa', 'SENADO');
	if (error) throw new Error(`Falha ao limpar cache do Senado ${ano}: ${error.message}`);
}

async function inserirEmLotes(client: ClienteSenado, despesas: DespesaSenado[]): Promise<number> {
	let inseridas = 0;
	for (let i = 0; i < despesas.length; i += BATCH_SIZE) {
		const lote = despesas.slice(i, i + BATCH_SIZE);
		const { error } = await client.from('ceap_despesas_cache').insert(lote);
		if (error) throw new Error(`Falha ao inserir lote do Senado: ${error.message}`);
		inseridas += lote.length;
	}
	return inseridas;
}

/** Valida ANTES de apagar: um CSV ruim nunca esvazia o cache. */
export async function runForYear(
	ano: number,
	client: ClienteSenado,
	baixar: (ano: number, dir: string) => string = baixarCsv,
	dryRun = false,
): Promise<{ success: boolean; count: number }> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poligrafo-senado-'));
	try {
		const texto = fs.readFileSync(baixar(ano, dir), 'utf8');
		const despesas = despesasDoCsv(texto, ano);
		const minimo = minimoRegistros(ano);
		if (despesas.length < minimo) throw new Error(`CSV ${ano} com ${despesas.length} registros válidos (< ${minimo}). Cache preservado.`);
		if (dryRun) {
			console.log(`[SENADO SYNC] (dry-run) ${ano}: ${despesas.length} registros válidos.`);
			return { success: true, count: despesas.length };
		}
		await limparAno(client, ano);
		const count = await inserirEmLotes(client, despesas);
		console.log(`[SENADO SYNC] ${ano}: ${count} registros inseridos.`);
		return { success: true, count };
	} catch (error) {
		console.error(`[SENADO SYNC] Falha em ${ano}:`, error instanceof Error ? error.message : error);
		return { success: false, count: 0 };
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

export async function runSync(client: ClienteSenado, anos: number[], dryRun = false): Promise<void> {
	let falhas = 0;
	for (const ano of anos) {
		const r = await runForYear(ano, client, baixarCsv, dryRun);
		if (!r.success) falhas++;
	}
	if (falhas > 0) throw new Error(`${falhas} ano(s) do Senado falharam.`);
}

async function main() {
	dotenv.config({ path: '.env.local' });
	const dryRun = process.argv.includes('--dry-run');
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('Faltando NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
	// Mesma cobertura do cache da Câmara: de 2024 até o ano atual (ver ANO_INICIO_CEAP em lib/investigacao/cota).
	const anos = Array.from({ length: new Date().getFullYear() - ANO_INICIO + 1 }, (_, i) => ANO_INICIO + i);
	await runSync(createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }), anos, dryRun);
	console.log('[SENADO SYNC] Sincronização finalizada.');
}

// Importar as funções nos testes não carrega credenciais nem executa o ETL.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error('[SENADO SYNC] Erro fatal:', error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
