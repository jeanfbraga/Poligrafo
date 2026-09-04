import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FalhaRedeCamara, executarPreflight, verificarConexaoCamara } from '../../scripts/etl/camara-preflight.mjs';

const { curl, gravarOutput } = vi.hoisted(() => ({ curl: vi.fn(), gravarOutput: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: curl }));
vi.mock('node:fs', () => ({ appendFileSync: gravarOutput }));

describe('Preflight sem gravações da Câmara', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.stubEnv('GITHUB_OUTPUT', '/output-de-teste');
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.useRealTimers();
		process.exitCode = 0;
	});

	it('valida a listagem por HTTPS sem autorizar outro runner', async () => {
		curl.mockImplementation((_file, _args, _options, callback) => callback(null, '{"dados":[{"id":1}]}\n200'));
		await executarPreflight();
		expect(gravarOutput).toHaveBeenCalledWith('/output-de-teste', 'retryable=false\n');
		const [, args, options] = curl.mock.calls[0];
		expect(args).toContain('--fail');
		expect(args).toContain('--proto-redir');
		expect(args).not.toContain('--insecure');
		expect(options.shell).toBeUndefined();
	});

	it('esgota duas falhas de conexão antes de autorizar outro runner', async () => {
		vi.useFakeTimers();
		curl.mockImplementation((_file, _args, _options, callback) => callback(Object.assign(new Error('timeout'), { code: 28 })));
		const preflight = executarPreflight();
		await vi.runAllTimersAsync();
		await preflight;
		expect(curl).toHaveBeenCalledTimes(2);
		expect(gravarOutput).toHaveBeenCalledWith('/output-de-teste', 'retryable=true\n');
		expect(process.exitCode).toBe(1);
	});

	it.each([22, 60, 'ENOENT'])('não autoriza outro runner para erro HTTP, certificado ou execução (%s)', async code => {
		curl.mockImplementation((_file, _args, _options, callback) => callback(Object.assign(new Error('erro permanente'), { code })));
		await executarPreflight();
		expect(curl).toHaveBeenCalledTimes(1);
		expect(gravarOutput).toHaveBeenCalledWith('/output-de-teste', 'retryable=false\n');
		expect(process.exitCode).toBe(1);
	});

	it.each(['<html>manutenção</html>\n200', '{"dados":[]}\n200', '{"dados":null}\n200', '{"dados":[1]}\n400', '{"dados":[1]}\n500'])('reprova resposta inválida ou HTTP sem classificar como rede: %s', async body => {
		curl.mockImplementation((_file, _args, _options, callback) => callback(null, body));
		await executarPreflight();
		expect(curl).toHaveBeenCalledTimes(1);
		expect(gravarOutput).toHaveBeenCalledWith('/output-de-teste', 'retryable=false\n');
		expect(process.exitCode).toBe(1);
	});

	it('recupera conexão na mesma VM antes de recorrer a outro runner', async () => {
		curl.mockImplementationOnce((_file, _args, _options, callback) => callback(Object.assign(new Error('conexão'), { code: 7 })))
			.mockImplementationOnce((_file, _args, _options, callback) => callback(null, '{"dados":[{"id":1}]}\n200'));
		expect(await verificarConexaoCamara(0)).toBe(1);
		expect(curl).toHaveBeenCalledTimes(2);
	});

	it('interrompe as tentativas se uma falha de rede revelar erro HTTP', async () => {
		curl.mockImplementationOnce((_file, _args, _options, callback) => callback(Object.assign(new Error('conexão'), { code: 7 })))
			.mockImplementationOnce((_file, _args, _options, callback) => callback(Object.assign(new Error('HTTP'), { code: 22 })));
		await expect(verificarConexaoCamara(0)).rejects.not.toBeInstanceOf(FalhaRedeCamara);
		expect(curl).toHaveBeenCalledTimes(2);
	});
});
