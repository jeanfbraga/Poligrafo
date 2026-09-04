-- Aplicar no banco principal antes de executar o CEAP em instalações existentes.
-- Evita varrer a PK inteira ao selecionar os próximos 500 registros do ano/Câmara.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
CREATE INDEX IF NOT EXISTS idx_ceap_ano_casa_id
    ON public.ceap_despesas_cache (ano, casa, id);
ANALYZE public.ceap_despesas_cache;
COMMIT;
