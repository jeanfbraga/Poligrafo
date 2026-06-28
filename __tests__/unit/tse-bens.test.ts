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
});
