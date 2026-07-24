-- 1) CEAP Top 10: recriar como materialized view filtrando o ano corrente
DROP MATERIALIZED VIEW IF EXISTS public.dashboard_ceap_top10;
CREATE MATERIALIZED VIEW public.dashboard_ceap_top10 AS
SELECT id_deputado, SUM(valor_documento) AS total_gasto
FROM public.ceap_despesas_cache
WHERE ano = EXTRACT(YEAR FROM CURRENT_DATE)::int
GROUP BY id_deputado
ORDER BY total_gasto DESC
LIMIT 10;
GRANT SELECT ON public.dashboard_ceap_top10 TO anon, authenticated, service_role;

-- 2) Emendas PIX Top 10: total_pix = apenas valor pago (valor_investimento)
CREATE OR REPLACE VIEW public.dashboard_emendas_top10 AS
SELECT autor, SUM(valor_investimento) AS total_pix
FROM public.emendas_pix
GROUP BY autor
ORDER BY total_pix DESC
LIMIT 10;

-- 3) Emendas PIX por UF: idem
CREATE OR REPLACE VIEW public.dashboard_emendas_uf AS
SELECT uf_destino, SUM(valor_investimento) AS total_pix
FROM public.emendas_pix
GROUP BY uf_destino
ORDER BY total_pix DESC;
