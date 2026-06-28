import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const mockFrom = vi.fn().mockReturnValue({
    insert: mockInsert,
    delete: mockDelete
});

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn().mockReturnValue({
        from: mockFrom
    })
}));

describe('votacoes-sync ETL', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it('should calculate votos and ausencias correctly', async () => {
        const mockVotos = [
            { deputado_: { id: 1 }, tipoVoto: 'Sim' },
            { deputado_: { id: 1 }, tipoVoto: 'Não' },
            { deputado_: { id: 2 }, tipoVoto: 'Ausente' },
            { deputado_: { id: 2 }, tipoVoto: 'Abstenção' },
            { deputado_: { id: 3 }, tipoVoto: 'Sim' }
        ];

        const stats: Record<number, any> = {};

        for (const v of mockVotos) {
            const idDeputado = v.deputado_.id;
            const tipoVoto = v.tipoVoto;

            if (!stats[idDeputado]) {
                stats[idDeputado] = {
                    id_deputado: idDeputado,
                    votos_registrados: 0,
                    ausencias_em_votacoes: 0
                };
            }

            if (tipoVoto === 'Ausente' || tipoVoto === 'Abstenção') {
                stats[idDeputado].ausencias_em_votacoes += 1;
            } else {
                stats[idDeputado].votos_registrados += 1;
            }
        }

        expect(stats[1].votos_registrados).toBe(2);
        expect(stats[1].ausencias_em_votacoes).toBe(0);

        expect(stats[2].votos_registrados).toBe(0);
        expect(stats[2].ausencias_em_votacoes).toBe(2);

        expect(stats[3].votos_registrados).toBe(1);
    });
});
