import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarMunicipalSE, buscarDespesasAracaju } from '../../src/app/api/investigar/estados/se/aracaju';
import { buscarContratosSE, buscarDespesasSE } from '../../src/app/api/investigar/estados/se/tce';
import * as tseModule from '../../src/app/api/investigar/tse';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

vi.mock('../../src/lib/supabase-admin', () => ({
	supabaseAdmin: {
		from: vi.fn()
	}
}));

describe('Sergipe & Aracaju: Extratores Municipais', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe('buscarMunicipalSE', () => {
		it('deve localizar o vereador Elber Batalha em Aracaju via TSE', async () => {
			vi.spyOn(tseModule, 'buscarCpfNoTSE').mockResolvedValueOnce({
				documentoPrincipal: '12345678900',
				nome: 'ELBER BATALHA',
				municipio: 'aracaju',
				uf: 'SE',
				isCnpj: false,
				partido: 'PSB',
				cargo: 'Vereador'
			} as any);

			const resultados = await buscarMunicipalSE('Elber Batalha');

			expect(resultados).toHaveLength(1);
			expect(resultados[0].nome).toBe('ELBER BATALHA');
			expect(resultados[0].cargo).toBe('Vereador em ARACAJU');
			expect(resultados[0].casa).toBe('CAMARA_MUNICIPAL');
			expect(resultados[0].uf).toBe('SE');
		});

		it('deve buscar Prefeito caso não encontre como Vereador', async () => {
			vi.spyOn(tseModule, 'buscarCpfNoTSE')
				.mockResolvedValueOnce(null) // Vereador
				.mockResolvedValueOnce({    // Prefeito
					documentoPrincipal: '98765432100',
					nome: 'CANDIDATO PREFEITO',
					municipio: 'aracaju',
					uf: 'SE',
					isCnpj: false,
					cargo: 'Prefeito'
				} as any);

			const resultados = await buscarMunicipalSE('Candidato Prefeito');

			expect(resultados).toHaveLength(1);
			expect(resultados[0].cargo).toBe('Prefeito em ARACAJU');
			expect(resultados[0].casa).toBe('PREFEITURA');
		});
	});

	describe('buscarDespesasAracaju', () => {
		it('deve retornar despesas do cache do Supabase quando disponíveis', async () => {
			process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

			const mockSelect = vi.fn().mockReturnValue({
				or: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue({
						data: [
							{
								id: 1,
								orgao: 'CMA',
								parlamentar_nome: 'ELBER BATALHA',
								fornecedor_nome: 'GRAFICA EXPRESSA SE',
								fornecedor_cnpj_cpf: '12345678000199',
								valor: 3500.00,
								data_despesa: '2026-03-01',
								categoria_despesa: 'Cota de Gabinete',
								descricao: 'Material gráfico para gabinete',
								fonte_url: 'https://aracaju.se.leg.br'
							}
						],
						error: null
					})
				})
			});

			(supabaseAdmin.from as any).mockReturnValue({
				select: mockSelect
			});

			const despesas = await buscarDespesasAracaju('12345678900', 'Elber Batalha', 'aracaju', 'CMA');

			expect(despesas).toHaveLength(1);
			expect(despesas[0].fornecedor).toBe('GRAFICA EXPRESSA SE');
			expect(despesas[0].valorLiquido).toBe(3500.00);
			expect(despesas[0].tipoDespesa).toContain('CMA');
		});

		it('deve fazer fallback para TCE-SE quando o Supabase estiver vazio', async () => {
			const mockSelect = vi.fn().mockReturnValue({
				or: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue({
						data: [],
						error: null
					})
				})
			});

			(supabaseAdmin.from as any).mockReturnValue({
				select: mockSelect
			});

			// Mock do TCE-SE
			vi.spyOn(tseModule, 'fetchWithTimeout').mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					dados: [
						{
							objeto: 'Serviço de Consultoria',
							fornecedor: 'CONSULTORIA SE LTDA',
							cnpj: '22.333.444/0001-55',
							valor: '12000.00',
							data: '2026-04-10',
							unidadeGestora: 'Câmara Municipal de Aracaju'
						}
					]
				})
			} as any);

			const despesas = await buscarDespesasAracaju('12345678900', 'Elber Batalha', 'aracaju', 'CMA');

			expect(despesas.length).toBeGreaterThanOrEqual(1);
			expect(despesas[0].fornecedor).toBe('CONSULTORIA SE LTDA');
		});
	});

	describe('TCE-SE: buscarContratosSE & buscarDespesasSE', () => {
		it('deve extrair contratos da API de Transparência de Sergipe', async () => {
			vi.spyOn(tseModule, 'fetchWithTimeout').mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					dados: [
						{
							descricao: 'Locação de Veículos',
							fornecedor: 'LOCADORA ARACAJU LTDA',
							cnpj: '33.444.555/0001-66',
							valorPago: '45000.00',
							dataPagamento: '2026-02-15',
							orgao: 'Prefeitura de Aracaju'
						}
					]
				})
			} as any);

			const contratos = await buscarContratosSE('aracaju');

			expect(contratos).toHaveLength(1);
			expect(contratos[0].fornecedor).toBe('LOCADORA ARACAJU LTDA');
			expect(contratos[0].valor).toBe(45000);
			expect(contratos[0].cnpj).toBe('33444555000166');
		});
	});
});
