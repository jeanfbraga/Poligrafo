-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: tse_campanha_contas (Fase 3 do plano do pipe por alçada)
-- ===============================================================================
-- Executar no SQL Editor do Supabase do BANCO DE PERFIL (não no Principal: ele
-- passou do limite de espaço — regra de 06/10/2026, nota 28 do Obsidian).
--
-- Doadores (pessoas físicas) e fornecedores (CNPJ) das campanhas dos ELEITOS,
-- agregados por candidato + papel + documento, carregados do
-- prestacao_de_contas_eleitorais_candidatos_{ano}.zip do TSE por
-- scripts/etl/tse-contas-campanha-sync.ts (que só grava com --gravar).
-- Medição em modo seco: 2022 = 78.236 linhas (~16 MB). 2024: ver nota 31 §3.6.
--
-- LGPD: a tabela guarda CPF de doador pessoa física (dado público do TSE, mas
-- de pessoa privada). Por isso NÃO há leitura para anon/authenticated: só o
-- servidor (service_role) lê, e o CPF só sai mascarado para tela e prompt.
-- Idempotente: pode rodar mais de uma vez.
-- ===============================================================================

CREATE TABLE IF NOT EXISTS public.tse_campanha_contas (
    id              BIGSERIAL PRIMARY KEY,
    sq_candidato    TEXT NOT NULL,          -- liga com tse_eleitos.sq_candidato
    ano_eleicao     INTEGER NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('DOADOR', 'FORNECEDOR')),
    documento       TEXT NOT NULL,          -- CPF (doador) ou CNPJ (fornecedor), só dígitos e válido
    nome            TEXT,
    valor_total     NUMERIC(14, 2) NOT NULL DEFAULT 0,
    quantidade      INTEGER NOT NULL DEFAULT 0,
    origem          TEXT,                   -- origem da receita / tipo de despesa mais frequente
    atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tse_campanha_contas_chave UNIQUE (sq_candidato, ano_eleicao, tipo, documento)
);

CREATE INDEX IF NOT EXISTS idx_tse_campanha_documento ON public.tse_campanha_contas (documento);

ALTER TABLE public.tse_campanha_contas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tse_campanha_contas_service' AND tablename = 'tse_campanha_contas') THEN
        CREATE POLICY tse_campanha_contas_service ON public.tse_campanha_contas FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
