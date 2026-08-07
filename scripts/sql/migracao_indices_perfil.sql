-- =================================================================================
-- MIGRAÇÃO DE PERFORMANCE E INTEGRIDADE (PERFIL DO POLÍTICO)
-- Execute este script no SQL Editor do seu Banco de Dados SECUNDÁRIO (Perfil).
-- Caso use apenas um banco (Open Source), execute no banco principal.
-- =================================================================================

-- 1. CRIAÇÃO DE ÍNDICES B-TREE PARA MELHORIA DE PERFORMANCE (READ-HEAVY)
-- Essas consultas são muito utilizadas na página do perfil do deputado.

-- Índice para a tabela de Servidores do Gabinete
CREATE INDEX IF NOT EXISTS idx_servidores_deputado ON public.camara_servidores_gabinete (deputado_id);

-- Índice para a tabela de Votos Detalhados
CREATE INDEX IF NOT EXISTS idx_votos_deputado ON public.camara_votos_detalhados (id_deputado);

-- Índice para a tabela de Produção Legislativa
CREATE INDEX IF NOT EXISTS idx_producao_deputado ON public.camara_producao_legislativa (id_deputado);

-- Índice para a Cota CEAP (embora a PK composta já atue como índice parcial, 
-- um índice simples no deputado_id acelera o acesso bruto)
CREATE INDEX IF NOT EXISTS idx_cota_resumo_deputado ON public.camara_cota_resumo_cache (deputado_id);


-- 2. GARANTIA DE INTEGRIDADE REFERENCIAL (FOREIGN KEYS)
-- Associa os dados secundários ao perfil principal. Se o perfil for deletado, os dados vão junto.

-- Limpeza de Registros Órfãos: Remove registros que apontam para deputados que não existem mais no cache.
-- Isso é necessário para que a criação das Foreign Keys não falhe com o erro 23503.
DELETE FROM public.camara_servidores_gabinete WHERE deputado_id NOT IN (SELECT id_deputado FROM public.camara_perfil_politico_cache);
DELETE FROM public.camara_votos_detalhados WHERE id_deputado NOT IN (SELECT id_deputado FROM public.camara_perfil_politico_cache);
DELETE FROM public.camara_producao_legislativa WHERE id_deputado NOT IN (SELECT id_deputado FROM public.camara_perfil_politico_cache);
DELETE FROM public.camara_cota_resumo_cache WHERE deputado_id NOT IN (SELECT id_deputado FROM public.camara_perfil_politico_cache);

-- Foreign Key para Servidores
DO $$ BEGIN
    ALTER TABLE public.camara_servidores_gabinete 
    ADD CONSTRAINT fk_servidores_perfil 
    FOREIGN KEY (deputado_id) 
    REFERENCES public.camara_perfil_politico_cache(id_deputado) 
    ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Foreign Key para Votos
DO $$ BEGIN
    ALTER TABLE public.camara_votos_detalhados 
    ADD CONSTRAINT fk_votos_perfil 
    FOREIGN KEY (id_deputado) 
    REFERENCES public.camara_perfil_politico_cache(id_deputado) 
    ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Foreign Key para Produção Legislativa
DO $$ BEGIN
    ALTER TABLE public.camara_producao_legislativa 
    ADD CONSTRAINT fk_producao_perfil 
    FOREIGN KEY (id_deputado) 
    REFERENCES public.camara_perfil_politico_cache(id_deputado) 
    ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Foreign Key para Cota Resumo
DO $$ BEGIN
    ALTER TABLE public.camara_cota_resumo_cache 
    ADD CONSTRAINT fk_cota_perfil 
    FOREIGN KEY (deputado_id) 
    REFERENCES public.camara_perfil_politico_cache(id_deputado) 
    ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. LIMPEZA (OPCIONAL)
-- A coluna 'id' em camara_cota_resumo_cache (UUID) se tornou inútil após a criação 
-- da chave primária composta (deputado_id, ano_referencia, mes_referencia).
ALTER TABLE public.camara_cota_resumo_cache DROP COLUMN IF EXISTS id;
