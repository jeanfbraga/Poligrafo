-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: tse_eleitos (Fase 3 do plano do pipe por alçada)
-- ===============================================================================
-- Executar no SQL Editor do Supabase do BANCO DE PERFIL (não no Principal: ele
-- passou do limite de espaço — regra de 06/10/2026, nota 28 do Obsidian).
--
-- Eleitos (e suplentes das casas legislativas) carregados do CSV nacional do TSE
-- (cdn.tse.jus.br, consulta_cand_{ano}.zip) por scripts/etl/tse-eleitos-sync.ts.
-- Serve para identificar a pessoa certa (identidade verificada) e para achar
-- prefeitos/vereadores das 27 UFs sem varrer centenas de chamadas ao DivulgaCand.
-- Estimativa: ~90 mil linhas (2018 senadores + 2022 + 2024), ~40–60 MB.
-- Idempotente: pode rodar mais de uma vez.
-- ===============================================================================

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS public.tse_eleitos (
    id                  BIGSERIAL PRIMARY KEY,
    sq_candidato        TEXT NOT NULL,
    ano_eleicao         INTEGER NOT NULL,
    cd_cargo            TEXT NOT NULL,          -- 1 pres., 3 gov., 5 sen., 6 dep. fed., 7 dep. est., 8 distrital, 11 pref., 13 ver.
    ds_cargo            TEXT,
    sg_uf               TEXT NOT NULL,
    sg_ue               TEXT,                   -- código TSE da unidade eleitoral (município ou UF)
    nm_ue               TEXT,                   -- nome do município (ou da UF)
    municipio_slug      TEXT,                   -- "sao-paulo" (mesmo slug das refs municipais)
    cd_municipio_ibge   TEXT,                   -- via mapa TSE↔IBGE (resultados.tse.jus.br)
    nm_candidato        TEXT NOT NULL,
    nm_urna_candidato   TEXT,
    nr_cpf_candidato    TEXT,                   -- só com dígito verificador válido; senão NULL
    sg_partido          TEXT,
    ds_sit_tot_turno    TEXT,                   -- ELEITO, ELEITO POR QP, ELEITO POR MÉDIA, SUPLENTE
    nomes_busca         TEXT NOT NULL,          -- nome + nome de urna, sem acento e em minúsculas
    atualizado_em       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    CONSTRAINT tse_eleitos_sq_ano UNIQUE (sq_candidato, ano_eleicao)
);

CREATE INDEX IF NOT EXISTS idx_tse_eleitos_nomes_trgm ON public.tse_eleitos USING gin (nomes_busca gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tse_eleitos_cpf ON public.tse_eleitos (nr_cpf_candidato) WHERE nr_cpf_candidato IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tse_eleitos_uf_cargo ON public.tse_eleitos (sg_uf, cd_cargo);

ALTER TABLE public.tse_eleitos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tse_eleitos_select' AND tablename = 'tse_eleitos') THEN
        CREATE POLICY tse_eleitos_select ON public.tse_eleitos FOR SELECT TO anon, authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tse_eleitos_service' AND tablename = 'tse_eleitos') THEN
        CREATE POLICY tse_eleitos_service ON public.tse_eleitos FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
