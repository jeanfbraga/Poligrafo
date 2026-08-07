-- Execute este script no SQL Editor do seu Banco de Dados SECUNDÁRIO (Perfil)

-- 1. Remove a restrição única antiga (que permitia apenas 1 registro por deputado)
-- Como não sabemos o nome exato da constraint, a forma mais segura de recriar a chave primária
-- no Supabase é dropando a primary key atual ou a constraint unique.
-- Normalmente o Supabase nomeia a PK como "camara_cota_resumo_cache_pkey"
ALTER TABLE camara_cota_resumo_cache DROP CONSTRAINT IF EXISTS camara_cota_resumo_cache_pkey;
ALTER TABLE camara_cota_resumo_cache DROP CONSTRAINT IF EXISTS camara_cota_resumo_cache_deputado_id_key;

-- 2. (Opcional, mas recomendado) Limpar o cache antigo para evitar conflitos na criação da nova chave
TRUNCATE TABLE camara_cota_resumo_cache;

-- 3. Adiciona a nova restrição de unicidade composta (Deputado + Ano + Mês)
-- Isso permite múltiplos meses para o mesmo deputado
ALTER TABLE camara_cota_resumo_cache ADD PRIMARY KEY (deputado_id, ano_referencia, mes_referencia);
