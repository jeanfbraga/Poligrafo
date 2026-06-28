// __tests__/unit/transferegov-client.test.ts
// Testes unitários para o client do TransfereGov (Emendas PIX)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buscarEmendasPorAutor,
  buscarEmendasPorMunicipio,
  buscarEmendasPorCNPJ,
  buscarEmendasPorUF,
  detalheEmenda,
  gerarResumoEmendasPIX,
  parseTransferencia,
} from '../../lib/transferegov/client';

// ==========================================
// Mock do fetch global
// ==========================================
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ==========================================
// Fixtures
// ==========================================

const EMENDA_RAW_1 = {
  id_plano_acao: 12345,
  codigo_plano_acao: 'PA-2026-001',
  ano_plano_acao: 2026,
  situacao_plano_acao: 'Em Execução',
  nome_parlamentar_emenda_plano_acao: 'CLEBER VERDE',
  numero_emenda_parlamentar_plano_acao: '202600120001',
  ano_emenda_parlamentar_plano_acao: '2026',
  valor_custeio_plano_acao: 500000.00,
  valor_investimento_plano_acao: 1500000.00,
  cnpj_beneficiario_plano_acao: '12345678000190',
  nome_beneficiario_plano_acao: 'PREFEITURA MUNICIPAL DE PINHEIRO',
  uf_beneficiario_plano_acao: 'MA',
  codigo_descricao_areas_politicas_publicas_plano_acao: '12 - Saúde',
};

const EMENDA_RAW_2 = {
  id_plano_acao: 12346,
  codigo_plano_acao: 'PA-2026-002',
  ano_plano_acao: 2026,
  situacao_plano_acao: 'Aprovado',
  nome_parlamentar_emenda_plano_acao: 'CLEBER VERDE',
  numero_emenda_parlamentar_plano_acao: '202600120002',
  ano_emenda_parlamentar_plano_acao: '2026',
  valor_custeio_plano_acao: 200000.00,
  valor_investimento_plano_acao: 800000.00,
  cnpj_beneficiario_plano_acao: '98765432000111',
  nome_beneficiario_plano_acao: 'PREFEITURA MUNICIPAL DE SÃO LUÍS',
  uf_beneficiario_plano_acao: 'MA',
  codigo_descricao_areas_politicas_publicas_plano_acao: '04 - Educação',
};

const EMENDA_RAW_3 = {
  id_plano_acao: 12347,
  codigo_plano_acao: 'PA-2025-001',
  ano_plano_acao: 2025,
  situacao_plano_acao: 'Concluído',
  nome_parlamentar_emenda_plano_acao: 'CLEBER VERDE',
  numero_emenda_parlamentar_plano_acao: '202500120001',
  ano_emenda_parlamentar_plano_acao: '2025',
  valor_custeio_plano_acao: 100000.00,
  valor_investimento_plano_acao: 300000.00,
  cnpj_beneficiario_plano_acao: '11223344000155',
  nome_beneficiario_plano_acao: 'GOVERNO DO ESTADO DO MARANHÃO',
  uf_beneficiario_plano_acao: 'MA',
  codigo_descricao_areas_politicas_publicas_plano_acao: '06 - Segurança Pública',
};

// ==========================================
// Testes: parseTransferencia
// ==========================================
describe('parseTransferencia', () => {
  it('deve mapear campos snake_case da API para camelCase', () => {
    const parsed = parseTransferencia(EMENDA_RAW_1);
    
    expect(parsed.idPlanoAcao).toBe(12345);
    expect(parsed.codigoPlanoAcao).toBe('PA-2026-001');
    expect(parsed.nomeParlamentar).toBe('CLEBER VERDE');
    expect(parsed.valorCusteio).toBe(500000.00);
    expect(parsed.valorInvestimento).toBe(1500000.00);
    expect(parsed.cnpjBeneficiario).toBe('12345678000190');
    expect(parsed.nomeBeneficiario).toBe('PREFEITURA MUNICIPAL DE PINHEIRO');
    expect(parsed.ufBeneficiario).toBe('MA');
    expect(parsed.areaPoliticaPublica).toBe('12 - Saúde');
  });

  it('deve retornar null para campos ausentes', () => {
    const parsed = parseTransferencia({});
    
    expect(parsed.idPlanoAcao).toBeNull();
    expect(parsed.nomeParlamentar).toBeNull();
    expect(parsed.valorCusteio).toBeNull();
  });
});

// ==========================================
// Testes: buscarEmendasPorAutor
// ==========================================
describe('buscarEmendasPorAutor', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deve buscar emendas usando filtro ilike por nome do parlamentar', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [EMENDA_RAW_1, EMENDA_RAW_2],
    });

    const emendas = await buscarEmendasPorAutor('CLEBER VERDE');

    expect(emendas).toHaveLength(2);
    expect(emendas[0].nomeParlamentar).toBe('CLEBER VERDE');
    expect(emendas[1].nomeBeneficiario).toBe('PREFEITURA MUNICIPAL DE SÃO LUÍS');

    // Verifica que usou filtro ilike
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('nome_parlamentar_emenda_plano_acao=ilike.*CLEBER+VERDE*');
  });

  it('deve filtrar por ano quando fornecido', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [EMENDA_RAW_1],
    });

    await buscarEmendasPorAutor('CLEBER VERDE', 2026);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('ano_plano_acao=eq.2026');
  });

  it('deve retornar array vazio para erro HTTP', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const emendas = await buscarEmendasPorAutor('teste');
    expect(emendas).toHaveLength(0);
  });

  it('deve retornar array vazio para timeout', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    const emendas = await buscarEmendasPorAutor('teste');
    expect(emendas).toHaveLength(0);
  });

  it('deve lidar com resposta não-array graciosamente', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'not found' }),
    });

    const emendas = await buscarEmendasPorAutor('inexistente');
    expect(emendas).toHaveLength(0);
  });
});

// ==========================================
// Testes: buscarEmendasPorMunicipio
// ==========================================
describe('buscarEmendasPorMunicipio', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deve buscar emendas destinadas a um município específico', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [EMENDA_RAW_1],
    });

    const emendas = await buscarEmendasPorMunicipio('PINHEIRO');

    expect(emendas).toHaveLength(1);
    expect(emendas[0].nomeBeneficiario).toBe('PREFEITURA MUNICIPAL DE PINHEIRO');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('nome_beneficiario_plano_acao=ilike.*PINHEIRO*');
  });
});

// ==========================================
// Testes: buscarEmendasPorCNPJ
// ==========================================
describe('buscarEmendasPorCNPJ', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deve buscar por CNPJ limpo (somente dígitos)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [EMENDA_RAW_1],
    });

    await buscarEmendasPorCNPJ('12.345.678/0001-90');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('cnpj_beneficiario_plano_acao=eq.12345678000190');
  });
});

// ==========================================
// Testes: buscarEmendasPorUF
// ==========================================
describe('buscarEmendasPorUF', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deve forçar UF em uppercase', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await buscarEmendasPorUF('ma', 2026);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('uf_beneficiario_plano_acao=eq.MA');
    expect(calledUrl).toContain('ano_plano_acao=eq.2026');
  });
});

// ==========================================
// Testes: detalheEmenda
// ==========================================
describe('detalheEmenda', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deve retornar detalhe de emenda por ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [EMENDA_RAW_1],
    });

    const emenda = await detalheEmenda(12345);
    expect(emenda).not.toBeNull();
    expect(emenda!.idPlanoAcao).toBe(12345);
    expect(emenda!.codigoPlanoAcao).toBe('PA-2026-001');
  });

  it('deve retornar null quando não encontra', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const emenda = await detalheEmenda(99999);
    expect(emenda).toBeNull();
  });

  it('deve retornar null para erro HTTP', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const emenda = await detalheEmenda(99999);
    expect(emenda).toBeNull();
  });
});

// ==========================================
// Testes: gerarResumoEmendasPIX
// ==========================================
describe('gerarResumoEmendasPIX', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deve agregar dados de múltiplas emendas em um resumo', async () => {
    // Primeira página: 3 resultados (< 15 = fim da paginação)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [EMENDA_RAW_1, EMENDA_RAW_2, EMENDA_RAW_3],
    });

    const resumo = await gerarResumoEmendasPIX('CLEBER VERDE');

    expect(resumo.totalEmendas).toBe(3);
    expect(resumo.valorTotalCusteio).toBe(800000.00);   // 500k + 200k + 100k
    expect(resumo.valorTotalInvestimento).toBe(2600000.00); // 1.5M + 800k + 300k
    expect(resumo.valorTotalGeral).toBe(3400000.00);

    // Municípios únicos
    expect(resumo.municipiosAtendidos).toContain('PREFEITURA MUNICIPAL DE PINHEIRO');
    expect(resumo.municipiosAtendidos).toContain('PREFEITURA MUNICIPAL DE SÃO LUÍS');
    expect(resumo.municipiosAtendidos).toContain('GOVERNO DO ESTADO DO MARANHÃO');

    // Áreas políticas
    expect(resumo.areasPoliticas).toContain('12 - Saúde');
    expect(resumo.areasPoliticas).toContain('04 - Educação');
    expect(resumo.areasPoliticas).toContain('06 - Segurança Pública');

    // UFs mais atendidas
    expect(resumo.ufsMaisAtendidas[0].uf).toBe('MA');
    expect(resumo.ufsMaisAtendidas[0].quantidade).toBe(3);
  });

  it('deve paginar até encontrar página vazia', async () => {
    // Página 1: 15 resultados (tamanho máximo → continua)
    const pag1 = Array(15).fill(null).map((_, i) => ({
      ...EMENDA_RAW_1,
      id_plano_acao: 1000 + i,
      valor_custeio_plano_acao: 100000,
      valor_investimento_plano_acao: 0,
    }));
    // Página 2: 3 resultados (< 15 → para)
    const pag2 = [EMENDA_RAW_2, EMENDA_RAW_3];

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => pag1 })
      .mockResolvedValueOnce({ ok: true, json: async () => pag2 });

    const resumo = await gerarResumoEmendasPIX('CLEBER VERDE');

    expect(resumo.totalEmendas).toBe(17); // 15 + 2
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('deve retornar resumo zerado quando não encontra nada', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const resumo = await gerarResumoEmendasPIX('PARLAMENTAR INEXISTENTE');

    expect(resumo.totalEmendas).toBe(0);
    expect(resumo.valorTotalGeral).toBe(0);
    expect(resumo.municipiosAtendidos).toHaveLength(0);
  });
});
