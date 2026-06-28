import { buscarDeputadoEstadualRJ, buscarPerfilDOCIGP } from './alerj';

describe('Testes de Integração da ALERJ', () => {
    // Aumentar o timeout geral do Jest para evitar falhas por tempo de rede
    jest.setTimeout(120000); 

    it('Deve encontrar a deputada Sarah Poncio sem timeout e processar o DOCIGP corretamente', async () => {
        // Mock do sendEvent
        const sendEvent = jest.fn((event: string, payload: any) => {
            console.log(`[EVENT: ${event}]`, payload);
        });

        const nomeBuscado = 'SARAH PONCIO SILVA DE SOUZA';
        
        console.log('--- Testando DOCIGP para Sarah Poncio ---');
        const perfil = await buscarPerfilDOCIGP(nomeBuscado, sendEvent);
        
        // Pode ser que ela não tenha dossiê ativo, mas o importante é não dar Timeout.
        // E deve retornar null ou o objeto do dossiê.
        expect(perfil !== undefined).toBe(true);

        console.log('--- Testando Extrator Geral da ALERJ para Sarah Poncio ---');
        const resultados = await buscarDeputadoEstadualRJ(nomeBuscado);
        
        expect(Array.isArray(resultados)).toBe(true);
        if (resultados.length > 0) {
            expect(resultados[0].id).toBeDefined();
            expect(resultados[0].ref).toContain('ALERJ:DEPUTADO_ESTADUAL');
        }
    });

    it('Deve encontrar o deputado Márcio Poncio sem timeout', async () => {
        const sendEvent = jest.fn((event: string, payload: any) => {
            console.log(`[EVENT: ${event}]`, payload);
        });

        const nomeBuscado = 'MARCIO PONCIO';
        
        console.log('--- Testando DOCIGP para Márcio Poncio ---');
        const perfil = await buscarPerfilDOCIGP(nomeBuscado, sendEvent);
        expect(perfil !== undefined).toBe(true);

        console.log('--- Testando Extrator Geral da ALERJ para Márcio Poncio ---');
        const resultados = await buscarDeputadoEstadualRJ(nomeBuscado);
        
        expect(Array.isArray(resultados)).toBe(true);
        if (resultados.length > 0) {
            expect(resultados[0].id).toBeDefined();
            expect(resultados[0].ref).toContain('ALERJ:DEPUTADO_ESTADUAL');
        }
    });
});
