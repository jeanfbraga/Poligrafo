-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: tse_bens (bens declarados ao TSE, janela de mandato)
-- ===============================================================================
-- Rodar com: npm run sql:perfil -- --arquivo scripts/sql/migracao_perfil_tse_bens.sql
--
-- Substitui tse_bens_historico (Banco Principal, 61 MB com TODOS os candidatos de 2022
-- e 2026, chave pelo CPF — 2024 não tem CPF e gravava 0 linha). Aqui só quem está na
-- janela de mandato e os presidentes (decisão de 12/10/2026), com chave pelo número do
-- candidato: prefeitos e vereadores sem CPF também têm patrimônio.
-- Carga: scripts/etl/tse-bens-sync.ts (bem_candidato_{ano}.zip do cdn.tse.jus.br).
-- Estimativa: ~60 mil linhas, ~30 MB. Idempotente.
-- ===============================================================================

CREATE TABLE IF NOT EXISTS public.tse_bens (
    sq_candidato   TEXT NOT NULL,
    ano_eleicao    INTEGER NOT NULL,
    cpf            TEXT,                          -- da base de eleitos ou do arquivo de candidatos do ano
    nome           TEXT NOT NULL,
    cd_cargo       TEXT,
    sg_uf          TEXT,
    valor_total    NUMERIC NOT NULL DEFAULT 0,
    bens           JSONB NOT NULL DEFAULT '[]',   -- [{ t: tipo, d: descrição, v: valor }] (chaves curtas: menos espaço)
    atualizado_em  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (sq_candidato, ano_eleicao)
);

CREATE INDEX IF NOT EXISTS idx_tse_bens_cpf ON public.tse_bens (cpf) WHERE cpf IS NOT NULL;

-- Tem CPF: só o servidor (service_role) lê e grava.
ALTER TABLE public.tse_bens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tse_bens_service' AND tablename = 'tse_bens') THEN
        CREATE POLICY tse_bens_service ON public.tse_bens FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
REVOKE ALL ON public.tse_bens FROM anon, authenticated;
