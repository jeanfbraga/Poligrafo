import { describe, test, expect } from 'vitest';

/**
 * Teste automatizado para validar a lógica de cache hit.
 * 
 * Bug original: cache retornava 0 resultados porque:
 *   1. Array vazio `[]` passava no `Array.isArray()` (truthy)
 *   2. Entradas parciais (partial: true) eram servidas como resultado final
 * 
 * Fix: exigir `nodes.length > 0` E `partial !== true`
 */

// Simula a condição exata do cache hit extraída do route.ts
function isCacheValid(cacheData: any, cacheErr: any): boolean {
    return (
        !cacheErr &&
        cacheData &&
        cacheData.grafo_dados &&
        cacheData.grafo_dados.nodes &&
        Array.isArray(cacheData.grafo_dados.nodes) &&
        cacheData.grafo_dados.nodes.length > 0 &&
        cacheData.grafo_dados.partial !== true
    );
}

describe('Cache Hit Validation', () => {

    // ==========================================
    // CASOS QUE DEVEM SER REJEITADOS (cache miss → forçar nova busca)
    // ==========================================

    test('REJEITA: nodes é array vazio (bug original)', () => {
        const cacheData = {
            grafo_dados: {
                timestamp: '2026-03-24T00:00:00Z',
                nodes: [],
                escopo: 'CAMARA',
                partial: false
            }
        };
        expect(isCacheValid(cacheData, null)).toBe(false);
    });

    test('REJEITA: entrada parcial com partial=true (bug original)', () => {
        const cacheData = {
            grafo_dados: {
                timestamp: '2026-03-24T00:00:00Z',
                nodes: [{ id: 'pessoa-123', type: 'PESSOA', data: { label: 'Paulo Abi Ackel' } }],
                escopo: 'CAMARA',
                partial: true
            }
        };
        expect(isCacheValid(cacheData, null)).toBe(false);
    });

    test('REJEITA: cacheErr presente', () => {
        const cacheData = { grafo_dados: { nodes: [{ id: '1' }] } };
        expect(isCacheValid(cacheData, { message: 'not found' })).toBe(false);
    });

    test('REJEITA: cacheData é null', () => {
        expect(isCacheValid(null, null)).toBeFalsy();
    });

    test('REJEITA: grafo_dados é null', () => {
        expect(isCacheValid({ grafo_dados: null }, null)).toBeFalsy();
    });

    test('REJEITA: nodes é undefined', () => {
        expect(isCacheValid({ grafo_dados: { timestamp: '2026' } }, null)).toBeFalsy();
    });

    test('REJEITA: nodes não é array', () => {
        expect(isCacheValid({ grafo_dados: { nodes: 'invalid' } }, null)).toBe(false);
    });

    // ==========================================
    // CASOS QUE DEVEM SER ACEITOS (cache hit)
    // ==========================================

    test('ACEITA: cache completo com múltiplos nodes', () => {
        const cacheData = {
            grafo_dados: {
                timestamp: '2026-03-24T00:00:00Z',
                nodes: [
                    { id: 'pessoa-12345678900', type: 'PESSOA', data: { label: 'Paulo Abi Ackel', cargo: 'Deputado Federal' } },
                    { id: 'emenda-0', type: 'CONTRATO', data: { label: 'EMENDA: Saúde', valor: 500000 } },
                    { id: 'bem-1', type: 'CONTRATO', data: { label: 'BEM DECLARADO: Apartamento', valor: 800000 } },
                ],
                escopo: 'CAMARA',
                partial: false
            }
        };
        expect(isCacheValid(cacheData, null)).toBe(true);
    });

    test('ACEITA: cache sem flag partial (undefined = completo)', () => {
        const cacheData = {
            grafo_dados: {
                timestamp: '2026-03-24T00:00:00Z',
                nodes: [{ id: 'pessoa-1', type: 'PESSOA', data: { label: 'Teste' } }],
                escopo: 'CAMARA'
                // partial não definido = undefined, diferente de `true`
            }
        };
        expect(isCacheValid(cacheData, null)).toBe(true);
    });

    test('ACEITA: cache com partial=false e 1 node', () => {
        const cacheData = {
            grafo_dados: {
                nodes: [{ id: 'pessoa-99', type: 'PESSOA', data: { label: 'Fulano' } }],
                partial: false
            }
        };
        expect(isCacheValid(cacheData, null)).toBe(true);
    });
});
