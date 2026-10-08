-- ===============================================================================
-- MIGRAÇÃO — BANCO PRINCIPAL: aposenta tse_doadores_cache (Fase 5, aprovado em 08/10/2026)
-- ===============================================================================
-- Doadores pelo NOME civil + UF (confundia homônimos), 392.738 linhas, 86 MB.
-- Substituída pelas contas de campanha por número do candidato (tse_campanha_contas,
-- Banco de Perfil). O pipe parou de ler e gravar nela no commit 4597413 (deploy de
-- produção pronto antes desta migração); o workflow semanal que a recarregava saiu.
--
-- Cópia antes de apagar: .tmp_debug/backup/tse_doadores_cache_2026-10-08.ndjson.gz
-- (NDJSON compactado, 392.738 linhas, 15,3 MB; fora do git).
-- Para restaurar: recriar a tabela (supabase/schema.sql, seção 1.5) e inserir o NDJSON.
-- ===============================================================================

DROP TABLE IF EXISTS public.tse_doadores_cache;
