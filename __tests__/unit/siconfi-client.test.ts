import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reiniciarEstadoFonteHttp } from '../../src/lib/fonte-http';
import { buscarEnteEstadual, buscarEntePorIbge, buscarEnteSiconfi, consultarIndicadoresLRF } from '../../src/services/integrations/siconfi/client';

// =====================================================
// SICONFI Client Unit Tests
// =====================================================

// Mock response: entes de MG
const mockEntesResponse = {
    items: [
        { cod_ibge: 3106200, ente: 'Belo Horizonte', uf: 'MG', esfera: 'M', populacao: 2530000, cnpj: '18715383000117' },
        { cod_ibge: 3170206, ente: 'Uberlândia', uf: 'MG', esfera: 'M', populacao: 706000, cnpj: '' },
    ]
};

// Mock RGF response with valid data
const mockRgfItems = [
    { cod_conta: 'ReceitaCorrenteLiquidaAjustada', coluna: 'Valor', valor: 10000000 },
    { cod_conta: 'DespesaComPessoalTotal', coluna: 'Valor', valor: 4800000 },
    { cod_conta: 'DespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: 48.0 },
    { cod_conta: 'LimiteMaximoDespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: 54 },
];

describe('SICONFI Client — entes (lista completa, sem o filtro ?q= que dá 403)', () => {
    const entes = {
        items: [
            ...mockEntesResponse.items,
            { cod_ibge: 52, ente: 'Goiás', uf: 'BR', esfera: 'E', populacao: 7000000, cnpj: '01.409.580/0001-38' },
            { cod_ibge: 53, ente: 'Distrito Federal', uf: 'BR', esfera: 'D', populacao: 3000000, cnpj: '00394601000126' },
        ],
    };
    const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

    beforeEach(() => {
        vi.restoreAllMocks();
        reiniciarEstadoFonteHttp();
    });

    it('pede a lista inteira uma vez (cache) e acha município por nome normalizado', async () => {
        const fetchFn = vi.fn(async () => resposta(entes));
        expect(await buscarEnteSiconfi('MG', 'Belo Horizonte', fetchFn as never)).toMatchObject({ cod_ibge: 3106200, cnpj: '18715383000117' });
        expect(await buscarEnteSiconfi('MG', 'uberlandia', fetchFn as never)).toMatchObject({ ente: 'Uberlândia' });
        expect(await buscarEnteSiconfi('MG', 'Cidade Inexistente', fetchFn as never)).toBeNull();
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toBe('https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes');
    });

    it('município pelo código do IBGE; estado pelo código da UF (no SICONFI a UF do estado vem "BR"); DF é esfera D', async () => {
        const fetchFn = vi.fn(async () => resposta(entes));
        expect(await buscarEntePorIbge('3106200', fetchFn as never)).toMatchObject({ ente: 'Belo Horizonte' });
        expect(await buscarEnteEstadual('go', fetchFn as never)).toMatchObject({ ente: 'Goiás', cnpj: '01409580000138' });
        expect(await buscarEnteEstadual('DF', fetchFn as never)).toMatchObject({ ente: 'Distrito Federal' });
        expect(await buscarEnteEstadual('XX', fetchFn as never)).toBeNull();
        expect(await buscarEntePorIbge('', fetchFn as never)).toBeNull();
    });

    it('API fora do ar: null e aviso no log', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchFn = vi.fn(async () => resposta({ erro: 'x' }, 403));
        expect(await buscarEnteSiconfi('SP', 'São Paulo', fetchFn as never)).toBeNull();
        expect(aviso).toHaveBeenCalledWith('[SICONFI] Lista de entes indisponível (HTTP_4XX).');
    });
});

describe('SICONFI Client — consultarIndicadoresLRF', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('deve calcular situacaoLimite NORMAL quando gasto de pessoal está abaixo do alerta (90%)', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: mockRgfItems }) // 48% < 54*0.90 = 48.6 → ALERTA (edge)
        });

        const indicadores = await consultarIndicadoresLRF(3106200, 2024);
        expect(indicadores).not.toBeNull();
        // 48.0% vs alerta=48.6 → NORMAL
        expect(indicadores!.situacaoLimite).toBe('NORMAL');
        expect(indicadores!.percentualDespesaPessoal).toBe(48);
        expect(indicadores!.limiteMaximoPercentual).toBe(54);
        expect(indicadores!.receitaCorrenteLiquidaAjustada).toBe(10000000);
    });

    it('deve classificar como ALERTA quando gasto ≥ 90% do limite', async () => {
        const rgfAlerta = [
            { cod_conta: 'ReceitaCorrenteLiquidaAjustada', coluna: 'Valor', valor: 10000000 },
            { cod_conta: 'DespesaComPessoalTotal', coluna: 'Valor', valor: 5400000 },
            { cod_conta: 'DespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: 49.0 }, // 49% ≥ 54*0.90=48.6
            { cod_conta: 'LimiteMaximoDespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: 54 },
        ];
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: rgfAlerta })
        });

        const indicadores = await consultarIndicadoresLRF(3106200, 2024);
        expect(indicadores!.situacaoLimite).toBe('ALERTA');
    });

    it('deve classificar como PRUDENCIAL quando gasto ≥ 95% do limite', async () => {
        const rgfPrud = [
            { cod_conta: 'ReceitaCorrenteLiquidaAjustada', coluna: 'Valor', valor: 10000000 },
            { cod_conta: 'DespesaComPessoalTotal', coluna: 'Valor', valor: 5184000 },
            { cod_conta: 'DespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: 51.84 }, // ≥ 54*0.95=51.3
            { cod_conta: 'LimiteMaximoDespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: 54 },
        ];
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: rgfPrud })
        });

        const indicadores = await consultarIndicadoresLRF(3106200, 2024);
        expect(indicadores!.situacaoLimite).toBe('PRUDENCIAL');
    });

    it('deve classificar como EXCEDIDO quando gasto ≥ 100% do limite', async () => {
        const rgfExcedido = [
            { cod_conta: 'ReceitaCorrenteLiquidaAjustada', coluna: 'Valor', valor: 10000000 },
            { cod_conta: 'DespesaComPessoalTotal', coluna: 'Valor', valor: 5500000 },
            { cod_conta: 'DespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: 55.0 }, // ≥ 54
            { cod_conta: 'LimiteMaximoDespesaComPessoalTotal', coluna: '% sobre a RCL Ajustada', valor: 54 },
        ];
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: rgfExcedido })
        });

        const indicadores = await consultarIndicadoresLRF(3106200, 2024);
        expect(indicadores!.situacaoLimite).toBe('EXCEDIDO');
    });

    it('deve calcular percentual quando não vem da API e usar RCL para derivar', async () => {
        const rgfSemPct = [
            { cod_conta: 'ReceitaCorrenteLiquidaAjustada', coluna: 'Valor', valor: 10000000 },
            { cod_conta: 'DespesaComPessoalTotal', coluna: 'Valor', valor: 6000000 },
            // sem coluna '% sobre a RCL Ajustada'
        ];
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: rgfSemPct })
        });

        const indicadores = await consultarIndicadoresLRF(3106200, 2024);
        expect(indicadores).not.toBeNull();
        // 6000000/10000000 = 60% → EXCEDIDO (>54%)
        expect(indicadores!.percentualDespesaPessoal).toBe(60);
        expect(indicadores!.situacaoLimite).toBe('EXCEDIDO');
    });

    it('deve tentar os 3 quadrimestres do ano atual e fallback para ano anterior', async () => {
        // Q3 falha → Q2 falha → Q1 falha → fallback Q3 ano ant. retorna dados
        global.fetch = vi.fn()
            // Q3 atual
            .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
            // Q2 atual
            .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
            // Q1 atual
            .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
            // Q3 ano anterior
            .mockResolvedValueOnce({ ok: true, json: async () => ({ items: mockRgfItems }) });

        const indicadores = await consultarIndicadoresLRF(3106200, 2024);
        expect(indicadores).not.toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(4);
        // Ano retornado deve ser 2023 (fallback)
        expect(indicadores!.exercicio).toBe(2023);
    });

    it('deve retornar null quando todos os períodos falham', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: [] })
        });

        const indicadores = await consultarIndicadoresLRF(9999999, 2024);
        expect(indicadores).toBeNull();
        expect(global.fetch).toHaveBeenCalledTimes(6); // 3 períodos × 2 anos
    });
});
