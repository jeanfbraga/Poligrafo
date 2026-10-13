-- ===============================================================================
-- MIGRAÇÃO — BANCO PRINCIPAL: aposenta tse_bens_historico (aprovado em 13/10/2026)
-- ===============================================================================
-- Bens declarados de TODOS os candidatos de 2022 e 2026, chave só pelo CPF (2024 não tem
-- CPF e a carga gravava 0 linha), 49.826 linhas, 61 MB.
-- Substituída por tse_bens (Banco de Perfil): só quem está na janela de mandato e os
-- presidentes, pelo número do candidato (commit c3d993a, em produção antes desta migração).
-- A carga antiga (tse-sync-real.ts) e a regra dela na limpeza central saíram.
--
-- Cópia antes de apagar: .tmp_debug/backup/tse_bens_historico-2026-10-12.ndjson.gz
-- (NDJSON compactado, 49.826 linhas, 6,6 MB; fora do git).
-- ===============================================================================

DROP TABLE IF EXISTS public.tse_bens_historico;
