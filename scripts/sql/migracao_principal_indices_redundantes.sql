-- ===============================================================================
-- MIGRAÇÃO — BANCO PRINCIPAL: remove índices repetidos ou nunca usados (Fase 5)
-- ===============================================================================
-- O Principal passou do limite (627 MB em 08/10/2026). Nenhum DADO é apagado:
-- só índices cobertos por outro índice com a mesma coluna na frente, duplicados
-- idênticos ou sem uso. ~66 MB. Desfazer: rodar os CREATE INDEX comentados abaixo.
--
-- ceap_despesas_cache (consultas por deputado+ano e por ano+casa):
--   idx_ceap_id_deputado (22 MB) ⊂ idx_ceap_deputado_ano (id_deputado, ano DESC)
--   idx_ceap_ano         (17 MB) ⊂ idx_ceap_ano_casa_id (ano, casa, id)
-- tse_bens_historico (consulta por CPF e por nome; upsert por CPF+ano):
--   idx_tse_bens_nome (12 MB) = idx_tse_nome (mesmo GIN trigram em nome_candidato)
--   idx_tse_cpf, idx_tse_bens_cpf (2,6 MB cada) ⊂ uq_idx_tse_bens_cpf_ano (cpf_candidato, ano_eleicao)
-- cgu_sancoes_cache (consulta só por CPF; o ETL apaga por tipo):
--   idx_cgu_sancoes_nome (9,6 MB, 0 usos)
--
-- Para desfazer:
--   CREATE INDEX idx_ceap_id_deputado ON public.ceap_despesas_cache USING btree (id_deputado);
--   CREATE INDEX idx_ceap_ano ON public.ceap_despesas_cache USING btree (ano);
--   CREATE INDEX idx_tse_bens_nome ON public.tse_bens_historico USING gin (nome_candidato gin_trgm_ops);
--   CREATE INDEX idx_tse_cpf ON public.tse_bens_historico USING btree (cpf_candidato);
--   CREATE INDEX idx_tse_bens_cpf ON public.tse_bens_historico USING btree (cpf_candidato);
--   CREATE INDEX idx_cgu_sancoes_nome ON public.cgu_sancoes_cache USING gin (nome gin_trgm_ops);
-- ===============================================================================

DROP INDEX IF EXISTS public.idx_ceap_id_deputado;
DROP INDEX IF EXISTS public.idx_ceap_ano;
DROP INDEX IF EXISTS public.idx_tse_bens_nome;
DROP INDEX IF EXISTS public.idx_tse_cpf;
DROP INDEX IF EXISTS public.idx_tse_bens_cpf;
DROP INDEX IF EXISTS public.idx_cgu_sancoes_nome;
