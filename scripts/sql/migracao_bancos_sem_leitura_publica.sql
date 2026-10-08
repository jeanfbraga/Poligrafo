-- =====================================================================
-- Bancos sem leitura pública (Principal e Banco de Perfil) — 08/10/2026
-- =====================================================================
-- Por quê: a chave anon do Supabase é pública por natureza (feita para ir ao navegador).
-- Com as políticas "SELECT TO anon USING (true)", qualquer pessoa com ela baixava as tabelas
-- inteiras pela API REST, inclusive CPFs completos (bens do TSE, eleitos, sanções da CGU,
-- fornecedores pessoa física da cota). O app NÃO usa a chave anon: só o servidor lê os bancos,
-- pela chave de serviço (que ignora RLS e tem permissão própria nas tabelas).
--
-- O que faz (idempotente; serve para os dois bancos):
--   1. remove as políticas que liberam leitura/escrita para anon, authenticated ou public;
--   2. tira as permissões de tabela/sequência de anon e authenticated (RLS segue ligado);
--   3. tabelas e funções criadas depois já nascem sem acesso público;
--   4. a função que soma o "Mais investigados" da Home só pode ser chamada pelo servidor
--      (antes qualquer um gravava nome e foto quaisquer na Home);
--   5. search_path fixo na função de gatilho (aviso do verificador do Supabase).
--
-- Aplicar: npm run sql:principal -- --arquivo scripts/sql/migracao_bancos_sem_leitura_publica.sql
--          npm run sql:perfil     -- --arquivo scripts/sql/migracao_bancos_sem_leitura_publica.sql
-- Desfazer: as permissões anteriores foram guardadas fora do git; para reabrir uma tabela,
--   GRANT SELECT ON public.<tabela> TO anon, authenticated;
--   CREATE POLICY <nome> ON public.<tabela> FOR SELECT TO anon, authenticated USING (true);

BEGIN;

DO $$
DECLARE r record;
BEGIN
	FOR r IN
		SELECT tablename, policyname FROM pg_policies
		WHERE schemaname = 'public' AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
	LOOP
		EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
	END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, public;

DO $$
DECLARE f record;
BEGIN
	FOR f IN
		SELECT p.oid::regprocedure AS assinatura FROM pg_proc p
		JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'public' AND p.proname IN ('incrementar_pesquisa', 'refresh_ceap_materialized_views')
	LOOP
		EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f.assinatura);
		EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.assinatura);
	END LOOP;
	IF to_regprocedure('public.set_atualizado_em()') IS NOT NULL THEN
		ALTER FUNCTION public.set_atualizado_em() SET search_path = public, pg_temp;
	END IF;
END $$;

COMMIT;

-- Conferência (deve dar 0 nas três colunas):
SELECT
	(SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
		AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) AS politicas_publicas,
	(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')
		AND has_table_privilege('anon', c.oid, 'SELECT')) AS tabelas_legiveis_por_anon,
	(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')
		AND NOT has_table_privilege('service_role', c.oid, 'SELECT')) AS tabelas_sem_acesso_do_servidor;
