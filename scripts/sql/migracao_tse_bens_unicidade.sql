-- Migração: Unicidade e integridade da tabela tse_bens_historico
-- Remove registros zerados resultantes da falha de sincronização anterior e garante chave única (cpf_candidato, ano_eleicao)

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

-- 1. Remove registros com valor_total zerado de 2022 e 2026 resultantes da falha de sincronização anterior
DELETE FROM public.tse_bens_historico 
WHERE (valor_total = 0 OR valor_total IS NULL) 
  AND ano_eleicao IN (2022, 2026);

-- 2. Deduplica registros mantendo o que possui maior ID caso haja divergências
DELETE FROM public.tse_bens_historico a
USING public.tse_bens_historico b
WHERE a.id < b.id
  AND a.cpf_candidato = b.cpf_candidato
  AND a.ano_eleicao = b.ano_eleicao;

-- 3. Cria índice único para permitir upsert idempotente
CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_tse_bens_cpf_ano 
  ON public.tse_bens_historico (cpf_candidato, ano_eleicao);

ANALYZE public.tse_bens_historico;
COMMIT;
