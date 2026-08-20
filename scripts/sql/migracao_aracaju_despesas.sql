-- =============================================================================
-- Migração: Criação da tabela aracaju_despesas no Supabase
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.aracaju_despesas (
    id                    BIGSERIAL PRIMARY KEY,
    orgao                 TEXT NOT NULL DEFAULT 'CMA', -- 'CMA' ou 'PREFEITURA'
    parlamentar_nome      TEXT,                        -- Nome do vereador / gestor quando aplicável
    fornecedor_nome       TEXT,
    fornecedor_cnpj_cpf   TEXT,
    valor                 NUMERIC(14,2) NOT NULL DEFAULT 0,
    data_despesa          TEXT,
    categoria_despesa     TEXT,
    descricao             TEXT,
    numero_documento      TEXT,
    fonte_url             TEXT,
    extraido_por          TEXT DEFAULT 'ETL_ARACAJU',
    created_at            TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_aracaju_despesa UNIQUE (orgao, parlamentar_nome, fornecedor_cnpj_cpf, valor, data_despesa, numero_documento)
);

CREATE INDEX IF NOT EXISTS idx_aracaju_parlamentar ON public.aracaju_despesas USING gin (parlamentar_nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_aracaju_fornecedor ON public.aracaju_despesas USING gin (fornecedor_nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_aracaju_cnpj ON public.aracaju_despesas (fornecedor_cnpj_cpf);
CREATE INDEX IF NOT EXISTS idx_aracaju_orgao ON public.aracaju_despesas (orgao);

ALTER TABLE public.aracaju_despesas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'aracaju_despesas_select' AND tablename = 'aracaju_despesas') THEN
        CREATE POLICY aracaju_despesas_select ON public.aracaju_despesas FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'aracaju_despesas_service' AND tablename = 'aracaju_despesas') THEN
        CREATE POLICY aracaju_despesas_service ON public.aracaju_despesas FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
