import { describe, it, expect, vi } from 'vitest';

const { supabaseAdmin } = vi.hoisted(() => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  }
}));

vi.mock('../../src/lib/supabase-admin', () => ({
  supabaseAdmin
}));

import { buscarBensHistoricoTSE } from '../../src/services/integrations/tse/bens';

describe('TSE Histórico Client Supabase', () => {
  it('should return historico de bens on success', async () => {
    supabaseAdmin.order.mockResolvedValueOnce({
      data: [{ ano_eleicao: 2022, valor_total: 1000 }],
      error: null
    } as any);

    const result = await buscarBensHistoricoTSE('123.456.789-00');
    expect(result).toHaveLength(1);
    expect(result[0].ano_eleicao).toBe(2022);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('tse_bens_historico');
    expect(supabaseAdmin.eq).toHaveBeenCalledWith('cpf_candidato', '12345678900');
  });

  it('should return empty array on error (fail-safe)', async () => {
    supabaseAdmin.order.mockResolvedValueOnce({
      data: null,
      error: new Error('DB timeout')
    } as any);

    const result = await buscarBensHistoricoTSE('ERROR');
    expect(result).toEqual([]);
  });

  it('por nome: só o nome completo idêntico (o nome de urna curto não basta)', async () => {
    const linhas = [{ cpf_candidato: '12345678900', nome_candidato: 'MARIO LUIS FRIAS', ano_eleicao: 2022, valor_total: 500000 }];
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: linhas, error: null }) }),
      }),
    } as any);

    const { buscarBensPorNomeTSE } = await import('../../src/services/integrations/tse/bens');
    expect(await buscarBensPorNomeTSE('Mario Frias')).toEqual([]);
    expect(await buscarBensPorNomeTSE('Mário Luís Frias')).toEqual(linhas);
  });

  it('por nome: dois CPFs com o mesmo nome completo (homônimos) = nada, para não misturar patrimônios', async () => {
    const { bensDeUmaPessoa } = await import('../../src/services/integrations/tse/bens');
    const a = { cpf_candidato: '11111111111', nome_candidato: 'JOSE DA SILVA', ano_eleicao: 2022, valor_total: 1, descricao_bens: [] };
    const b = { ...a, cpf_candidato: '22222222222' };
    expect(bensDeUmaPessoa([a, b], 'José da Silva')).toEqual([]);
    expect(bensDeUmaPessoa([a, { ...a, ano_eleicao: 2018 }], 'José da Silva')).toHaveLength(2);
  });
});

