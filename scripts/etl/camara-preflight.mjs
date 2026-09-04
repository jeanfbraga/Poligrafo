import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const URL_DEPUTADOS = 'https://dadosabertos.camara.leg.br/api/v2/deputados';
// Códigos curl de DNS, conexão, timeout e interrupção de transporte.
// HTTP, certificados inválidos, executável ausente e JSON inválido não autorizam outro runner.
const ERROS_REDE = new Set([5, 6, 7, 28, 52, 55, 56]);

export class FalhaRedeCamara extends Error {}

function consultarDeputados() {
	return new Promise((resolver, rejeitar) => {
		execFile(process.platform === 'win32' ? 'curl.exe' : 'curl', [
			'--silent', '--show-error', '--fail', '--location',
			'--proto', '=https', '--proto-redir', '=https',
			'--connect-timeout', '15', '--max-time', '25',
			'--header', 'Accept: application/json', '--user-agent', 'Mozilla/5.0 Poligrafo/1.0',
			'--write-out', '\n%{http_code}', URL_DEPUTADOS,
		], { encoding: 'utf8', timeout: 30_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (erro, stdout) => {
			if (erro) {
				const falha = ERROS_REDE.has(erro.code)
					? new FalhaRedeCamara(`Falha de conexão com a Câmara (curl ${erro.code})`, { cause: erro })
					: erro;
				rejeitar(falha);
				return;
			}
			try {
				const posicaoStatus = stdout.lastIndexOf('\n');
				const status = Number(stdout.slice(posicaoStatus + 1));
				if (posicaoStatus < 0 || !Number.isInteger(status) || status < 200 || status >= 300) {
					throw new Error(`Preflight da Câmara recebeu HTTP ${status}.`);
				}
				const resposta = JSON.parse(stdout.slice(0, posicaoStatus));
				if (!Array.isArray(resposta?.dados) || resposta.dados.length === 0) {
					throw new Error('Preflight da Câmara recebeu lista de deputados inválida ou vazia.');
				}
				resolver(resposta.dados.length);
			} catch (erroResposta) {
				rejeitar(erroResposta);
			}
		});
	});
}

/** Somente leitura; nenhuma dependência de Supabase ou dos ETLs. */
export async function verificarConexaoCamara(esperaMs = 5000) {
	for (let tentativa = 1; tentativa <= 2; tentativa++) {
		try {
			return await consultarDeputados();
		} catch (erro) {
			if (!(erro instanceof FalhaRedeCamara) || tentativa === 2) throw erro;
			console.warn(`[PREFLIGHT CÂMARA] ${erro.message}. Tentativa ${tentativa}/2.`);
			await new Promise(resolver => setTimeout(resolver, esperaMs));
		}
	}
}

export async function executarPreflight() {
	try {
		const quantidade = await verificarConexaoCamara();
		if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'retryable=false\n');
		console.log(`[PREFLIGHT CÂMARA] Conexão validada: ${quantidade} deputados. Nenhuma gravação realizada.`);
	} catch (erro) {
		const retryable = erro instanceof FalhaRedeCamara;
		if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `retryable=${retryable}\n`);
		console.error('[PREFLIGHT CÂMARA]', erro);
		process.exitCode = 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await executarPreflight();
}
