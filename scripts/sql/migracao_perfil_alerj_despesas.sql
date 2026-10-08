-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: alerj_despesas (Fase 4, nota 29 do Obsidian)
-- ===============================================================================
-- Despesas de gabinete da ALERJ (verba de gabinete, DOCIGP) da legislatura atual,
-- um lançamento por linha (id do DOCIGP), carregadas pela API do portal por
-- scripts/etl/alerj-docigp-sync.ts. Antes, um robô de navegador (Playwright)
-- abria o portal a cada investigação. Dado público da ALERJ: leitura liberada.
-- Idempotente.
-- ===============================================================================

CREATE TABLE IF NOT EXISTS public.alerj_despesas (
    lancamento_id     BIGINT PRIMARY KEY,           -- id do lançamento no DOCIGP
    deputado_id       INTEGER NOT NULL,             -- id do deputado no DOCIGP
    deputado          TEXT NOT NULL,                -- "Nome Civil (Apelido)"
    ano               INTEGER NOT NULL,
    mes               INTEGER NOT NULL,
    data              DATE,
    valor             NUMERIC(14, 2) NOT NULL,      -- gasto (valor positivo)
    objeto            TEXT,
    centro_custo      TEXT,
    documento         TEXT NOT NULL DEFAULT '',     -- CPF/CNPJ do fornecedor, só dígitos
    fornecedor        TEXT,
    numero_documento  TEXT,
    qtd_documentos    INTEGER NOT NULL DEFAULT 0,
    atualizado_em     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_alerj_despesas_deputado ON public.alerj_despesas (deputado_id, ano);

CREATE OR REPLACE VIEW public.alerj_deputados AS
SELECT deputado_id, max(deputado) AS deputado, min(ano) AS primeiro_ano, max(ano) AS ultimo_ano
  FROM public.alerj_despesas
 GROUP BY deputado_id;

ALTER TABLE public.alerj_despesas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'alerj_despesas_select' AND tablename = 'alerj_despesas') THEN
        CREATE POLICY alerj_despesas_select ON public.alerj_despesas FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'alerj_despesas_service' AND tablename = 'alerj_despesas') THEN
        CREATE POLICY alerj_despesas_service ON public.alerj_despesas FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT SELECT ON public.alerj_deputados TO anon, authenticated, service_role;
