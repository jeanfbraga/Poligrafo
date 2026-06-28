import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarImoveisMunicipioSupabase } from '../../src/services/integrations/spu/client';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

const { mockChain } = vi.hoisted(() => {
    const chain: any = {
        eq: vi.fn(),
        ilike: vi.fn(),
        select: vi.fn(),
        from: vi.fn(),
        limit: vi.fn(),
        then: vi.fn()
    };
    
    chain.eq.mockReturnValue(chain);
    chain.ilike.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.from.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);

    return { mockChain: chain };
});

vi.mock('../../src/lib/supabase-admin', () => ({
    supabaseAdmin: mockChain
}));

describe('SPU Client (Supabase)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        
        // Configura o 'then' mockado para resolver por padrão com data vazia
        mockChain.then.mockImplementation((resolve: any) => {
            resolve({ data: [], error: null });
        });
    });

    it('deve retornar os imóveis corretamente quando houver dados', async () => {
        const mockData = [
            { id: '123', uf: 'SP', municipio_nome: 'SAO PAULO', endereco: 'Rua A', area_m2: 100, valor_imovel: 50000 },
            { id: '456', uf: 'SP', municipio_nome: 'SAO PAULO', endereco: 'Rua B', area_m2: 200, valor_imovel: 150000 }
        ];

        mockChain.then.mockImplementationOnce((resolve: any) => {
            resolve({ data: mockData, error: null });
        });

        const result = await buscarImoveisMunicipioSupabase('SAO PAULO', 'SP');
        
        expect(result.length).toBe(2);
        expect(result[0].endereco).toBe('Rua A');
        expect(mockChain.from).toHaveBeenCalledWith('spu_imoveis');
        expect(mockChain.ilike).toHaveBeenCalledWith('municipio_nome', '%SAO PAULO%');
        expect(mockChain.eq).toHaveBeenCalledWith('uf', 'SP');
    });

    it('deve retornar um array vazio se o Supabase retornar erro (fail-safe)', async () => {
        mockChain.then.mockImplementationOnce((resolve: any) => {
            resolve({ data: null, error: { message: 'relation "public.spu_imoveis" does not exist' } });
        });

        const result = await buscarImoveisMunicipioSupabase('CIDADE INEXISTENTE');
        expect(result).toEqual([]);
    });

    it('deve buscar sem UF caso o parâmetro UF não seja informado', async () => {
        const result = await buscarImoveisMunicipioSupabase('RECIFE');
        
        expect(mockChain.ilike).toHaveBeenCalledWith('municipio_nome', '%RECIFE%');
        expect(mockChain.eq).not.toHaveBeenCalled();
        expect(result).toEqual([]);
    });
});
