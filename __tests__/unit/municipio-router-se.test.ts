import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarMunicipalMestre, buscarDespesasMunicipalMestre } from '../../src/app/api/investigar/municipios/router';
import * as aracajuModule from '../../src/app/api/investigar/estados/se/aracaju';

describe('Municipal Router: Sergipe & Aracaju (SE)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('deve rotear UF=SE para buscarMunicipalSE no buscarMunicipalMestre', async () => {
		const mockCandidato = {
			ref: 'SE:VEREADOR:aracaju:12345678900',
			id: '12345678900',
			nome: 'ELBER BATALHA',
			cargo: 'Vereador em ARACAJU',
			uf: 'SE',
			casa: 'CAMARA_MUNICIPAL' as const,
			uri: 'aracaju'
		};

		const spy = vi.spyOn(aracajuModule, 'buscarMunicipalSE').mockResolvedValueOnce([mockCandidato]);

		const resultado = await buscarMunicipalMestre('SE', 'Elber Batalha');

		expect(spy).toHaveBeenCalledWith('Elber Batalha');
		expect(resultado).toHaveLength(1);
		expect(resultado[0].nome).toBe('ELBER BATALHA');
		expect(resultado[0].casa).toBe('CAMARA_MUNICIPAL');
	});

	it('deve rotear UF=SE para buscarDespesasAracaju no buscarDespesasMunicipalMestre', async () => {
		const mockDespesas = [
			{
				tipoDespesa: 'Cota de Gabinete (CMA)',
				fornecedor: 'FORNECEDOR ARACAJU',
				cnpjFornecedor: '12345678000199',
				valorLiquido: 2500,
				dataDocumento: '2026-03-10',
				descricao: 'Combustível',
				urlDocumento: 'https://aracaju.se.leg.br'
			}
		];

		const spy = vi.spyOn(aracajuModule, 'buscarDespesasAracaju').mockResolvedValueOnce(mockDespesas);

		const resultado = await buscarDespesasMunicipalMestre('SE', '12345678900', 'Elber Batalha', 'aracaju', 'CAMARA_MUNICIPAL');

		expect(spy).toHaveBeenCalledWith('12345678900', 'Elber Batalha', 'aracaju', 'CAMARA_MUNICIPAL');
		expect(resultado).toHaveLength(1);
		expect(resultado[0].fornecedor).toBe('FORNECEDOR ARACAJU');
	});
});
