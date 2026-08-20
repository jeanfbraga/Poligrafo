import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const env = dotenv.parse(fs.readFileSync(envPath));

async function executeSqlOnPrincipal(sql: string) {
	const token = env.SUPABASE_ACCESS_TOKEN;
	const ref = env.SUPABASE_PROJECT_REF;

	const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ query: sql })
	});

	if (!res.ok) {
		throw new Error(`HTTP ${res.status}: ${await res.text()}`);
	}

	return await res.json();
}

async function migrateUnifiedSchema() {
	console.log('--- Aplicando Schema Canônico Unificado no Banco Principal ---');

	const ddl = `
		-- 1. Tabela Central de Políticos
		CREATE TABLE IF NOT EXISTS public.politicos (
			id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			cpf                TEXT UNIQUE,
			nome_civil         TEXT NOT NULL,
			nome_urna          TEXT,
			data_nascimento    DATE,
			uf_naturalidade    TEXT,
			foto_url           TEXT,
			biografia          TEXT,
			created_at         TIMESTAMPTZ DEFAULT NOW(),
			updated_at         TIMESTAMPTZ DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_politicos_nome_civil ON public.politicos USING gin (nome_civil gin_trgm_ops);
		CREATE INDEX IF NOT EXISTS idx_politicos_nome_urna ON public.politicos USING gin (nome_urna gin_trgm_ops);
		CREATE INDEX IF NOT EXISTS idx_politicos_cpf ON public.politicos (cpf);

		ALTER TABLE public.politicos ENABLE ROW LEVEL SECURITY;

		DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'politicos_select' AND tablename = 'politicos') THEN
				CREATE POLICY politicos_select ON public.politicos FOR SELECT TO anon, authenticated USING (true);
			END IF;
			IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'politicos_service' AND tablename = 'politicos') THEN
				CREATE POLICY politicos_service ON public.politicos FOR ALL TO service_role USING (true) WITH CHECK (true);
			END IF;
		END $$;

		-- 2. Tabela de Órgãos Públicos
		CREATE TABLE IF NOT EXISTS public.orgaos_publicos (
			id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			esfera             TEXT NOT NULL, -- 'FEDERAL', 'ESTADUAL', 'MUNICIPAL'
			poder              TEXT NOT NULL, -- 'EXECUTIVO', 'LEGISLATIVO', 'JUDICIARIO'
			uf                 TEXT,
			municipio          TEXT,
			nome               TEXT NOT NULL,
			sigla              TEXT,
			cnpj               TEXT,
			created_at         TIMESTAMPTZ DEFAULT NOW(),

			CONSTRAINT uq_orgaos_esfera_municipio UNIQUE (esfera, poder, uf, municipio, sigla)
		);

		CREATE INDEX IF NOT EXISTS idx_orgaos_uf_municipio ON public.orgaos_publicos (uf, municipio);
		CREATE INDEX IF NOT EXISTS idx_orgaos_nome ON public.orgaos_publicos USING gin (nome gin_trgm_ops);

		ALTER TABLE public.orgaos_publicos ENABLE ROW LEVEL SECURITY;

		DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orgaos_select' AND tablename = 'orgaos_publicos') THEN
				CREATE POLICY orgaos_select ON public.orgaos_publicos FOR SELECT TO anon, authenticated USING (true);
			END IF;
			IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orgaos_service' AND tablename = 'orgaos_publicos') THEN
				CREATE POLICY orgaos_service ON public.orgaos_publicos FOR ALL TO service_role USING (true) WITH CHECK (true);
			END IF;
		END $$;

		-- 3. Tabela de Mandatos
		CREATE TABLE IF NOT EXISTS public.mandatos (
			id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			politico_id        UUID REFERENCES public.politicos(id) ON DELETE CASCADE,
			orgao_id           UUID REFERENCES public.orgaos_publicos(id) ON DELETE CASCADE,
			cargo              TEXT NOT NULL, -- 'PRESIDENTE', 'DEPUTADO_FEDERAL', 'SENADOR', 'GOVERNADOR', 'PREFEITO', 'VEREADOR'
			partido            TEXT,
			ano_inicio         INT NOT NULL,
			ano_fim            INT,
			situacao           TEXT DEFAULT 'TITULAR', -- 'TITULAR', 'SUPLENTE', 'AFASTADO'
			gabinete           TEXT,
			created_at         TIMESTAMPTZ DEFAULT NOW(),

			CONSTRAINT uq_mandato_politico_cargo_ano UNIQUE (politico_id, orgao_id, cargo, ano_inicio)
		);

		CREATE INDEX IF NOT EXISTS idx_mandatos_politico ON public.mandatos (politico_id);
		CREATE INDEX IF NOT EXISTS idx_mandatos_orgao ON public.mandatos (orgao_id);
		CREATE INDEX IF NOT EXISTS idx_mandatos_cargo ON public.mandatos (cargo);

		ALTER TABLE public.mandatos ENABLE ROW LEVEL SECURITY;

		DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mandatos_select' AND tablename = 'mandatos') THEN
				CREATE POLICY mandatos_select ON public.mandatos FOR SELECT TO anon, authenticated USING (true);
			END IF;
			IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mandatos_service' AND tablename = 'mandatos') THEN
				CREATE POLICY mandatos_service ON public.mandatos FOR ALL TO service_role USING (true) WITH CHECK (true);
			END IF;
		END $$;

		-- 4. Tabela Unificada de Despesas Públicas
		CREATE TABLE IF NOT EXISTS public.despesas_publicas (
			id                    BIGSERIAL PRIMARY KEY,
			politico_id           UUID REFERENCES public.politicos(id) ON DELETE SET NULL,
			mandato_id            UUID REFERENCES public.mandatos(id) ON DELETE SET NULL,
			orgao_id              UUID REFERENCES public.orgaos_publicos(id) ON DELETE SET NULL,
			tipo_despesa          TEXT NOT NULL,
			fornecedor_nome       TEXT,
			fornecedor_cnpj_cpf   TEXT,
			valor                 NUMERIC(14,2) NOT NULL DEFAULT 0,
			data_despesa          TEXT,
			categoria_despesa     TEXT,
			descricao             TEXT,
			numero_documento      TEXT,
			fonte_url             TEXT,
			extraido_por          TEXT DEFAULT 'ETL_CANONICO',
			created_at            TIMESTAMPTZ DEFAULT NOW(),

			CONSTRAINT uq_despesa_publica UNIQUE (orgao_id, politico_id, fornecedor_cnpj_cpf, valor, data_despesa, numero_documento)
		);

		CREATE INDEX IF NOT EXISTS idx_despesas_politico ON public.despesas_publicas (politico_id);
		CREATE INDEX IF NOT EXISTS idx_despesas_mandato ON public.despesas_publicas (mandato_id);
		CREATE INDEX IF NOT EXISTS idx_despesas_orgao ON public.despesas_publicas (orgao_id);
		CREATE INDEX IF NOT EXISTS idx_despesas_fornecedor_nome ON public.despesas_publicas USING gin (fornecedor_nome gin_trgm_ops);
		CREATE INDEX IF NOT EXISTS idx_despesas_fornecedor_doc ON public.despesas_publicas (fornecedor_cnpj_cpf);
		CREATE INDEX IF NOT EXISTS idx_despesas_data ON public.despesas_publicas (data_despesa);

		ALTER TABLE public.despesas_publicas ENABLE ROW LEVEL SECURITY;

		DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'despesas_publicas_select' AND tablename = 'despesas_publicas') THEN
				CREATE POLICY despesas_publicas_select ON public.despesas_publicas FOR SELECT TO anon, authenticated USING (true);
			END IF;
			IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'despesas_publicas_service' AND tablename = 'despesas_publicas') THEN
				CREATE POLICY despesas_publicas_service ON public.despesas_publicas FOR ALL TO service_role USING (true) WITH CHECK (true);
			END IF;
		END $$;
	`;

	try {
		const res = await executeSqlOnPrincipal(ddl);
		console.log('✅ Tabelas canônicas criadas com sucesso no Banco Principal!');
	} catch (e: any) {
		console.error('❌ Erro ao criar schema canônico:', e.message);
	}
}

migrateUnifiedSchema();
