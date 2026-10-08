-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: socios_politicos (nota 28 do Obsidian)
-- ===============================================================================
-- Empresas em que um eleito com CPF na base tse_eleitos é sócio, tiradas do arquivo
-- aberto de CNPJ da Receita (QSA): nome completo igual E os 6 dígitos do meio do CPF
-- iguais aos do CPF mascarado do sócio. Carga mensal: scripts/etl/socios-politicos-sync.ts.
-- A investigação usa para achar o CNPJ das empresas declaradas ao TSE sem depender de
-- sites de busca (recusam a Vercel). Tem CPF: só o servidor lê (service_role). Idempotente.
-- ===============================================================================

CREATE TABLE IF NOT EXISTS public.socios_politicos (
    cpf_politico        TEXT NOT NULL,              -- CPF do eleito (tse_eleitos), só dígitos
    cnpj_basico         TEXT NOT NULL,              -- 8 primeiros dígitos do CNPJ
    cnpj                TEXT NOT NULL,              -- CNPJ da matriz (básico + 0001 + DV)
    nome_politico       TEXT NOT NULL,              -- como no QSA, maiúsculas sem acento
    razao_social        TEXT,
    natureza_juridica   TEXT,
    qualificacao_socio  TEXT,                       -- Sócio, Sócio-Administrador, Presidente...
    data_entrada        DATE,
    capital_social      NUMERIC(18, 2),
    referencia          TEXT NOT NULL,              -- mês do arquivo da Receita (AAAA-MM)
    atualizado_em       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (cpf_politico, cnpj_basico)
);

CREATE INDEX IF NOT EXISTS idx_socios_politicos_nome ON public.socios_politicos (nome_politico);

ALTER TABLE public.socios_politicos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'socios_politicos_service' AND tablename = 'socios_politicos') THEN
        CREATE POLICY socios_politicos_service ON public.socios_politicos FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

REVOKE ALL ON public.socios_politicos FROM anon, authenticated;
