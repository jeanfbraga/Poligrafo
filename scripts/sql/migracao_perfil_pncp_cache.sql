-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: pncp_contratos_cache (Fase 5, nota 29 do Obsidian)
-- ===============================================================================
-- Contratos de um órgão (prefeitura, governo, câmara, assembleia) consultados no
-- PNCP, guardados por CNPJ do órgão. O PNCP leva de 1 a 30 s por consulta, limita
-- requisições (429) e cai: a cópia de até 24 h é usada direto; uma mais velha (até
-- 30 dias) só quando o PNCP não responde, e a tela diz de quando ela é.
-- Só os campos que o pipe usa (objeto cortado em 200 caracteres): ~250 KB por
-- órgão no máximo. Linhas com mais de 30 dias são apagadas a cada gravação.
-- Escrita e leitura só pelo servidor (service_role). Idempotente.
-- ===============================================================================

CREATE TABLE IF NOT EXISTS public.pncp_contratos_cache (
    cnpj_orgao     TEXT PRIMARY KEY,                -- só dígitos
    consultado_em  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    total          INTEGER NOT NULL DEFAULT 0,
    contratos      JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pncp_contratos_cache_consultado ON public.pncp_contratos_cache (consultado_em);

ALTER TABLE public.pncp_contratos_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pncp_contratos_cache_service' AND tablename = 'pncp_contratos_cache') THEN
        CREATE POLICY pncp_contratos_cache_service ON public.pncp_contratos_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

REVOKE ALL ON public.pncp_contratos_cache FROM anon, authenticated;
