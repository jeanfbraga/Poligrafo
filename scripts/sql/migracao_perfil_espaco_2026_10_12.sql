-- ===============================================================================
-- BANCO DE PERFIL — espaço antes da carga de tse_bens (12/10/2026)
-- ===============================================================================
-- Rodar com: npm run sql:perfil -- --arquivo scripts/sql/migracao_perfil_espaco_2026_10_12.sql
--
-- O plano gratuito deixa o banco só leitura acima de 500 MB. Nada de dado sai daqui:
--  - idx_votos_deputado (id_deputado) repete o começo de uq_votos_deputado
--    (id_deputado, id_votacao), que atende as mesmas consultas por deputado (5,3 MB);
--  - VACUUM FULL devolve o espaço das linhas mortas das cargas diárias.
-- ===============================================================================

DROP INDEX IF EXISTS public.idx_votos_deputado;
