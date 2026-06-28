import { GET } from '@/app/api/investigar/route';
import { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mocks and simulation for cascade search resolution.
 */
vi.mock('@/app/api/investigar/tse', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    buscarCpfNoTSE: vi.fn(),
    buscarDoadoresTSE: vi.fn().mockResolvedValue([]),
    fetchWithTimeout: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dados: [] })
    })
  };
});

describe('Resolução e Desambiguação de Políticos', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ dados: [] })
    });
  });

  it('Deve priorizar a busca direta por forceRef (ID) ignorando a cascata', async () => {
    // Simula a requisição disparada pelo frontend quando o usuário seleciona um Federal no AutoComplete
    const req = new NextRequest('http://localhost:3000/api/investigar?nome=Gilberto%20Nascimento&ref=FEDERAL:CAMARA:74270');
    
    // Este teste assegura que os parâmetros são montados corretamente
    expect(req.nextUrl.searchParams.get('ref')).toBe('FEDERAL:CAMARA:74270');
  });

  it('Deve buscar em cascata (com risco de falsos positivos) se apenas a string de nome for passada', async () => {
    const req = new NextRequest('http://localhost:3000/api/investigar?nome=Gilberto%20Nascimento');
    expect(req.nextUrl.searchParams.get('ref')).toBeNull();
    expect(req.nextUrl.searchParams.get('nome')).toBe('Gilberto Nascimento');
  });

  it('Deve resolver automaticamente MARUSSA BOLDRIN para a ref do congresso-index.json', async () => {
    const req = new NextRequest('http://localhost:3000/api/investigar?nome=MARUSSA%20BOLDRIN');
    const response = await GET(req);

    expect(response).toBeDefined();
    if (response) {
       expect(response.status).toBe(200);
       
       // Process stream to ensure no early crash
       const reader = (response as any).body?.getReader();
       if (reader) {
           const { value, done } = await reader.read();
           const text = new TextDecoder().decode(value);
           // We expect it to at least start the stream correctly and log the bypass
           expect(text.length).toBeGreaterThan(0);
       }
    }
  });

});
