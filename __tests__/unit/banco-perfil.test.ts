import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { credenciaisBancoPerfil } from '../../scripts/etl/banco-perfil';

describe('credenciaisBancoPerfil (ETLs de dados de perfil)', () => {
    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://principal.supabase.co');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave-principal');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_PERFIL_URL', '');
        vi.stubEnv('SUPABASE_PERFIL_SERVICE_ROLE_KEY', '');
        vi.stubEnv('PERFIL_NO_BANCO_PRINCIPAL', '');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`exit ${code}`);
        }) as never);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('usa o banco de perfil quando configurado', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_PERFIL_URL', 'https://perfil.supabase.co');
        vi.stubEnv('SUPABASE_PERFIL_SERVICE_ROLE_KEY', 'chave-perfil');
        expect(credenciaisBancoPerfil()).toEqual({ url: 'https://perfil.supabase.co', key: 'chave-perfil' });
    });

    it('sem banco de perfil, para em vez de gravar no principal', () => {
        expect(() => credenciaisBancoPerfil()).toThrow('exit 1');
    });

    it('só usa o principal com liberação explícita (um banco só)', () => {
        vi.stubEnv('PERFIL_NO_BANCO_PRINCIPAL', '1');
        expect(credenciaisBancoPerfil()).toEqual({ url: 'https://principal.supabase.co', key: 'chave-principal' });
    });
});
