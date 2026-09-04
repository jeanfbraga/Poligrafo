import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { downloadAndExtractForYear, limparAno, runForYear, runSync, validarCsv } from '../../scripts/etl/ceap-sync';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => { throw new Error('Banco real proibido no teste'); }) }));

const header = 'ideCadastro;numAno;vlrLiquido;txtCNPJCPF;txtFornecedor;txtDescricao;datEmissao;urlDocumento';
const row = '123;2026;42,50;12.345.678/0001-90;Fornecedor;Passagem;2026-01-01;https://www.camara.leg.br/nota';
let directory: string;

function csv(contents: string): string {
	const file = path.join(directory, 'teste.csv');
	fs.writeFileSync(file, contents);
	return file;
}

function clientMock() {
	const insert = vi.fn().mockResolvedValue({ error: null });
	const lte = vi.fn().mockResolvedValue({ error: null });
	const gte = vi.fn().mockReturnValue({ lte });
	const limit = vi.fn().mockResolvedValueOnce({ data: [{ id: 1 }], error: null }).mockResolvedValue({ data: [], error: null });
	const order = vi.fn().mockReturnValue({ limit });
	const eqCasa = vi.fn().mockReturnValue({ order, gte });
	const eqAno = vi.fn().mockReturnValue({ eq: eqCasa });
	const remove = vi.fn().mockReturnValue({ eq: eqAno });
	const select = vi.fn().mockReturnValue({ eq: eqAno });
	const from = vi.fn().mockReturnValue({ delete: remove, select, insert });
	const rpc = vi.fn().mockResolvedValue({ error: null });
	const client = { from, rpc } as unknown as Parameters<typeof runForYear>[1];
	return { client, from, insert, remove, eqAno, eqCasa, rpc, limit, order, gte, lte };
}

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ceap-teste-'));
	vi.spyOn(console, 'log').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	fs.rmSync(directory, { recursive: true, force: true });
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('download CEAP', () => {
	it('repete timeout com backoff, mantém HTTPS e rejeita artefatos parciais anteriores', async () => {
		let attempts = 0;
		vi.mocked(execFileSync).mockImplementation((command, args) => {
			const values = args as string[];
			if (command !== 'unzip') {
				attempts++;
				const zip = values[values.indexOf('--output') + 1];
				expect(fs.existsSync(zip)).toBe(false);
				fs.writeFileSync(zip, Buffer.alloc(attempts === 1 ? 20 : 10_001));
				if (attempts === 1) throw new Error('curl (28): conexão expirou');
			} else {
				fs.writeFileSync(path.join(directory, 'Ano-2026.csv'), `${header}\n${row}`);
			}
			return Buffer.alloc(0);
		});
		const wait = vi.fn().mockResolvedValue(undefined);
		await expect(downloadAndExtractForYear(2026, directory, wait)).resolves.toBe(path.join(directory, 'Ano-2026.csv'));
		expect(wait).toHaveBeenCalledExactlyOnceWith(15_000);
		const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
		expect(args).toEqual(expect.arrayContaining(['--proto', '=https', '--proto-redir', '--connect-timeout', '45', '--max-time', '180']));
		expect(args.at(-1)).toBe('https://www.camara.leg.br/cotas/Ano-2026.csv.zip');
		expect(args).not.toContain('--insecure');
	});

	it('esgota quatro tentativas e nunca trata ZIP incompleto como download válido', async () => {
		vi.mocked(execFileSync).mockImplementation((_command, args) => {
			const values = args as string[];
			fs.writeFileSync(values[values.indexOf('--output') + 1], 'resposta incompleta');
			return Buffer.alloc(0);
		});
		const wait = vi.fn().mockResolvedValue(undefined);
		await expect(downloadAndExtractForYear(2026, directory, wait)).rejects.toThrow('após 4 tentativas');
		expect(execFileSync).toHaveBeenCalledTimes(4);
		expect(wait.mock.calls.map(([ms]) => ms)).toEqual([15_000, 45_000, 90_000]);
	});
});

describe('integridade e carga CEAP', () => {
	it.each([
		['cabeçalho inválido', 'html;erro\nindisponível;agora'],
		['CSV truncado', `${header}\n${row}\n123;2026`],
		['outro ano', `${header}\n${row.replace(';2026;', ';2025;')}`],
		['valor inválido', `${header}\n${row.replace('42,50', 'inexistente')}`],
		['valor ausente', `${header}\n${row.replace('42,50', '')}`],
		['sem registros', header],
	])('preserva cache antes da deleção: %s', async (_label, contents) => {
		const db = clientMock();
		const result = await runForYear(2026, db.client, async () => csv(contents), 1);
		expect(result).toEqual({ success: false, count: 0 });
		expect(db.from).not.toHaveBeenCalled();
	});

	it('preserva cache quando volume do CSV fica abaixo do mínimo', async () => {
		const db = clientMock();
		await expect(runForYear(2026, db.client, async () => csv(`${header}\n${row}`), 2)).resolves.toEqual({ success: false, count: 0 });
		expect(db.remove).not.toHaveBeenCalled();
	});

	it('sinaliza falha de arquivo antes de qualquer operação de banco', async () => {
		await expect(validarCsv(path.join(directory, 'ausente.csv'), 2026, 1)).rejects.toThrow();
		const db = clientMock();
		await runForYear(2026, db.client, async () => { throw new Error('download falhou'); });
		expect(db.from).not.toHaveBeenCalled();
	});

	it('aceita BOM, vlrLiquido zero/negativo e exclui lideranças sem deputado', async () => {
		const db = clientMock();
		const contents = `\uFEFF${header}\n${row}\n${row.replace('42,50', '0')}\n${row.replace('42,50', '-5.5')}\n${row.replace('123;', ';')}`;
		await expect(runForYear(2026, db.client, async () => csv(contents), 3)).resolves.toEqual({ success: true, count: 3 });
		expect(db.eqAno).toHaveBeenCalledWith('ano', 2026);
		expect(db.eqCasa).toHaveBeenCalledWith('casa', 'CAMARA');
		expect(db.insert.mock.calls[0][0].map((entry: { valor_documento: number }) => entry.valor_documento)).toEqual([42.5, 0, -5.5]);
	});

	it('interrompe inserção se a deleção falhar', async () => {
		const db = clientMock();
		db.lte.mockResolvedValue({ error: { message: 'falha de permissão' } });
		await expect(runForYear(2026, db.client, async () => csv(`${header}\n${row}`), 1)).resolves.toEqual({ success: false, count: 0 });
		expect(db.insert).not.toHaveBeenCalled();
	});

	it('remove três lotes por faixas de PK e só insere após confirmar cache vazio', async () => {
		const db = clientMock();
		db.limit.mockReset()
			.mockResolvedValueOnce({ data: [{ id: 1 }, { id: 5 }], error: null })
			.mockResolvedValueOnce({ data: [{ id: 8 }, { id: 10 }], error: null })
			.mockResolvedValueOnce({ data: [{ id: 15 }], error: null })
			.mockResolvedValueOnce({ data: [], error: null });
		await expect(runForYear(2026, db.client, async () => csv(`${header}\n${row}`), 1)).resolves.toEqual({ success: true, count: 1 });
		expect(db.remove).toHaveBeenCalledTimes(3);
		expect(db.limit).toHaveBeenCalledTimes(4);
		expect(db.limit).toHaveBeenCalledWith(500);
		expect(db.order).toHaveBeenCalledWith('id', { ascending: true });
		expect(db.gte.mock.calls).toEqual([['id', '1'], ['id', '8'], ['id', '15']]);
		expect(db.lte.mock.calls).toEqual([['id', '5'], ['id', '10'], ['id', '15']]);
		expect(db.eqAno.mock.calls.every(call => call[0] === 'ano' && call[1] === 2026)).toBe(true);
		expect(db.eqCasa.mock.calls.every(call => call[0] === 'casa' && call[1] === 'CAMARA')).toBe(true);
		expect(db.insert.mock.invocationCallOrder[0]).toBeGreaterThan(db.limit.mock.invocationCallOrder[3]);
	});

	it('interrompe antes de inserir quando leitura de IDs falha após um lote removido', async () => {
		const db = clientMock();
		db.limit.mockReset()
			.mockResolvedValueOnce({ data: [{ id: 1 }], error: null })
			.mockResolvedValueOnce({ data: null, error: { message: 'timeout de leitura' } });
		await expect(runForYear(2026, db.client, async () => csv(`${header}\n${row}`), 1)).resolves.toEqual({ success: false, count: 0 });
		expect(db.remove).toHaveBeenCalledTimes(1);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it('detecta deleção sem progresso e não entra em loop infinito', async () => {
		const db = clientMock();
		db.limit.mockReset().mockResolvedValue({ data: [{ id: 1 }], error: null });
		await expect(limparAno(db.client, 2026)).rejects.toThrow('sem progresso');
		expect(db.remove).toHaveBeenCalledTimes(1);
		expect(db.limit).toHaveBeenCalledTimes(2);
	});

	it('não interpreta resposta de leitura nula como cache vazio', async () => {
		const db = clientMock();
		db.limit.mockReset().mockResolvedValue({ data: null, error: null });
		await expect(limparAno(db.client, 2026)).rejects.toThrow('Resposta inválida');
		expect(db.remove).not.toHaveBeenCalled();
	});

	it('um lote falhado reprova o ano mesmo com contagem acima do mínimo', async () => {
		const db = clientMock();
		db.insert.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'lote recusado' } });
		const contents = `${header}\n${Array.from({ length: 1001 }, () => row).join('\n')}`;
		await expect(runForYear(2026, db.client, async () => csv(contents), 1)).resolves.toEqual({ success: false, count: 1000 });
	});

	it('falha parcial entre anos não atualiza views nem retorna sucesso', async () => {
		const db = clientMock();
		const year = vi.fn().mockResolvedValueOnce({ success: true, count: 100_000 }).mockResolvedValueOnce({ success: false, count: 0 });
		await expect(runSync(db.client, [2024, 2025], year)).rejects.toThrow('1 ano(s) falharam');
		expect(db.rpc).not.toHaveBeenCalled();
	});

	it('atualiza views apenas com todos os anos completos e propaga erro de refresh', async () => {
		const db = clientMock();
		const year = vi.fn().mockResolvedValue({ success: true, count: 100_000 });
		await runSync(db.client, [2024, 2025], year);
		expect(db.rpc).toHaveBeenCalledExactlyOnceWith('refresh_ceap_materialized_views');
		db.rpc.mockResolvedValue({ error: { message: 'refresh indisponível' } });
		await expect(runSync(db.client, [2024], year)).rejects.toThrow('refresh indisponível');
	});
});
