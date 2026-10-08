-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: alesp_despesas (Fase 4, nota 29 do Obsidian)
-- ===============================================================================
-- Despesas de gabinete da ALESP da legislatura atual (2023+), agregadas por
-- deputado (matrícula) + ano + mês + tipo + documento do fornecedor, carregadas
-- do XML oficial por scripts/etl/alesp-despesas-sync.ts (~80 mil linhas).
-- Antes, cada investigação lia o XML de ~172 MB inteiro ao vivo.
-- Dado público da ALESP: leitura liberada. Idempotente.
-- ===============================================================================

CREATE TABLE IF NOT EXISTS public.alesp_despesas (
    id            BIGSERIAL PRIMARY KEY,
    matricula     TEXT NOT NULL,
    deputado      TEXT NOT NULL,
    ano           INTEGER NOT NULL,
    mes           INTEGER NOT NULL,
    tipo          TEXT NOT NULL,
    fornecedor    TEXT,
    documento     TEXT NOT NULL DEFAULT '',
    valor         NUMERIC(14, 2) NOT NULL DEFAULT 0,
    quantidade    INTEGER NOT NULL DEFAULT 1,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT alesp_despesas_chave UNIQUE (matricula, ano, mes, tipo, documento)
);

-- Lista de deputados (para achar a matrícula pelo nome sem baixar 80 mil linhas).
CREATE OR REPLACE VIEW public.alesp_deputados AS
SELECT matricula, max(deputado) AS deputado, min(ano) AS primeiro_ano, max(ano) AS ultimo_ano
  FROM public.alesp_despesas
 GROUP BY matricula;

ALTER TABLE public.alesp_despesas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'alesp_despesas_select' AND tablename = 'alesp_despesas') THEN
        CREATE POLICY alesp_despesas_select ON public.alesp_despesas FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'alesp_despesas_service' AND tablename = 'alesp_despesas') THEN
        CREATE POLICY alesp_despesas_service ON public.alesp_despesas FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT SELECT ON public.alesp_deputados TO anon, authenticated, service_role;
