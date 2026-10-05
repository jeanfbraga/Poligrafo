/**
 * Credenciais do banco de PERFIL para os ETLs que gravam dados de perfil
 * (as tabelas de supabase/schema-perfil.sql).
 *
 * Em produção esses dados ficam num segundo Supabase, por causa do limite de
 * armazenamento do principal. Sem NEXT_PUBLIC_SUPABASE_PERFIL_URL e
 * SUPABASE_PERFIL_SERVICE_ROLE_KEY o ETL para, em vez de gravar no principal
 * em silêncio (um segredo faltando no GitHub ou um .env.local apontando para
 * produção bastava para isso). Quem usa um banco só (contribuidor) libera
 * explicitamente com PERFIL_NO_BANCO_PRINCIPAL=1.
 */
export function credenciaisBancoPerfil(): { url: string; key: string } {
    const url = process.env.NEXT_PUBLIC_SUPABASE_PERFIL_URL;
    const key = process.env.SUPABASE_PERFIL_SERVICE_ROLE_KEY;
    if (url && key) return { url, key };

    const urlPrincipal = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const keyPrincipal = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (process.env.PERFIL_NO_BANCO_PRINCIPAL === '1' && urlPrincipal && keyPrincipal) {
        return { url: urlPrincipal, key: keyPrincipal };
    }

    console.error(
        'ERRO: banco de perfil não configurado. Defina NEXT_PUBLIC_SUPABASE_PERFIL_URL e ' +
        'SUPABASE_PERFIL_SERVICE_ROLE_KEY (ou PERFIL_NO_BANCO_PRINCIPAL=1 para usar um banco só).'
    );
    process.exit(1);
}
