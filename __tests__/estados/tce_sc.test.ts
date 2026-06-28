import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buscarDespesasMunicipalSC } from '../../src/app/api/investigar/estados/sc/tce';
import * as proxyOsint from '../../src/app/api/investigar/proxy_osint';

describe('TCE-SC: Extrator de Despesas (Unidades Gestoras)', () => {

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('deve extrair as unidades gestoras do município e juntar com proxy', async () => {
        // Mock global fetch for UGs
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                {
                    codigo_unidade: 111,
                    nome_unidade: "Prefeitura Municipal de Tubarão",
                    sigla_unidade: "PMT",
                    nome_municipio: "Tubarão"
                },
                {
                    codigo_unidade: 222,
                    nome_unidade: "Serviço de Água de Tubarão",
                    sigla_unidade: "SAMAE",
                    nome_municipio: "Tubarão"
                },
                {
                    codigo_unidade: 333,
                    nome_unidade: "Prefeitura Municipal de Lages",
                    sigla_unidade: "PML",
                    nome_municipio: "Lages"
                }
            ]
        });

        // Mock Proxy OSINT
        vi.spyOn(proxyOsint, 'buscarProxyOsint').mockResolvedValue({
            idBusca: "123",
            despesasFederais: [
                { tipoDespesa: "Despesa Federal Mock", valorDocumento: 500 }
            ]
        });

        const despesas = await buscarDespesasMunicipalSC("123", "Prefeito X", "tubarao");

        // Should return 2 UGs from Tubarao + 1 from proxy = 3 total
        expect(despesas).toHaveLength(3);
        
        // Verifica UGs
        const ugs = despesas.filter(d => d.tipoDespesa === 'Órgão Vinculado (Governança)');
        expect(ugs).toHaveLength(2);
        expect(ugs[0].valorDocumento).toBe(0);
        expect(ugs[0].nomeFornecedor).toContain('Prefeitura Municipal de Tubarão');
        expect(ugs[1].nomeFornecedor).toContain('SAMAE');
        
        // Verifica Proxy
        const proxy = despesas.find(d => d.tipoDespesa === 'Despesa Federal Mock');
        expect(proxy).toBeDefined();
        expect(proxy?.valorDocumento).toBe(500);
    });
});
