-- ===============================================================================
-- POLÍGRAFO — SCHEMA DO BANCO DE PERFIS E ATIVIDADE LEGISLATIVA (BANCO 2)
-- ===============================================================================
-- Este schema provisiona as tabelas de alta volumetria para perfis parlamentares,
-- votações nominais, projetos de lei, fatias de cota e servidores de gabinete.
--
-- Pode ser executado em um banco Supabase secundário para contornar o limite
-- de 500MB de storage do plano gratuito, ou no mesmo banco do schema.sql.
-- ===============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- -------------------------------------------------------------------------------
-- 1. camara_perfil_politico_cache
-- -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.camara_perfil_politico_cache (
    id              BIGSERIAL PRIMARY KEY,
    id_deputado     INTEGER NOT NULL UNIQUE,
    nome_civil      TEXT,
    nome_eleitoral  TEXT,
    partido         TEXT,
    uf              TEXT,
    profissoes      JSONB DEFAULT '[]'::jsonb,
    frentes         JSONB DEFAULT '[]'::jsonb,
    comissoes       JSONB DEFAULT '[]'::jsonb,
    data_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.camara_perfil_politico_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'perfil_select' AND tablename = 'camara_perfil_politico_cache') THEN
        CREATE POLICY perfil_select ON public.camara_perfil_politico_cache FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'perfil_service' AND tablename = 'camara_perfil_politico_cache') THEN
        CREATE POLICY perfil_service ON public.camara_perfil_politico_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- -------------------------------------------------------------------------------
-- 2. camara_votacoes_master
-- -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.camara_votacoes_master (
    id_votacao      TEXT PRIMARY KEY,
    id_proposicao   INTEGER,
    projeto_nome    TEXT NOT NULL,
    projeto_tema    TEXT,
    data_votacao    TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.camara_votacoes_master ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'votacoes_master_select' AND tablename = 'camara_votacoes_master') THEN
        CREATE POLICY votacoes_master_select ON public.camara_votacoes_master FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'votacoes_master_service' AND tablename = 'camara_votacoes_master') THEN
        CREATE POLICY votacoes_master_service ON public.camara_votacoes_master FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- -------------------------------------------------------------------------------
-- 3. camara_votos_detalhados
-- -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.camara_votos_detalhados (
    id              BIGSERIAL PRIMARY KEY,
    id_deputado     INTEGER NOT NULL,
    id_votacao      TEXT NOT NULL REFERENCES public.camara_votacoes_master(id_votacao) ON DELETE CASCADE,
    voto            TEXT NOT NULL,
    CONSTRAINT uq_votos_deputado UNIQUE (id_deputado, id_votacao)
);
ALTER TABLE public.camara_votos_detalhados ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'votos_select' AND tablename = 'camara_votos_detalhados') THEN
        CREATE POLICY votos_select ON public.camara_votos_detalhados FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'votos_service' AND tablename = 'camara_votos_detalhados') THEN
        CREATE POLICY votos_service ON public.camara_votos_detalhados FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- -------------------------------------------------------------------------------
-- 4. camara_producao_legislativa
-- -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.camara_producao_legislativa (
    id                BIGSERIAL PRIMARY KEY,
    id_deputado       INTEGER NOT NULL,
    id_proposicao     TEXT NOT NULL,
    tipo              TEXT NOT NULL,
    numero            INTEGER,
    ano               INTEGER,
    titulo            TEXT NOT NULL,
    ementa            TEXT,
    texto_integral    TEXT,
    data_apresentacao TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_producao_deputado UNIQUE (id_deputado, id_proposicao)
);
ALTER TABLE public.camara_producao_legislativa ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'producao_select' AND tablename = 'camara_producao_legislativa') THEN
        CREATE POLICY producao_select ON public.camara_producao_legislativa FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'producao_service' AND tablename = 'camara_producao_legislativa') THEN
        CREATE POLICY producao_service ON public.camara_producao_legislativa FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- -------------------------------------------------------------------------------
-- 5. camara_proposicoes_detalhes_cache
-- -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.camara_proposicoes_detalhes_cache (
    id_proposicao     TEXT PRIMARY KEY,
    sigla_tipo        TEXT,
    numero            INTEGER,
    ano               INTEGER,
    titulo            TEXT NOT NULL,
    ementa            TEXT,
    texto_integral    TEXT,
    data_apresentacao TIMESTAMP WITH TIME ZONE,
    autores_json      JSONB,
    tramitacoes_json  JSONB,
    situacao          TEXT,
    despacho          TEXT,
    regime            TEXT,
    apreciacao        TEXT,
    atualizado_em     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.camara_proposicoes_detalhes_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposicoes_detalhes_select' AND tablename = 'camara_proposicoes_detalhes_cache') THEN
        CREATE POLICY proposicoes_detalhes_select ON public.camara_proposicoes_detalhes_cache FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'proposicoes_detalhes_service' AND tablename = 'camara_proposicoes_detalhes_cache') THEN
        CREATE POLICY proposicoes_detalhes_service ON public.camara_proposicoes_detalhes_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- -------------------------------------------------------------------------------
-- 6. camara_servidores_gabinete
-- -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.camara_servidores_gabinete (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deputado_id INTEGER NOT NULL REFERENCES public.camara_perfil_politico_cache(id_deputado) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cargo TEXT,
    data_nomeacao DATE,
    salario NUMERIC,
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    periodo TEXT
);
CREATE INDEX IF NOT EXISTS idx_servidores_deputado ON public.camara_servidores_gabinete (deputado_id);

ALTER TABLE public.camara_servidores_gabinete ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'servidores_gabinete_select' AND tablename = 'camara_servidores_gabinete') THEN
        CREATE POLICY servidores_gabinete_select ON public.camara_servidores_gabinete FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'servidores_gabinete_service' AND tablename = 'camara_servidores_gabinete') THEN
        CREATE POLICY servidores_gabinete_service ON public.camara_servidores_gabinete FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- -------------------------------------------------------------------------------
-- 7. camara_cota_resumo_cache
-- -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.camara_cota_resumo_cache (
    deputado_id INTEGER NOT NULL REFERENCES public.camara_perfil_politico_cache(id_deputado) ON DELETE CASCADE,
    mes_referencia INTEGER NOT NULL,
    ano_referencia INTEGER NOT NULL,
    valor_teto NUMERIC NOT NULL,
    valor_gasto NUMERIC NOT NULL,
    fatias_json JSONB NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (deputado_id, ano_referencia, mes_referencia)
);
CREATE INDEX IF NOT EXISTS idx_cota_resumo_deputado ON public.camara_cota_resumo_cache (deputado_id);

ALTER TABLE public.camara_cota_resumo_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cota_resumo_select' AND tablename = 'camara_cota_resumo_cache') THEN
        CREATE POLICY cota_resumo_select ON public.camara_cota_resumo_cache FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cota_resumo_service' AND tablename = 'camara_cota_resumo_cache') THEN
        CREATE POLICY cota_resumo_service ON public.camara_cota_resumo_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- -------------------------------------------------------------------------------
-- 8. ÍNDICES DE PERFORMANCE E INTEGRIDADE
-- -------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_votos_deputado ON public.camara_votos_detalhados (id_deputado);
CREATE INDEX IF NOT EXISTS idx_votos_data ON public.camara_votacoes_master (data_votacao DESC);
CREATE INDEX IF NOT EXISTS idx_producao_deputado ON public.camara_producao_legislativa (id_deputado);

DO $$ BEGIN
    ALTER TABLE public.camara_votos_detalhados ADD CONSTRAINT fk_votos_perfil FOREIGN KEY (id_deputado) REFERENCES public.camara_perfil_politico_cache(id_deputado) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.camara_producao_legislativa ADD CONSTRAINT fk_producao_perfil FOREIGN KEY (id_deputado) REFERENCES public.camara_perfil_politico_cache(id_deputado) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
