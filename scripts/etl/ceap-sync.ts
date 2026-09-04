import { parse } from 'csv-parse';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const BATCH_SIZE = 1000;
const DELETE_BATCH_SIZE = 500;
const MIN_REGISTROS_POR_ANO: Record<number, number> = { 2024: 100_000, 2025: 50_000 };
const DOWNLOAD_DELAYS_MS = [15_000, 45_000, 90_000];
type ResultadoAno = { success: boolean; count: number };
type ClienteCeap = Pick<SupabaseClient, 'from' | 'rpc'>;
type RegistroCsv = Record<string, string>;
type Despesa = {
	id_deputado: number;
	casa: string;
	ano: number;
	cnpj_cpf_fornecedor: string | null;
	nome_fornecedor: string;
	tipo_despesa: string;
	valor_documento: number;
	data_documento: string | null;
	url_documento: string | null;
};

function minimoRegistros(ano: number): number {
	return ano < new Date().getFullYear() ? (MIN_REGISTROS_POR_ANO[ano] ?? 10_000) : 1_000;
}

export async function downloadAndExtractForYear(
	ano: number,
	directory: string,
	wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<string> {
	const zipPath = path.join(directory, `Ano-${ano}.csv.zip`);
	const csvPath = path.join(directory, `Ano-${ano}.csv`);
	// O catálogo oficial publica este host. Não substituir por mirrors não verificados.
	const url = `https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`;
	for (let tentativa = 0; tentativa <= DOWNLOAD_DELAYS_MS.length; tentativa++) {
		try {
			// Remove respostas parciais para nunca reutilizar um download/extrato anterior.
			fs.rmSync(zipPath, { force: true });
			fs.rmSync(csvPath, { force: true });
			console.log(`[CEAP SYNC] Download ${ano}, tentativa ${tentativa + 1}/4: ${url}`);
			execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', [
				'--fail', '--location', '--silent', '--show-error',
				'--proto', '=https', '--proto-redir', '=https',
				'--max-time', '180', '--connect-timeout', '45',
				'--output', zipPath, url,
			], { stdio: 'inherit' });
			if (fs.statSync(zipPath).size < 10_000) throw new Error('ZIP menor que 10 KB');
			// unzip valida o CRC; somente o membro esperado é extraído, sem curingas.
			execFileSync('unzip', ['-o', zipPath, `Ano-${ano}.csv`, '-d', directory], { stdio: 'inherit' });
			if (!fs.existsSync(csvPath)) throw new Error('CSV esperado ausente no ZIP');
			return csvPath;
		} catch (error) {
			console.warn(`[CEAP SYNC] Falha no download/extração de ${ano}:`, error instanceof Error ? error.message : error);
			if (tentativa === DOWNLOAD_DELAYS_MS.length) throw new Error(`Download/extração de ${ano} falhou após 4 tentativas.`, { cause: error });
			await wait(DOWNLOAD_DELAYS_MS[tentativa]);
		}
	}
	throw new Error(`Download de ${ano} não concluído.`);
}

async function* lerRegistros(csvPath: string, ano: number): AsyncGenerator<Despesa> {
	const input = fs.createReadStream(csvPath, 'utf8');
	const parser = parse({
		bom: true,
		columns: (headers: string[]) => {
			const required = ['numAno', 'vlrLiquido', 'txtCNPJCPF', 'txtFornecedor', 'txtDescricao', 'datEmissao', 'urlDocumento'];
			if (!headers.includes('txIdCadastro') && !headers.includes('ideCadastro')) required.push('txIdCadastro/ideCadastro');
			const missing = required.filter(field => !headers.includes(field));
			if (missing.length) throw new Error(`CSV CEAP sem colunas obrigatórias: ${missing.join(', ')}`);
			return headers;
		},
		skip_empty_lines: true,
		delimiter: ';',
		relax_quotes: true,
	});
	// pipe não encaminha automaticamente erros da origem para o parser.
	input.on('error', error => parser.destroy(error));
	input.pipe(parser);
	try {
		for await (const row of parser) {
			const record = row as RegistroCsv;
			const cadastro = record.txIdCadastro || record.ideCadastro;
			// Lideranças e outros registros sem deputado não pertencem a este cache.
			if (!cadastro?.trim()) continue;
			const id = Number(cadastro);
			const recordYear = Number(record.numAno);
			const liquido = record.vlrLiquido?.trim();
			const valor = Number(liquido?.replace(',', '.'));
			if (!Number.isInteger(id) || id <= 0 || recordYear !== ano || !liquido || !Number.isFinite(valor)) {
				throw new Error(`Registro CEAP inválido para ${ano}: cadastro, ano ou vlrLiquido inconsistente.`);
			}
			yield {
				id_deputado: id,
				casa: 'CAMARA',
				ano,
				cnpj_cpf_fornecedor: record.txtCNPJCPF ? record.txtCNPJCPF.replace(/\D/g, '') : null,
				nome_fornecedor: record.txtFornecedor || 'Desconhecido',
				tipo_despesa: record.txtDescricao || 'Despesa CEAP',
				valor_documento: valor,
				data_documento: record.datEmissao || null,
				url_documento: record.urlDocumento || null,
			};
		}
	} finally {
		input.destroy();
		parser.destroy();
	}
}

export async function validarCsv(csvPath: string, ano: number, minimo = minimoRegistros(ano)): Promise<number> {
	let count = 0;
	for await (const record of lerRegistros(csvPath, ano)) {
		if (record) count++;
	}
	if (count < minimo) throw new Error(`CSV ${ano} insuficiente: ${count} registros válidos; esperado >= ${minimo}. Cache preservado.`);
	return count;
}

export async function limparAno(client: ClienteCeap, ano: number): Promise<void> {
	let ultimoIdRemovido = BigInt(0);
	let total = 0;
	while (true) {
		// Limitar DELETE diretamente não é suportado por todas as versões do PostgREST.
		// Seleciona uma faixa curta da PK para manter cada transação abaixo do timeout.
		const { data, error: readError } = await client.from('ceap_despesas_cache')
			.select('id').eq('ano', ano).eq('casa', 'CAMARA')
			.order('id', { ascending: true }).limit(DELETE_BATCH_SIZE);
		if (readError) throw new Error(`Falha ao listar cache de ${ano}: ${readError.message}`);
		if (!Array.isArray(data)) throw new Error(`Resposta inválida ao listar cache de ${ano}.`);
		if (data.length === 0) break;
		const ids = data.map(({ id }: { id: number | string }) => {
			if ((typeof id === 'number' && !Number.isSafeInteger(id)) || !/^[1-9]\d*$/.test(String(id))) {
				throw new Error(`ID inválido no cache de ${ano}.`);
			}
			return BigInt(id);
		});
		if (ids[0] <= ultimoIdRemovido || ids.some((id, index) => index > 0 && id <= ids[index - 1])) {
			throw new Error(`Limpeza de ${ano} sem progresso ou IDs fora de ordem; inserção interrompida.`);
		}
		const primeiroId = ids[0].toString();
		const ultimoId = ids[ids.length - 1].toString();
		// Repete ano/casa na exclusão para preservar Senado e outros anos nas lacunas da PK.
		const { error: deleteError } = await client.from('ceap_despesas_cache').delete()
			.eq('ano', ano).eq('casa', 'CAMARA').gte('id', primeiroId).lte('id', ultimoId);
		if (deleteError) throw new Error(`Falha ao limpar lote de ${ano}: ${deleteError.message}`);
		ultimoIdRemovido = ids[ids.length - 1];
		total += ids.length;
		if (total % 10_000 === 0) console.log(`[CEAP SYNC] ${ano}: ${total} registros antigos removidos.`);
	}
	console.log(`[CEAP SYNC] Limpeza de ${ano} concluída: ${total} registros removidos.`);
}

export async function runForYear(
	ano: number,
	client: ClienteCeap,
	download = downloadAndExtractForYear,
	minimo = minimoRegistros(ano),
): Promise<ResultadoAno> {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'poligrafo-ceap-'));
	let count = 0;
	try {
		const csvPath = await download(ano, directory);
		// Duas passagens em stream: valida integralmente ANTES de apagar, sem reter o CSV na RAM.
		const esperado = await validarCsv(csvPath, ano, minimo);
		console.log(`[CEAP SYNC] CSV ${ano} validado: ${esperado} registros. Substituindo cache da Câmara...`);
		await limparAno(client, ano);
		let batch: Despesa[] = [];
		const insert = async () => {
			const { error } = await client.from('ceap_despesas_cache').insert(batch);
			if (error) throw new Error(`Falha ao inserir lote de ${ano}: ${error.message}`);
			count += batch.length;
			batch = [];
		};
		for await (const record of lerRegistros(csvPath, ano)) {
			batch.push(record);
			if (batch.length === BATCH_SIZE) await insert();
		}
		if (batch.length) await insert();
		if (count !== esperado) throw new Error(`Contagem inserida ${count} difere do CSV validado ${esperado}.`);
		console.log(`[CEAP SYNC] ${ano}: ${count} registros inseridos.`);
		return { success: true, count };
	} catch (error) {
		console.error(`[CEAP SYNC] Falha em ${ano}, ${count} registros inseridos:`, error instanceof Error ? error.message : error);
		return { success: false, count };
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
}

export async function runSync(
	client: ClienteCeap,
	anos = Array.from({ length: new Date().getFullYear() - 2023 }, (_, i) => 2024 + i),
	processYear = runForYear,
): Promise<void> {
	let falhas = 0;
	for (const ano of anos) {
		const result = await processYear(ano, client);
		if (!result.success) falhas++;
	}
	if (falhas || anos.length === 0) {
		throw new Error(`${falhas} ano(s) falharam. Views materializadas não foram atualizadas; consulte os logs dos anos afetados.`);
	}
	const { error } = await client.rpc('refresh_ceap_materialized_views');
	if (error) throw new Error(`Erro ao atualizar views materializadas: ${error.message}`);
	console.log('[CEAP SYNC] Todos os anos sincronizados e views materializadas atualizadas.');
}

async function main() {
	dotenv.config({ path: '.env.local' });
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('Faltando NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
	await runSync(createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }));
}

// Importar funções nos testes não carrega credenciais nem executa o ETL.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	main().catch(error => {
		console.error('[CEAP SYNC] Erro fatal:', error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
