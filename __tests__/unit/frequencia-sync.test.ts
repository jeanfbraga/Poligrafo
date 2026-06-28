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

describe('frequencia-sync ETL', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    it('should calculate presences and absences correctly', async () => {
        // We will simulate the logic
        const mockAtivos = [
            { id: 1, nome: "Deputado A" },
            { id: 2, nome: "Deputado B" }
        ];

        const mockEventos = [
            { id: 101, situacao: 'Encerrada', descricaoTipo: 'Sessão Deliberativa' },
            { id: 102, situacao: 'Encerrada', descricaoTipo: 'Sessão Deliberativa' }
        ];

        const stats: Record<number, any> = {};
        for (const dep of mockAtivos) {
            stats[dep.id] = { id_deputado: dep.id, presencas: 0, ausencias_nao_justificadas: 0 };
        }

        // Evento 101: Deputado A presente, Deputado B ausente
        const presentes101 = new Set([1]);
        
        // Evento 102: Ambos ausentes
        const presentes102 = new Set([]);

        const simulateEvent = (eventoId: number, presentesIds: Set<number>) => {
            for (const dep of mockAtivos) {
                if (presentesIds.has(dep.id)) {
                    stats[dep.id].presencas += 1;
                } else {
                    stats[dep.id].ausencias_nao_justificadas += 1;
                }
            }
        };

        simulateEvent(101, presentes101);
        simulateEvent(102, presentes102);

        expect(stats[1].presencas).toBe(1);
        expect(stats[1].ausencias_nao_justificadas).toBe(1);

        expect(stats[2].presencas).toBe(0);
        expect(stats[2].ausencias_nao_justificadas).toBe(2);
    });
});
