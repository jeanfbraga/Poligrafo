import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	parseValorBRL,
	sanitizarDocumento,
	formatarDataISO,
	extrairDespesasCMA,
	extrairContratosPrefeitura,
	syncAracajuDespesas
} from '../../scripts/etl/aracaju-sync';

describe('Aracaju ETL Sync: Utilitários e Extração', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe('parseValorBRL', () => {
		it('deve converter valores no formato BRL para float numérico', () => {
			expect(parseValorBRL('1.234,56')).toBe(1234.56);
			expect(parseValorBRL('R$ 10.500,90')).toBe(10500.90);
			expect(parseValorBRL('0,00')).toBe(0);
			expect(parseValorBRL(500.25)).toBe(500.25);
			expect(parseValorBRL(undefined)).toBe(0);
			expect(parseValorBRL(null)).toBe(0);
			expect(parseValorBRL('invalido')).toBe(0);
		});
	});

	describe('sanitizarDocumento', () => {
		it('deve remover caracteres não numéricos de CPF e CNPJ', () => {
			expect(sanitizarDocumento('12.345.678/0001-90')).toBe('12345678000190');
			expect(sanitizarDocumento('123.456.789-00')).toBe('12345678900');
			expect(sanitizarDocumento(undefined)).toBe('');
			expect(sanitizarDocumento(null)).toBe('');
		});
	});

	describe('formatarDataISO', () => {
		it('deve formatar data DD/MM/YYYY para YYYY-MM-DD', () => {
			expect(formatarDataISO('15/03/2026')).toBe('2026-03-15');
			expect(formatarDataISO('2026-05-20T10:00:00Z')).toBe('2026-05-20');
			expect(formatarDataISO(undefined)).toBe('');
		});
	});

	describe('extrairDespesasCMA', () => {
		it('deve extrair vereadores do Portal da CMA e SAPL', async () => {
			const mockHtmlPortal = `
				<div class="tileItem">
					<a href="https://www.aracaju.se.leg.br/processo-legislativo/parlamentares/elber-batalha">Elber Batalha</a>
				</div>
			`;

			const mockHtmlSapl = `
				<a href="parlamentar_mostrar_proc?cod_parlamentar=191">Elber Batalha</a>
			`;

			global.fetch = vi.fn()
				.mockResolvedValueOnce({
					ok: true,
					text: async () => mockHtmlPortal
				})
				.mockResolvedValueOnce({
					ok: true,
					text: async () => mockHtmlSapl
				});

			const registros = await extrairDespesasCMA(2026);
			expect(registros.length).toBeGreaterThanOrEqual(1);
			expect(registros[0].orgao).toBe('CMA');
			expect(registros[0].parlamentar_nome).toBe('ELBER BATALHA');
		});
	});

	describe('extrairContratosPrefeitura', () => {
		it('deve extrair contratos da API de compras da Prefeitura de Aracaju', async () => {
			const mockContratos = [
				{
					ID: 100,
					numeroContrato: '001/2026',
					orgaoSigla: 'SEPLOG',
					orgaoNome: 'Secretaria Municipal',
					objeto: 'Locação de Veículos',
					dataAssinatura: '15/01/2026',
					contratado: 'EMPRESA LOCADORA LTDA',
					valorContrato: 'R$ 50.000,00',
					modalidade: 'Pregão Eletrônico',
					fiscalGestor: 'GESTOR TESTE'
				}
			];

			global.fetch = vi.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockContratos
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => []
				});

			const registros = await extrairContratosPrefeitura(2026);
			expect(registros).toHaveLength(1);
			expect(registros[0].orgao).toBe('PREFEITURA');
			expect(registros[0].fornecedor_cnpj_cpf).toBe('13128784000184');
			expect(registros[0].valor).toBe(50000);
			expect(registros[0].fornecedor_nome).toBe('EMPRESA LOCADORA LTDA');
		});
	});

	describe('syncAracajuDespesas', () => {
		it('deve realizar upsert no Supabase com sucesso', async () => {
			const mockHtmlCma = `
				<div class="tileItem">
					<a href="https://www.aracaju.se.leg.br/processo-legislativo/parlamentares/elber-batalha">Elber Batalha</a>
				</div>
			`;
			const mockHtmlSapl = `
				<a href="parlamentar_mostrar_proc?cod_parlamentar=191">Elber Batalha</a>
			`;
			const mockContratos = [
				{
					ID: 200,
					numeroContrato: '002/2026',
					orgaoSigla: 'CMA',
					orgaoNome: 'Câmara Municipal de Aracaju',
					objeto: 'Fornecimento de TI',
					dataAssinatura: '20/01/2026',
					contratado: 'EMPRESA DE TI LTDA',
					valorContrato: 'R$ 120.000,00',
					modalidade: 'Pregão'
				}
			];

			global.fetch = vi.fn()
				.mockResolvedValueOnce({
					ok: true,
					text: async () => mockHtmlCma
				})
				.mockResolvedValueOnce({
					ok: true,
					text: async () => mockHtmlSapl
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => mockContratos
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => []
				});

			const mockUpsert = vi.fn().mockResolvedValue({ error: null });
			const mockClient: any = {
				from: vi.fn().mockReturnValue({
					upsert: mockUpsert
				})
			};

			const resultado = await syncAracajuDespesas(mockClient, 2026);
			expect(resultado.totalInseridos).toBeGreaterThan(0);
			expect(resultado.totalErros).toBe(0);
			expect(mockUpsert).toHaveBeenCalled();
		});
	});
});
