-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: camara_servidores_gabinete sem duplicatas (07/10/2026)
-- ===============================================================================
-- Causa: a API da Câmara repete o mesmo deputado na lista da legislatura (882
-- entradas para 648 deputados) e as cópias caíam no mesmo lote paralelo do
-- perfil-politico-sync: os "apaga e insere" do gabinete se cruzavam e 4.970
-- linhas ficaram repetidas. Corrigido no código (exigirDeputados único por id,
-- lerTabelaGabinete sem linha repetida). Esta migração:
--   1. apaga as linhas repetidas (fica a mais antiga de cada vínculo);
--   2. troca data_nomeacao (era a data do dia da carga) pelo início do período;
--   3. cria índice único por vínculo, para não voltar a duplicar.
-- Idempotente. Rodada com: npm run sql:perfil -- --arquivo scripts/sql/migracao_perfil_gabinete_unico.sql
-- ===============================================================================

DELETE FROM public.camara_servidores_gabinete t
 USING (
   SELECT id,
          row_number() OVER (
            PARTITION BY deputado_id, upper(nome), coalesce(cargo, ''), coalesce(periodo, '')
            ORDER BY atualizado_em, id
          ) AS rn
     FROM public.camara_servidores_gabinete
 ) d
 WHERE t.id = d.id AND d.rn > 1;

UPDATE public.camara_servidores_gabinete
   SET data_nomeacao = to_date(substring(periodo FROM '(\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')
 WHERE periodo ~ '\d{2}/\d{2}/\d{4}'
   AND data_nomeacao IS DISTINCT FROM to_date(substring(periodo FROM '(\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY');

UPDATE public.camara_servidores_gabinete
   SET data_nomeacao = NULL
 WHERE periodo IS NULL OR periodo !~ '\d{2}/\d{2}/\d{4}';

CREATE UNIQUE INDEX IF NOT EXISTS uq_servidores_gabinete_vinculo
    ON public.camara_servidores_gabinete (deputado_id, upper(nome), coalesce(cargo, ''), coalesce(periodo, ''));
