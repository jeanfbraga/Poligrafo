-- ===============================================================================
-- MIGRAÇÃO — BANCO DE PERFIL: ceap_fornecedores_ano (Fase 5, nota 28 do Obsidian)
-- ===============================================================================
-- Cota parlamentar (CEAP) da Câmara e do Senado AGRUPADA por parlamentar + ano +
-- fornecedor + tipo de despesa, na janela de 4 anos do mandato (decisão do dono,
-- 08/10/2026). Alimenta o motor de cruzamentos com TODOS os fornecedores da cota
-- (antes, só os das 60 notas de maior valor). As notas soltas continuam no
-- Principal (ceap_despesas_cache), para o dossiê.
-- ~50 mil linhas por ano (notas soltas: ~245 mil). Carga: scripts/etl/ceap-fornecedores-sync.ts.
-- Há fornecedor pessoa física (CPF): só o servidor lê (service_role). Idempotente.
-- ===============================================================================

CREATE TABLE IF NOT EXISTS public.ceap_fornecedores_ano (
    casa            TEXT NOT NULL CHECK (casa IN ('CAMARA', 'SENADO')),
    id_parlamentar  INTEGER NOT NULL,             -- id da Câmara (ideCadastro) ou código do senador
    ano             INTEGER NOT NULL,
    documento       TEXT NOT NULL,                -- CNPJ/CPF do fornecedor, só dígitos
    tipo_despesa    TEXT NOT NULL,
    fornecedor      TEXT,
    valor_total     NUMERIC(14, 2) NOT NULL,
    notas           INTEGER NOT NULL,
    primeira_data   DATE,
    ultima_data     DATE,
    atualizado_em   TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (casa, id_parlamentar, ano, documento, tipo_despesa)
);

ALTER TABLE public.ceap_fornecedores_ano ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ceap_fornecedores_ano_service' AND tablename = 'ceap_fornecedores_ano') THEN
        CREATE POLICY ceap_fornecedores_ano_service ON public.ceap_fornecedores_ano FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

REVOKE ALL ON public.ceap_fornecedores_ano FROM anon, authenticated;
