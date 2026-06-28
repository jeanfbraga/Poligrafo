import { buscarDespesasMunicipalPB } from '../../app/api/investigar/estados/pb/tce';
import * as tse from '../../app/api/investigar/tse';
import * as proxyOsint from '../../app/api/investigar/proxy_osint';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';

describe('TCE-PB Sagres Extrator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    it('deve formatar corretamente as despesas e contratos (GraphNode)', async () => {
        const spyFetch = vi.spyOn(tse, 'fetchWithTimeout');
        // Mock da requisição de Empenhos/Despesas
        spyFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [{
                numero_empenho: '102030',
                valor_empenhado: '50000.00',
                credor: 'Construtora Fictícia LTDA',
                data_emissao: '2026-01-15',
                historico: 'Construção de escola municipal'
            }]
        } as Response);

        // Mock da requisição de Contratos
        spyFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [{
                numero_contrato: '001/2026',
                valor_contratado: '120000.00',
                contratado: 'Fornecedora de Merenda ME',
                data_assinatura: '2026-02-10',
                objeto: 'Fornecimento de merenda'
            }]
        } as Response);

        const resultados = await buscarDespesasMunicipalPB('11122233344', 'Prefeito Teste', 'coxixola', 'PREFEITURA');

        // Validar Empenho
        const empenho = resultados.find((r: any) => r.type === 'DESPESA_PUBLICA');
        expect(empenho).toBeDefined();
        expect(empenho.data.valor).toBe(50000);
        expect(empenho.data.fornecedor).toBe('Construtora Fictícia LTDA');
        expect(empenho.data.descricao).toBe('Construção de escola municipal');

        // Validar Contrato
        const contrato = resultados.find((r: any) => r.type === 'CONTRATO');
        expect(contrato).toBeDefined();
        expect(contrato.data.valor).toBe(120000);
        expect(contrato.data.fornecedor).toBe('Fornecedora de Merenda ME');
        expect(contrato.data.descricao).toBe('Fornecimento de merenda');
    });

    it('deve usar o fallback Federal caso o TCE-PB falhe ou bloqueie a requisição (WAF)', async () => {
        const spyFetch = vi.spyOn(tse, 'fetchWithTimeout');
        const spyProxy = vi.spyOn(proxyOsint, 'buscarProxyOsint');

        // Simular bloqueio Cloudflare (403)
        spyFetch.mockResolvedValue({
            ok: false,
            status: 403
        } as Response);

        spyProxy.mockResolvedValueOnce({
            despesasFederais: [{
                id: 'fallback-1',
                type: 'DESPESA_PUBLICA',
                data: {
                    valor: 1000,
                    fornecedor: 'União Federal'
                }
            }],
            empresasAssociadas: [],
            statusMensagem: 'ok'
        });

        const resultados = await buscarDespesasMunicipalPB('11122233344', 'Prefeito Teste', 'coxixola', 'PREFEITURA');

        expect(spyProxy).toHaveBeenCalledWith('11122233344', 'Prefeito Teste');
        expect(resultados).toHaveLength(1);
        expect(resultados[0].data.fornecedor).toBe('União Federal');
    });

    it('deve lidar com falhas JSON ou campos null de forma resiliente', async () => {
        const spyFetch = vi.spyOn(tse, 'fetchWithTimeout');
        // Empenho mal formatado ou campos nulos
        spyFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [{
                numero_empenho: null,
                valor_empenhado: null,
                credor: null
            }]
        } as Response);

        // Contratos vazio
        spyFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => []
        } as Response);

        const resultados = await buscarDespesasMunicipalPB('11122233344', 'Prefeito Teste', 'coxixola', 'PREFEITURA');

        const empenho = resultados.find((r: any) => r.type === 'DESPESA_PUBLICA');
        expect(empenho).toBeDefined();
        // O valor deve ser parseado para 0 caso seja null
        expect(empenho.data.valor).toBe(0);
        // O credor deve exibir 'Desconhecido' ou fallback para o nome da busca
        expect(empenho.data.fornecedor).toBe('Prefeito Teste'); 
    });
});
