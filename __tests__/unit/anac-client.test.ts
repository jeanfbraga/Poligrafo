import { describe, it, expect, vi } from 'vitest';

const { supabaseAdmin } = vi.hoisted(() => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  }
}));

vi.mock('../../src/lib/supabase-admin', () => ({
  supabaseAdmin
}));

import { buscarAeronavesProprietario } from '../../src/services/integrations/anac/client';

describe('ANAC Client Supabase', () => {
  it('should return aeronaves on success', async () => {
    supabaseAdmin.limit.mockResolvedValueOnce({
      data: [{ prefixo: 'PR-XYZ', modelo: 'KING AIR' }],
      error: null
    } as any);

    const result = await buscarAeronavesProprietario('TESTE');
    expect(result).toHaveLength(1);
    expect(result[0].prefixo).toBe('PR-XYZ');
    expect(supabaseAdmin.from).toHaveBeenCalledWith('anac_rab');
    expect(supabaseAdmin.ilike).toHaveBeenCalledWith('proprietario_nome', '%TESTE%');
  });

  it('should return empty array on error (fail-safe)', async () => {
    supabaseAdmin.limit.mockResolvedValueOnce({
      data: null,
      error: new Error('DB timeout')
    } as any);

    const result = await buscarAeronavesProprietario('ERROR');
    expect(result).toEqual([]);
  });
});
