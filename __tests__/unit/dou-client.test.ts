// __tests__/unit/dou-client.test.ts
// Testes unitários para o client do Diário Oficial da União
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buscarDOU, buscarNomeacoesDOU, lerPublicacaoDOU, extractJsonFromHtml, parsePublicacao } from '../../lib/dou/client';

// ==========================================
// Mock do fetch global
// ==========================================
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ==========================================
// Fixtures
// ==========================================

// HTML de resposta real da Imprensa Nacional (simplificado)
const DOU_SEARCH_HTML_WITH_RESULTS = `
<html>
<body>
<script type="text/javascript" id="_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params">
{
  "total": 2,
  "jsonArray": [
    {
      "title": "PORTARIA Nº 123, DE 15 DE MARÇO DE 2026",
      "abstract": "Nomeia MARIA DA SILVA para exercer o cargo de Diretora do Departamento de Gestão.",
      "urlTitle": "portaria-n-123-de-15-de-marco-de-2026-123456789",
      "pubName": "Ministério da Gestão e da Inovação em Serviços Públicos",
      "artType": "Portaria",
      "pubType": "DO2",
      "pubDate": "15/03/2026",
      "numberPage": "Edição 51",
      "pageNumber": "45",
      "content": "O MINISTRO DE ESTADO DA GESTÃO E DA INOVAÇÃO EM SERVIÇOS PÚBLICOS resolve nomear MARIA DA SILVA para exercer o cargo em comissão DAS 101.5.",
      "assina": "ESTHER DWECK",
      "cargo": "Ministra de Estado da Gestão"
    },
    {
      "title": "EXONERAÇÃO Nº 456",
      "abstract": "Exonera JOÃO PEREIRA do cargo de Assessor Especial.",
      "urlTitle": "exoneracao-n-456-789012345",
      "pubName": "Presidência da República",
      "artType": "Exoneração",
      "pubType": "DO2",
      "pubDate": "15/03/2026",
      "numberPage": "Edição 51",
      "pageNumber": "12",
      "content": null,
      "assina": null,
      "cargo": null
    }
  ]
}
</script>
</body>
</html>
`;

const DOU_SEARCH_HTML_EMPTY = `
<html>
<body>
<script type="text/javascript" id="_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params">
{
  "total": 0,
  "jsonArray": []
}
</script>
</body>
</html>
`;

const DOU_SEARCH_HTML_NO_SCRIPT = `<html><body><h1>Diário Oficial da União</h1></body></html>`;

const DOU_ARTICLE_RESPONSE = {
  title: "PORTARIA Nº 123",
  abstract: "Nomeação de servidor",
  urlTitle: "portaria-n-123-xxx",
  pubName: "MF",
  artType: "Portaria",
  pubType: "DO2",
  pubDate: "10/04/2026",
  content: "Texto completo da portaria de nomeação...",
  assina: "Fernando Haddad",
  cargo: "Ministro da Fazenda"
};

// ==========================================
// Testes: extractJsonFromHtml
// ==========================================
describe('extractJsonFromHtml', () => {
  it('deve extrair JSON válido do HTML da Imprensa Nacional', () => {
    const result = extractJsonFromHtml(DOU_SEARCH_HTML_WITH_RESULTS);
    expect(result).toBeDefined();
    expect(result.jsonArray).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.jsonArray![0].title).toBe('PORTARIA Nº 123, DE 15 DE MARÇO DE 2026');
  });

  it('deve retornar array vazio quando não há resultados', () => {
    const result = extractJsonFromHtml(DOU_SEARCH_HTML_EMPTY);
    expect(result.total).toBe(0);
    expect(result.jsonArray).toHaveLength(0);
  });

  it('deve retornar objeto vazio quando não encontra script tag', () => {
    const result = extractJsonFromHtml(DOU_SEARCH_HTML_NO_SCRIPT);
    expect(result).toEqual({});
  });

  it('deve retornar objeto vazio para HTML vazio', () => {
    expect(extractJsonFromHtml('')).toEqual({});
  });

  it('deve lidar com JSON malformado graciosamente', () => {
    const badHtml = `<script type="text/javascript" id="_br_com_seatecnologia_in_buscadou_BuscaDouPortlet_params">{invalid json}</script>`;
    const result = extractJsonFromHtml(badHtml);
    expect(result).toEqual({});
  });
});

// ==========================================
// Testes: parsePublicacao
// ==========================================
describe('parsePublicacao', () => {
  it('deve parsear campos no formato da API (camelCase)', () => {
    const raw = {
      title: 'Portaria X',
      abstract: 'Resumo',
      urlTitle: 'portaria-x-123',
      pubName: 'MF',
      artType: 'Portaria',
      pubType: 'DO2',
      pubDate: '10/04/2026',
      content: 'Texto...',
      assina: 'Fulano',
      cargo: 'Ministro',
    };
    const pub = parsePublicacao(raw);
    expect(pub.titulo).toBe('Portaria X');
    expect(pub.orgao).toBe('MF');
    expect(pub.tipoPublicacao).toBe('Portaria');
    expect(pub.assinante).toBe('Fulano');
  });

  it('deve lidar com campos nulos/ausentes', () => {
    const pub = parsePublicacao({});
    expect(pub.titulo).toBeNull();
    expect(pub.orgao).toBeNull();
    expect(pub.conteudo).toBeNull();
  });

  it('deve dar prioridade ao campo principal sobre fallback', () => {
    const raw = { title: 'Principal', titulo: 'Fallback' };
    expect(parsePublicacao(raw).titulo).toBe('Principal');
  });
});

// ==========================================
// Testes: buscarDOU
// ==========================================
describe('buscarDOU', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('deve buscar e parsear resultados do DOU com sucesso', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => DOU_SEARCH_HTML_WITH_RESULTS,
    });

    const resultado = await buscarDOU({ termo: 'Maria da Silva' });
    
    expect(resultado.total).toBe(2);
    expect(resultado.publicacoes).toHaveLength(2);
    expect(resultado.publicacoes[0].titulo).toContain('PORTARIA');
    expect(resultado.publicacoes[0].assinante).toBe('ESTHER DWECK');
    expect(resultado.publicacoes[1].tipoPublicacao).toBe('Exoneração');
  });

  it('deve construir URL com parâmetros corretos para Seção 2', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => DOU_SEARCH_HTML_EMPTY,
    });

    await buscarDOU({ termo: 'João', secao: 'SECAO_2', periodo: 'ANO' });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('s=do2');
    expect(calledUrl).toContain('exactDate=ano');
    expect(calledUrl).toContain('q=Jo%C3%A3o');
  });

  it('deve usar período personalizado com datas em formato dd-mm-yyyy', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => DOU_SEARCH_HTML_EMPTY,
    });

    await buscarDOU({
      termo: 'teste',
      dataInicio: '2026-01-01',
      dataFim: '2026-03-31',
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('publishFrom=01-01-2026');
    expect(calledUrl).toContain('publishTo=31-03-2026');
    expect(calledUrl).toContain('exactDate=personalizado');
  });

  it('deve retornar vazio para HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const resultado = await buscarDOU({ termo: 'teste' });
    expect(resultado.total).toBe(0);
    expect(resultado.publicacoes).toHaveLength(0);
  });

  it('deve retornar vazio quando HTML não contém script tag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => DOU_SEARCH_HTML_NO_SCRIPT,
    });

    const resultado = await buscarDOU({ termo: 'teste' });
    expect(resultado.total).toBe(0);
  });

  it('deve retornar vazio em caso de timeout (AbortError)', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

    const resultado = await buscarDOU({ termo: 'teste', timeout: 100 });
    expect(resultado.total).toBe(0);
  });

  it('deve retornar vazio em caso de erro de rede', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const resultado = await buscarDOU({ termo: 'teste' });
    expect(resultado.total).toBe(0);
  });
});

// ==========================================
// Testes: buscarNomeacoesDOU
// ==========================================
describe('buscarNomeacoesDOU', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deve buscar na Seção 2 com busca exata entre aspas', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => DOU_SEARCH_HTML_WITH_RESULTS,
    });

    const resultado = await buscarNomeacoesDOU('Maria da Silva');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    // Termo entre aspas para busca exata
    expect(calledUrl).toContain('q=%22Maria+da+Silva%22');
    // Seção 2 = atos de pessoal
    expect(calledUrl).toContain('s=do2');
    expect(resultado.publicacoes).toHaveLength(2);
  });
});

// ==========================================
// Testes: lerPublicacaoDOU
// ==========================================
describe('lerPublicacaoDOU', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deve ler artigo completo pelo urlTitle', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => DOU_ARTICLE_RESPONSE,
    });

    const pub = await lerPublicacaoDOU('portaria-n-123-xxx');
    expect(pub).not.toBeNull();
    expect(pub!.titulo).toBe('PORTARIA Nº 123');
    expect(pub!.assinante).toBe('Fernando Haddad');
    expect(pub!.cargoAssinante).toBe('Ministro da Fazenda');
  });

  it('deve retornar null para artigo não encontrado (404)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const pub = await lerPublicacaoDOU('url-inexistente');
    expect(pub).toBeNull();
  });

  it('deve retornar null para erro de rede', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    const pub = await lerPublicacaoDOU('url-qualquer');
    expect(pub).toBeNull();
  });
});
