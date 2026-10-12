import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as roteador from '../../src/app/api/investigar/municipios/router';
import * as aracajuModule from '../../src/app/api/investigar/estados/se/aracaju';

const { buscarDespesasMunicipalMestre } = roteador;

describe('Municipal Router: Sergipe & Aracaju (SE)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('a varredura de municípios no TSE ao vivo saiu (o vereador vem da base de eleitos)', () => {
		expect('buscarMunicipalMestre' in roteador).toBe(false);
		expect('buscarMunicipalSE' in aracajuModule).toBe(false);
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
