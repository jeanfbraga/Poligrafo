-- =============================================================================
-- POLÍGRAFO — Schema Completo do Banco de Dados (Supabase / PostgreSQL)
-- =============================================================================
-- Execute este arquivo inteiro no SQL Editor do Supabase para criar toda a
-- infraestrutura que o código da aplicação espera.
--
-- Requisitos: Supabase com PostgreSQL 15+
-- Idempotente: pode ser executado múltiplas vezes sem erro (IF NOT EXISTS).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSÕES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- Busca fuzzy (ILIKE otimizado)

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. TABELAS BASE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 pesquisas — Cache de investigações (grafo serializado em JSONB)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pesquisas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    termo_busca   TEXT NOT NULL,
    cpf_raiz      TEXT,
    grafo_dados   JSONB,
    atualizado_em TIMESTAMPTZ DEFAULT NOW(),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pesquisas_termo
    ON public.pesquisas (termo_busca);
CREATE INDEX IF NOT EXISTS idx_pesquisas_atualizado
    ON public.pesquisas (atualizado_em DESC);

ALTER TABLE public.pesquisas ENABLE ROW LEVEL SECURITY;

-- Leitura pública (anon/authenticated), escrita apenas via service_role
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pesquisas_select' AND tablename = 'pesquisas') THEN
        CREATE POLICY pesquisas_select ON public.pesquisas FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pesquisas_service' AND tablename = 'pesquisas') THEN
        CREATE POLICY pesquisas_service ON public.pesquisas FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Trigger para atualizar atualizado_em automaticamente
CREATE OR REPLACE FUNCTION public.set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pesquisas_atualizado ON public.pesquisas;
CREATE TRIGGER trg_pesquisas_atualizado
    BEFORE UPDATE ON public.pesquisas
    FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 contagem_pesquisas — Telemetria "Mais Investigados" (Dashboard)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contagem_pesquisas (
    id           BIGSERIAL PRIMARY KEY,
    nome         TEXT NOT NULL,
    id_politico  TEXT NOT NULL,
    casa         TEXT NOT NULL DEFAULT 'GLOBAL',
    ref          TEXT,
    total        BIGINT NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_contagem_pesquisas UNIQUE (nome, id_politico)
);

ALTER TABLE public.contagem_pesquisas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contagem_pesquisas_select' AND tablename = 'contagem_pesquisas') THEN
        CREATE POLICY contagem_pesquisas_select ON public.contagem_pesquisas FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contagem_pesquisas_service' AND tablename = 'contagem_pesquisas') THEN
        CREATE POLICY contagem_pesquisas_service ON public.contagem_pesquisas FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.3 ceap_despesas_cache — Cota para Exercício da Atividade Parlamentar
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ceap_despesas_cache (
    id                  BIGSERIAL PRIMARY KEY,
    id_deputado         INTEGER NOT NULL,
    ano                 INTEGER NOT NULL,
    cnpj_cpf_fornecedor TEXT,
    nome_fornecedor     TEXT,
    tipo_despesa        TEXT,
    valor_documento     NUMERIC(14,2) NOT NULL DEFAULT 0,
    data_documento      TEXT,
    url_documento       TEXT
);

CREATE INDEX IF NOT EXISTS idx_ceap_id_deputado ON public.ceap_despesas_cache (id_deputado);
CREATE INDEX IF NOT EXISTS idx_ceap_ano ON public.ceap_despesas_cache (ano);

ALTER TABLE public.ceap_despesas_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ceap_select' AND tablename = 'ceap_despesas_cache') THEN
        CREATE POLICY ceap_select ON public.ceap_despesas_cache FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ceap_service' AND tablename = 'ceap_despesas_cache') THEN
        CREATE POLICY ceap_service ON public.ceap_despesas_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.4 tse_bens_historico — Bens declarados ao TSE (resolução de CPF)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tse_bens_historico (
    id              BIGSERIAL PRIMARY KEY,
    cpf_candidato   TEXT NOT NULL,
    nome_candidato  TEXT,
    ano_eleicao     INTEGER,
    valor_total     NUMERIC(14,2) DEFAULT 0,
    descricao_bens  JSONB
);

CREATE INDEX IF NOT EXISTS idx_tse_cpf ON public.tse_bens_historico (cpf_candidato);
CREATE INDEX IF NOT EXISTS idx_tse_nome ON public.tse_bens_historico USING gin (nome_candidato gin_trgm_ops);

ALTER TABLE public.tse_bens_historico ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tse_bens_select' AND tablename = 'tse_bens_historico') THEN
        CREATE POLICY tse_bens_select ON public.tse_bens_historico FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tse_bens_service' AND tablename = 'tse_bens_historico') THEN
        CREATE POLICY tse_bens_service ON public.tse_bens_historico FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.5 tse_doadores_cache — Cache de doadores de campanha (bypass WAF do TSE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tse_doadores_cache (
    id             BIGSERIAL PRIMARY KEY,
    nome_politico  TEXT NOT NULL,
    uf             TEXT NOT NULL,
    doadores       TEXT[],
    created_at     TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_tse_doadores UNIQUE (nome_politico, uf)
);

ALTER TABLE public.tse_doadores_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tse_doadores_select' AND tablename = 'tse_doadores_cache') THEN
        CREATE POLICY tse_doadores_select ON public.tse_doadores_cache FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tse_doadores_service' AND tablename = 'tse_doadores_cache') THEN
        CREATE POLICY tse_doadores_service ON public.tse_doadores_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.6 emendas_pix — Emendas PIX (Transferências Especiais)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.emendas_pix (
    id                  TEXT PRIMARY KEY,
    ano                 INTEGER NOT NULL,
    autor               TEXT NOT NULL,
    uf_destino          TEXT,
    municipio_destino   TEXT,
    valor_custeio       NUMERIC(14,2) DEFAULT 0,
    valor_investimento  NUMERIC(14,2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_emendas_autor ON public.emendas_pix (autor);
CREATE INDEX IF NOT EXISTS idx_emendas_uf ON public.emendas_pix (uf_destino);

ALTER TABLE public.emendas_pix ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'emendas_select' AND tablename = 'emendas_pix') THEN
        CREATE POLICY emendas_select ON public.emendas_pix FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'emendas_service' AND tablename = 'emendas_pix') THEN
        CREATE POLICY emendas_service ON public.emendas_pix FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.7 cmrj_despesas — Cota de Gabinete da Câmara Municipal do RJ
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cmrj_despesas (
    id                    BIGSERIAL PRIMARY KEY,
    vereador_nome         TEXT NOT NULL,
    fornecedor_nome       TEXT,
    fornecedor_cnpj_cpf   TEXT,
    valor                 NUMERIC(14,2) NOT NULL DEFAULT 0,
    data_despesa          TEXT,
    categoria_despesa     TEXT,
    descricao             TEXT,
    fonte_arquivo         TEXT,
    extraido_por          TEXT,

    CONSTRAINT uq_cmrj_despesa UNIQUE (vereador_nome, fornecedor_cnpj_cpf, valor, data_despesa, categoria_despesa)
);

CREATE INDEX IF NOT EXISTS idx_cmrj_vereador ON public.cmrj_despesas USING gin (vereador_nome gin_trgm_ops);

ALTER TABLE public.cmrj_despesas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cmrj_despesas_select' AND tablename = 'cmrj_despesas') THEN
        CREATE POLICY cmrj_despesas_select ON public.cmrj_despesas FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cmrj_despesas_service' AND tablename = 'cmrj_despesas') THEN
        CREATE POLICY cmrj_despesas_service ON public.cmrj_despesas FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.8 cmrj_vereador_gabinete — Mapeamento Vereador ↔ Gabinete
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cmrj_vereador_gabinete (
    id               BIGSERIAL PRIMARY KEY,
    nome_urna        TEXT NOT NULL UNIQUE,
    gabinete_numero  TEXT NOT NULL
);

ALTER TABLE public.cmrj_vereador_gabinete ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cmrj_gabinete_select' AND tablename = 'cmrj_vereador_gabinete') THEN
        CREATE POLICY cmrj_gabinete_select ON public.cmrj_vereador_gabinete FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cmrj_gabinete_service' AND tablename = 'cmrj_vereador_gabinete') THEN
        CREATE POLICY cmrj_gabinete_service ON public.cmrj_vereador_gabinete FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.9 cmrj_servidores — Relação de Servidores da CMRJ
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cmrj_servidores (
    id               BIGSERIAL PRIMARY KEY,
    nome             TEXT NOT NULL,
    vinculo          TEXT,
    simbolo          TEXT,
    cargo            TEXT,
    lotacao          TEXT,
    data_ingresso    TEXT,
    data_publicacao  TEXT,
    num_resolucao    TEXT
);

CREATE INDEX IF NOT EXISTS idx_cmrj_serv_nome ON public.cmrj_servidores USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cmrj_serv_lotacao ON public.cmrj_servidores (lotacao);

ALTER TABLE public.cmrj_servidores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cmrj_servidores_select' AND tablename = 'cmrj_servidores') THEN
        CREATE POLICY cmrj_servidores_select ON public.cmrj_servidores FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cmrj_servidores_service' AND tablename = 'cmrj_servidores') THEN
        CREATE POLICY cmrj_servidores_service ON public.cmrj_servidores FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.10 camara_frequencia — Presença em Sessões Deliberativas (Câmara Federal)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camara_frequencia (
    id                          BIGSERIAL PRIMARY KEY,
    id_deputado                 INTEGER NOT NULL,
    presencas                   INTEGER NOT NULL DEFAULT 0,
    ausencias_nao_justificadas  INTEGER NOT NULL DEFAULT 0,
    ano                         INTEGER NOT NULL,

    CONSTRAINT uq_frequencia UNIQUE (id_deputado, ano)
);

ALTER TABLE public.camara_frequencia ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'frequencia_select' AND tablename = 'camara_frequencia') THEN
        CREATE POLICY frequencia_select ON public.camara_frequencia FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'frequencia_service' AND tablename = 'camara_frequencia') THEN
        CREATE POLICY frequencia_service ON public.camara_frequencia FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.11 camara_votacoes — Participação em Votações (Câmara Federal)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.camara_votacoes (
    id                      BIGSERIAL PRIMARY KEY,
    id_deputado             INTEGER NOT NULL,
    votos_registrados       INTEGER NOT NULL DEFAULT 0,
    ausencias_em_votacoes   INTEGER NOT NULL DEFAULT 0,
    ano                     INTEGER NOT NULL,

    CONSTRAINT uq_votacoes UNIQUE (id_deputado, ano)
);

ALTER TABLE public.camara_votacoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'votacoes_select' AND tablename = 'camara_votacoes') THEN
        CREATE POLICY votacoes_select ON public.camara_votacoes FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'votacoes_service' AND tablename = 'camara_votacoes') THEN
        CREATE POLICY votacoes_service ON public.camara_votacoes FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.12 ibama_infracoes — Infrações Ambientais (IBAMA)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ibama_infracoes (
    id             BIGSERIAL PRIMARY KEY,
    cpf_cnpj       TEXT NOT NULL,
    nome_infrator  TEXT,
    valor_multa    NUMERIC(14,2) DEFAULT 0,
    tipo_infracao  TEXT,
    data_auto      TEXT
);

CREATE INDEX IF NOT EXISTS idx_ibama_cpf ON public.ibama_infracoes (cpf_cnpj);

ALTER TABLE public.ibama_infracoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ibama_select' AND tablename = 'ibama_infracoes') THEN
        CREATE POLICY ibama_select ON public.ibama_infracoes FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ibama_service' AND tablename = 'ibama_infracoes') THEN
        CREATE POLICY ibama_service ON public.ibama_infracoes FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.13 anac_rab — Registro Aeronáutico Brasileiro (ANAC)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anac_rab (
    id                      BIGSERIAL PRIMARY KEY,
    prefixo                 TEXT NOT NULL UNIQUE,
    proprietario_documento  TEXT,
    proprietario_nome       TEXT,
    modelo                  TEXT,
    situacao                TEXT,
    fabricante              TEXT
);

CREATE INDEX IF NOT EXISTS idx_anac_proprietario ON public.anac_rab USING gin (proprietario_nome gin_trgm_ops);

ALTER TABLE public.anac_rab ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anac_select' AND tablename = 'anac_rab') THEN
        CREATE POLICY anac_select ON public.anac_rab FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anac_service' AND tablename = 'anac_rab') THEN
        CREATE POLICY anac_service ON public.anac_rab FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.14 spu_imoveis — Imóveis da União (Secretaria de Patrimônio da União)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spu_imoveis (
    id              BIGSERIAL PRIMARY KEY,
    uf              TEXT,
    municipio_nome  TEXT,
    endereco        TEXT UNIQUE,
    tipo_imovel     TEXT,
    area_m2         NUMERIC(14,2) DEFAULT 0,
    valor_imovel    NUMERIC(14,2) DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_spu_municipio ON public.spu_imoveis USING gin (municipio_nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_spu_uf ON public.spu_imoveis (uf);

ALTER TABLE public.spu_imoveis ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'spu_select' AND tablename = 'spu_imoveis') THEN
        CREATE POLICY spu_select ON public.spu_imoveis FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'spu_service' AND tablename = 'spu_imoveis') THEN
        CREATE POLICY spu_service ON public.spu_imoveis FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. VIEWS DO DASHBOARD
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.1 dashboard_ceap_top10 — Top 10 deputados por gasto CEAP (ano corrente)
--     MATERIALIZED porque é custosa e atualizada via RPC após ETL
-- ─────────────────────────────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.dashboard_ceap_top10;
CREATE MATERIALIZED VIEW public.dashboard_ceap_top10 AS
SELECT id_deputado, SUM(valor_documento) AS total_gasto
FROM public.ceap_despesas_cache
WHERE ano = EXTRACT(YEAR FROM CURRENT_DATE)::int
GROUP BY id_deputado
ORDER BY total_gasto DESC
LIMIT 10;

GRANT SELECT ON public.dashboard_ceap_top10 TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.2 dashboard_ceap_total — Total geral de gastos CEAP (ano corrente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.dashboard_ceap_total AS
SELECT
    EXTRACT(YEAR FROM CURRENT_DATE)::int AS ano,
    SUM(valor_documento) AS total_gasto,
    COUNT(*) AS total_notas
FROM public.ceap_despesas_cache
WHERE ano = EXTRACT(YEAR FROM CURRENT_DATE)::int;

GRANT SELECT ON public.dashboard_ceap_total TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.3 dashboard_ceap_categorias — Gastos CEAP agrupados por tipo de despesa
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.dashboard_ceap_categorias AS
SELECT tipo_despesa, SUM(valor_documento) AS total_gasto
FROM public.ceap_despesas_cache
WHERE ano = EXTRACT(YEAR FROM CURRENT_DATE)::int
GROUP BY tipo_despesa
ORDER BY total_gasto DESC;

GRANT SELECT ON public.dashboard_ceap_categorias TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.4 dashboard_ceap_2025_deputados — Todos os deputados com gasto (ano >= 2025)
--     Usado no mapa de calor por UF (front calcula agrupamento por estado)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.dashboard_ceap_2025_deputados AS
SELECT id_deputado, SUM(valor_documento) AS total_gasto
FROM public.ceap_despesas_cache
WHERE ano >= 2025
GROUP BY id_deputado
ORDER BY total_gasto DESC;

GRANT SELECT ON public.dashboard_ceap_2025_deputados TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.5 dashboard_emendas_top10 — Top 10 autores de emendas PIX
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.dashboard_emendas_top10 AS
SELECT autor, SUM(valor_investimento) AS total_pix
FROM public.emendas_pix
GROUP BY autor
ORDER BY total_pix DESC
LIMIT 10;

GRANT SELECT ON public.dashboard_emendas_top10 TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.6 dashboard_emendas_uf — Emendas PIX agrupadas por UF de destino
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.dashboard_emendas_uf AS
SELECT uf_destino, SUM(valor_investimento) AS total_pix
FROM public.emendas_pix
GROUP BY uf_destino
ORDER BY total_pix DESC;

GRANT SELECT ON public.dashboard_emendas_uf TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.7 dashboard_pesquisas_top10 — Top 10 políticos mais investigados
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.dashboard_pesquisas_top10 AS
SELECT
    nome,
    id_politico AS id_deputado,
    casa,
    total AS total_pesquisas
FROM public.contagem_pesquisas
ORDER BY total DESC
LIMIT 10;

GRANT SELECT ON public.dashboard_pesquisas_top10 TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. FUNÇÕES RPC
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1 incrementar_pesquisa — Upsert + incremento atômico no contador
--     Chamado em: src/services/core/investigador-principal.ts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.incrementar_pesquisa(
    p_nome        TEXT,
    p_id_politico TEXT,
    p_casa        TEXT DEFAULT 'GLOBAL',
    p_ref         TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.contagem_pesquisas (nome, id_politico, casa, ref, total, updated_at)
    VALUES (p_nome, p_id_politico, p_casa, p_ref, 1, NOW())
    ON CONFLICT (nome, id_politico)
    DO UPDATE SET
        total      = contagem_pesquisas.total + 1,
        casa       = EXCLUDED.casa,
        ref        = COALESCE(EXCLUDED.ref, contagem_pesquisas.ref),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.incrementar_pesquisa(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2 refresh_ceap_materialized_views — Atualiza views materializadas CEAP
--     Chamado em: scripts/etl/ceap-sync.ts após carga de dados
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_ceap_materialized_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW public.dashboard_ceap_top10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.refresh_ceap_materialized_views() TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. STORAGE BUCKET
-- ═══════════════════════════════════════════════════════════════════════════════

-- Bucket público para fotos oficiais dos parlamentares
-- Usado em: scripts/etl/fotos-sync.ts e no enriquecimento do dashboard
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fotos-politicos',
    'fotos-politicos',
    true,
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy de leitura pública para o bucket
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM storage.policies
        WHERE name = 'fotos_public_read' AND bucket_id = 'fotos-politicos'
    ) THEN
        INSERT INTO storage.policies (name, bucket_id, operation, definition)
        VALUES (
            'fotos_public_read',
            'fotos-politicos',
            'SELECT',
            '(true)'
        );
    END IF;
EXCEPTION WHEN undefined_table THEN
    -- storage.policies pode não existir em todas as versões do Supabase.
    -- Nesse caso, crie a policy de leitura manualmente via Dashboard.
    RAISE NOTICE 'storage.policies não disponível — crie a policy de leitura via Dashboard do Supabase.';
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIM DO SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════════
-- Após executar este script, popule as tabelas usando os ETLs:
--   npx tsx scripts/etl/ceap-sync.ts        → CEAP (despesas federais)
--   npx tsx scripts/etl/frequencia-sync.ts   → Frequência em sessões
--   npx tsx scripts/etl/votacoes-sync.ts     → Participação em votações
--   npx tsx scripts/etl/emendas-pix-sync.ts  → Emendas PIX
--   npx tsx scripts/etl/tse-sync-real.ts     → Bens TSE
--   npx tsx scripts/etl/fotos-sync.ts        → Fotos dos parlamentares
--   npm run sync:spu                         → Imóveis da União
--   npx tsx scripts/etl/sync-cmrj-servidores.ts → Servidores CMRJ
--   npx tsx scripts/etl/cmrj_cotas_etl.ts    → Cotas CMRJ (requer Playwright)
