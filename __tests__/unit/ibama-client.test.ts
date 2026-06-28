import { describe, it, expect, vi } from 'vitest';

const { supabaseAdmin } = vi.hoisted(() => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }
}));

vi.mock('../../lib/supabase-admin', () => ({
  supabaseAdmin
}));

import { buscarInfracoesIbama } from '../../lib/ibama/client';

describe('IBAMA Client Supabase', () => {
  it('should return infracoes on success', async () => {
    supabaseAdmin.eq.mockResolvedValueOnce({
      data: [{ cpf_cnpj: '00000000000191', valor_multa: 100 }],
      error: null
    } as any);

    const result = await buscarInfracoesIbama('00.000.000/0001-91');
    expect(result).toHaveLength(1);
    expect(result[0].valor_multa).toBe(100);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('ibama_infracoes');
    expect(supabaseAdmin.eq).toHaveBeenCalledWith('cpf_cnpj', '00000000000191');
  });

  it('should return empty array on error (fail-safe)', async () => {
    supabaseAdmin.eq.mockResolvedValueOnce({
      data: null,
      error: new Error('DB timeout')
    } as any);

    const result = await buscarInfracoesIbama('123');
    expect(result).toEqual([]);
  });
});
