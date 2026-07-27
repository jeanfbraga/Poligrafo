import { describe, it, expect, vi } from 'vitest';
import { GET } from '../../src/app/api/perfil/presidente/[id]/route';

// Mock dependências
vi.mock('@/app/api/investigar/tse', () => ({
  buscarCpfNoTSE: vi.fn().mockResolvedValue({
    cpf: '12345678900',
    patrimonioTotal: 1000000,
    bensDeclarados: [],
    anoEleicao: 2022
  })
}));

describe('Presidente API Route', () => {
    it('Deve retornar erro 404 para presidente não encontrado', async () => {
        const req = new Request('http://localhost/api/perfil/presidente/fulano');
        const res = await GET(req, { params: Promise.resolve({ id: 'fulano' }) });
        
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error).toBe('Presidente não encontrado na base VIP.');
    });

    it('Deve retornar sucesso para lula e injetar mandato correto', async () => {
        const req = new Request('http://localhost/api/perfil/presidente/lula');
        const res = await GET(req, { params: Promise.resolve({ id: 'lula' }) });
        
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.perfil.id).toBe('lula');
        expect(data.perfil.mandato).toContain('01/01/2023 - 31/12/2026');
        expect(data.tse.cpf).toBe('12345678900');
    });

    it('Deve retornar sucesso para bolsonaro e injetar mandato correto (2019-2022)', async () => {
        const req = new Request('http://localhost/api/perfil/presidente/bolsonaro');
        const res = await GET(req, { params: Promise.resolve({ id: 'bolsonaro' }) });
        
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.perfil.id).toBe('bolsonaro');
        expect(data.perfil.mandato).toContain('01/01/2019 - 31/12/2022');
    });
});
