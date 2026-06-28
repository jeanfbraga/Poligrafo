import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../src/app/api/investigar/contratos-beneficiario/route';
import { fetchContratosByCNPJ } from '../../src/services/integrations/pncp/client';

// Mock do fetch global
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../../lib/pncp/client', () => ({
  fetchContratosByCNPJ: vi.fn(),
}));

describe('🔗 API Contratos Beneficiário (PNCP)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar 400 se o parâmetro CNPJ estiver ausente', async () => {
    const request = new Request('http://localhost:3000/api/investigar/contratos-beneficiario');
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('CNPJ é obrigatório');
  });

  it('deve retornar 400 se o CNPJ for inválido (tamanho incorreto)', async () => {
    const request = new Request('http://localhost:3000/api/investigar/contratos-beneficiario?cnpj=123');
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('CNPJ inválido');
  });

  it('deve buscar e consolidar contratos como comprador (PNCP) e como fornecedor', async () => {
    const mockCnpj = '12345678000190';
    const request = new Request(`http://localhost:3000/api/investigar/contratos-beneficiario?cnpj=${mockCnpj}`);

    // Mock fetch for buscarContratosComoOrgao (ano corrente)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            orgaoEntidade: { razaoSocial: 'PREFEITURA TESTE ORGAO' },
            objetoContrato: 'CONTRATACAO DE SERVICOS DE TESTE',
            valorInicial: 50000,
            dataAssinatura: '2026-05-01',
          }
        ]
      })
    });

    // Mock fetch for buscarContratosComoOrgao (ano anterior)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [] })
    });

    // Mock fetchContratosByCNPJ (como fornecedor)
    vi.mocked(fetchContratosByCNPJ).mockResolvedValueOnce([
      {
        numeroControlePNCP: '123-1',
        dataAssinatura: '2026-04-15',
        orgaoEntidade: { cnpj: '11111111000122', razaoSocial: 'OUTRO ORGAO COMPRADOR', poderId: '1', esferaId: 'M' },
        nomeRazaoSocialFornecedor: 'BENEFICIARIO LTDA',
        niFornecedor: mockCnpj,
        objetoContrato: 'FORNECIMENTO DE TESTE',
        valorInicial: 30000,
      }
    ]);

    const response = await GET(request);
    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body.contracts).toBeDefined();
    expect(body.contracts.length).toBe(2);

    // Deve estar ordenado por data decrescente
    expect(body.contracts[0].tipo).toBe('COMPRADOR');
    expect(body.contracts[0].orgao).toBe('PREFEITURA TESTE ORGAO');
    expect(body.contracts[0].data).toBe('2026-05-01');

    expect(body.contracts[1].tipo).toBe('FORNECEDOR');
    expect(body.contracts[1].orgao).toBe('OUTRO ORGAO COMPRADOR');
    expect(body.contracts[1].data).toBe('2026-04-15');
  });

  it('deve lidar com falhas de rede de forma robusta retornando array vazio', async () => {
    const mockCnpj = '12345678000190';
    const request = new Request(`http://localhost:3000/api/investigar/contratos-beneficiario?cnpj=${mockCnpj}`);

    mockFetch.mockRejectedValue(new Error('Network failure'));
    vi.mocked(fetchContratosByCNPJ).mockRejectedValue(new Error('PNCP Client Failure'));

    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.contracts).toEqual([]);
  });
});
