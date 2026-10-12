-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: tse_eleitos.cpf_fonte (12/10/2026)
-- ===============================================================================
-- O TSE esconde o CPF de todos os candidatos de 2024 nos arquivos abertos ("-4"), mas
-- publica o título de eleitor e a data de nascimento. Os arquivos de 2016–2022 trazem
-- CPF + título. A carga liga o eleito de 2024 à candidatura anterior com o MESMO título
-- e a MESMA data de nascimento e anota aqui de onde veio o CPF
-- (ex.: "consulta_cand_2020 (título e nascimento)"). NULL = CPF do próprio arquivo.
-- Só a chave de serviço lê a tabela (regra de 08/10/2026). Idempotente.
-- ===============================================================================

ALTER TABLE public.tse_eleitos ADD COLUMN IF NOT EXISTS cpf_fonte TEXT;
