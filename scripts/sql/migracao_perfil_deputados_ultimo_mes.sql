-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: último mês com verba nas visões de deputados estaduais
-- ===============================================================================
-- alerj_deputados e alesp_deputados ganham `ultimo_mes` (último mês com despesa de
-- gabinete). A busca usa para saber quem está em exercício: Rodrigo Bacellar teve o
-- diploma cassado pelo TSE em 2026 (votos de 2022 anulados), mas aparecia como deputado
-- porque recebeu verba no começo do ano (última em 03/2026; a base vai até 07/2026).
-- Só acrescenta uma coluna no fim das visões (CREATE OR REPLACE). Idempotente.
-- ===============================================================================

CREATE OR REPLACE VIEW public.alerj_deputados AS
SELECT deputado_id, max(deputado) AS deputado, min(ano) AS primeiro_ano, max(ano) AS ultimo_ano,
       max(make_date(ano, greatest(least(coalesce(mes, 1), 12), 1), 1)) AS ultimo_mes
  FROM public.alerj_despesas
 GROUP BY deputado_id;

CREATE OR REPLACE VIEW public.alesp_deputados AS
SELECT matricula, max(deputado) AS deputado, min(ano) AS primeiro_ano, max(ano) AS ultimo_ano,
       max(make_date(ano, greatest(least(coalesce(mes, 1), 12), 1), 1)) AS ultimo_mes
  FROM public.alesp_despesas
 GROUP BY matricula;
