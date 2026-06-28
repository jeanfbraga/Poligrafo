import { describe, it, expect } from 'vitest';
import { cn, getPortalTransparenciaFallback } from '../../src/lib/utils';

describe('🛠️ Utils', () => {

    describe('cn (Tailwind Merge)', () => {
        it('deve mesclar classes tailwind corretamente', () => {
            expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
            expect(cn('p-4', { 'm-4': true, 'm-2': false })).toBe('p-4 m-4');
        });
    });

    describe('getPortalTransparenciaFallback', () => {
        it('deve retornar portal da Câmara Federal', () => {
            const fb = getPortalTransparenciaFallback('CAMARA');
            expect(fb.textoLink).toBe('Portal de Dados da Câmara');
            expect(fb.link).toBe('https://dadosabertos.camara.leg.br/');
        });

        it('deve retornar portal do Senado Federal', () => {
            const fb = getPortalTransparenciaFallback('SENADO');
            expect(fb.textoLink).toBe('Portal do Senado');
        });

        it('deve retornar portal de prefeitura usando a URI fornecida', () => {
            const fb = getPortalTransparenciaFallback('PREFEITURA', 'https://minhacidade.gov.br');
            expect(fb.link).toBe('https://minhacidade.gov.br');
        });

        it('deve tratar Câmaras Municipais genéricas', () => {
            const fb = getPortalTransparenciaFallback('CAMARA_MUNICIPAL_SP', 'https://camarasp.gov.br');
            expect(fb.textoLink).toBe('Busque no portal da Câmara de seu município');
            expect(fb.link).toBe('https://camarasp.gov.br');
        });

        it('deve cair no fallback genérico se não houver match', () => {
            const fb = getPortalTransparenciaFallback('DESCONHECIDO');
            expect(fb.link).toBe('https://portaldatransparencia.gov.br/');
        });
    });
});
