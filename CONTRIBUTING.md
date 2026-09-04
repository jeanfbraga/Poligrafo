# Contribuindo para o Polígrafo

Obrigado por se interessar em contribuir para o Polígrafo! Como um projeto de código aberto voltado para a transparência pública, toda ajuda é bem-vinda, seja corrigindo bugs, adicionando fontes de dados (OSINT) ou melhorando a interface e os prompts de Inteligência Artificial.

## Pré-requisitos

- **Node.js ≥ 24** (há um `.nvmrc` com a versão 24 para quem usa `nvm`).
- **Supabase** — plano gratuito funciona. Veja a tabela de variáveis de ambiente no [README](README.md).
- **`curl`, `tar` e `unzip`** no shell (já presentes no Windows 10+, Linux e macOS).

## Como começar

1. **Faça um Fork** do repositório.
2. Crie uma branch para a sua modificação (`git checkout -b feature/minha-feature`).
3. Instale as dependências com `npm install`.
4. Copie `.env.example` para `.env.local` e configure as suas chaves de API necessárias para rodar o projeto localmente (ex: Supabase, Groq, OpenRouter, DataJud, CGU).
5. Configure o banco — execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do seu projeto Supabase (um único projeto gratuito é suficiente).
6. Inicie o ambiente de desenvolvimento (`npm run dev`).

## Arquitetura e Diretrizes de Código

Para uma referência completa da arquitetura, convenções, fluxo de investigação e protocolo de trabalho, consulte o [`AGENTS.md`](AGENTS.md).

Abaixo estão os pontos mais relevantes para contribuidores:

### 1. Motor de Inteligência Artificial em Cascata (AI Fallbacks & SSOT)
Nosso sistema de IA de julgamento (Score de Letalidade) opera sob uma política de **Custo $0,00** e utiliza o arquivo **`src/services/ai/ai-models-config.ts`** como Fonte Única da Verdade (*Single Source of Truth*):
*   **L1 (Groq Developer Free Tier)**: `groq/compound`, `openai/gpt-oss-120b`, `qwen/qwen3.6-27b` (200 RPM / 200k TPM).
*   **L2 (OpenRouter Free Tier)**: Auto-roteador `openrouter/free` e modelos com sufixo `:free`.
*   **L3 (Google Gemini & Gemma Free Tier)**: `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-3.5-flash-lite`, `gemma-4-31b-it` (15 RPM / 1.500 RPD).
*   **L4 (Heurística Matemática Local)**: Classificação pericial offline via RegEx e limites normativos se todas as APIs falharem ou se nenhuma chave for fornecida.

> **💡 Dica para Contribuidores:** Se você quiser adicionar um novo modelo ou alterar um existente, modifique **apenas** o arquivo `src/services/ai/ai-models-config.ts`. Todo o sistema (investigações, resumos de projetos, PNCP e diários) herdará a alteração automaticamente.
>
> **Importante:** Se for alterar ou criar novos prompts de IA (em `src/services/ai/prompt-builder.ts` ou `ai_helpers.ts`), certifique-se de testar os prompts **em todos os níveis da cascata**. Modelos diferentes reagem de formas diferentes aos prompts de JSON estrito.

### 2. Arquitetura de Dados: Modelo Canônico Unificado vs Tabelas Específicas
Para garantir escalabilidade nacional (5.570 municípios e 27 estados) sem explodir o número de tabelas no PostgreSQL, o Polígrafo adota um **Modelo Relacional Canônico Unificado**:

```
┌─────────────────┐       ┌─────────────────┐       ┌──────────────────────┐
│    politicos    │──────<│    mandatos     │>──────│   orgaos_publicos    │
└─────────────────┘       └─────────────────┘       └──────────────────────┘
         │                         │                            │
         │                         ▼                            │
         │                ┌─────────────────┐                   │
         └───────────────>│despesas_publicas│<──────────────────┘
                          └─────────────────┘
```

1. **`politicos`**: Cadastro unificado de agentes públicos (`cpf`, `nome_civil`, `nome_urna`, `foto_url`, `biografia`).
2. **`orgaos_publicos`**: Cadastro de órgãos dos 3 poderes e esferas (`esfera`, `poder`, `uf`, `municipio`, `sigla`, `cnpj`).
3. **`mandatos`**: Vínculo histórico e atual de mandato entre político e órgão (`cargo`, `partido`, `ano_inicio`, `ano_fim`, `situacao`).
4. **`despesas_publicas`**: Registro canônico unificado para qualquer despesa (CEAP federal, cotas de câmaras municipais, diárias, contratos).

> **💡 Regra de Ouro da Escalabilidade:** Nunca crie uma nova tabela por cidade (`salvador_despesas`, `recife_despesas`). Novos dados municipais e estaduais devem alimentar preferencialmente as tabelas unificadas `despesas_publicas` e `politicos`, usando `orgao_id` e `mandato_id` para segmentação.

---

### 3. Guia Passo a Passo: Como Conectar um Novo Município ou Estado
Para adicionar suporte a uma nova capital, câmara municipal ou assembleia legislativa (ex: Aracaju, Salvador, ALESP), siga este roteiro de 5 passos:

#### Passo 1 — Criar o Extrator / Scraper Nativo
Crie o arquivo em `src/app/api/investigar/estados/[uf]/[municipio].ts` (ou `tce.ts`):
* Implemente `buscarMunicipal[UF](nomeBuscado)`: Resolve o candidato via TSE (`buscarCpfNoTSE`) para vereador (cargo 13) e prefeito (cargo 11).
* Implemente `buscarDespesas[Municipio](identificador, nomeParaBusca, ...)`: Segue a estratégia híbrida:
  1. Consulta `despesas_publicas` ou tabela de cache no Supabase (`supabaseAdmin`).
  2. Faz fallback live para as APIs municipais ou do Tribunal de Contas estadual (TCE) usando `fetchWithTimeout`.
  3. Formata os registros no formato canônico `{ tipoDespesa, fornecedor, cnpjFornecedor, valorLiquido, dataDocumento, descricao, urlDocumento }`.

#### Passo 2 — Conectar ao Roteador Municipal Mestre
No arquivo `src/app/api/investigar/municipios/router.ts`:
* Importe seu extrator e adicione o case `"[UF]"` dentro de `buscarMunicipalMestre` e `buscarDespesasMunicipalMestre`.
* Adicione a UF nas listas de varredura assíncrona de `src/services/core/identificacao-candidato.ts` e `investigador-principal.ts`.

#### Passo 3 — Cadastrar Parlamentares no Autocomplete da SearchBar
Adicione os vereadores ou prefeitos em `src/services/integrations/data/municipais-index.json`:
```json
{
  "id": "nome-politico-municipio",
  "nome": "Nome do Político",
  "casa": "CAMARA_MUNICIPAL",
  "cargo": "Vereador",
  "uf": "SE",
  "municipio": "aracaju",
  "partido": "PSB",
  "orgao": "CMA"
}
```
Isso faz o político aparecer instantaneamente no autocomplete da busca com badge de identificação (ex: `[CMA - Aracaju / SE]`).

#### Passo 4 — Criar o Script de ETL e Automação (Opcional)
Se a câmara ou prefeitura disponibilizar dados abertos para download em lote:
* Crie `scripts/etl/[municipio]-sync.ts` para baixar os dados e executar `upsert` no Supabase via `service_role`.
* Crie `.github/workflows/[municipio]-sync.yml` configurando a execução agendada (ex: dias úteis).

#### Passo 5 — Escrever Testes Automatizados (Vitest)
Crie os testes cobrindo:
* Resolução de candidatos e busca com cache hit/miss em `__tests__/estados/[uf].test.ts`.
* Roteamento geográfico em `__tests__/unit/municipio-router-[uf].test.ts`.
* Funções do ETL em `__tests__/unit/[municipio]-sync.test.ts`.

---

### 4. Adicionando Novos Scrapers Federais e Judiciais
* Scrapers de âmbito federal ou judicial geral (como CNJ/DataJud e CGU) devem ficar em `src/app/api/investigar/scrapers/`.
* Clients de APIs de dados externos devem ficar em `src/services/integrations/[fonte]/client.ts`.
* Todo novo *fetch* externo DEVE usar a função `fetchWithTimeout` (exportada de `src/app/api/investigar/tse.ts`) para evitar travar as requisições *serverless* da Vercel.
* Respeite os rate limiters de `src/services/core/rate-limiter.ts`.
* Mantenha a segurança e higienize os dados contra injeção maliciosa e prompt injection.

### 5. Padrão Cache-First (Supabase como Insumos)
Ao criar novas integrações que alimentam a investigação, siga o padrão **cache-first** já extensamente implementado:
1. **Cache-first**: consulta o Supabase primeiro (query indexada, sub-50ms). Ex: `despesas_publicas`, `ceap_despesas_cache`, `emendas_pix`.
2. **Fallback live**: se cache vazio ou stale, consulta a API original (TransfereGov, Dados Abertos, etc).
3. **Write-back**: grava o resultado no cache para próximas buscas via ETLs em background.
4. **Bypass de 24h**: O resultado completo de uma investigação (o grafo inteiro) fica armazenado na tabela `pesquisas`. Buscas pelo mesmo político dentro de 24h retornarão o grafo inteiro do banco instantaneamente, pulando até mesmo os *fallback lives* e requisições à IA, protegendo a cota das APIs externas.
5. **Transparência**: emita evento SSE indicando a fonte (`[CACHE]` vs API) para visualização no frontend.

### 6. Integração com Banco de Dados (Supabase) e ETLs
* **Acesso Seguro:** Operações críticas (gravação de alertas, sincronização massiva) devem ser feitas usando a `SUPABASE_SERVICE_ROLE_KEY` exclusivamente do lado do servidor.
* **Schema Único e Completo:** O arquivo [`supabase/schema.sql`](supabase/schema.sql) é 100% auto-contido e idempotente, provisionando todas as tabelas (canônicas, investigação, OSINT e perfis parlamentares) em um único projeto Supabase.
* **Ambiente Open Source (1 Banco) vs Produção (2 Bancos):**
  * Para desenvolvimento e instâncias open source, **1 único banco Supabase gratuito** é suficiente.
  * Em produção, o projeto separa o Banco Principal do Banco de Perfis para contornar limites de storage (500MB do free tier), com fallback automático em `src/lib/supabase-perfil.ts`.
* **Scripts de ETL (Sincronização em Lote):**
  O projeto possui *pipelines* para baixar bases governamentais gigantes e popular o banco de dados. Eles ficam na pasta `scripts/etl/` (ex: `ibama-sync.ts`, `anac-sync.ts`, `aracaju-sync.ts`, `cpgf-sync.ts`).
  * **Como testar/rodar os ETLs localmente:**
    1. Certifique-se de que o seu `.env.local` possui as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
    2. Execute o script via *tsx*:
       `npx tsx scripts/etl/aracaju-sync.ts`
    3. **Atenção à Memória:** Nossos ETLs utilizam bibliotecas como `csv-parse` e `fs.createReadStream` para não estourar a memória (arquivos >100MB). Utilize `streams` e processe o envio para o Supabase em lotes (*batches*) de 50 a 500 registros com `upsert`.
  * **Cross-platform:** Para download de arquivos, use detecção de plataforma (`process.platform === 'win32'` → `curl.exe`, senão → `curl`) para garantir compatibilidade com os runners Ubuntu do GitHub Actions.
  * **Câmara (perfil/produção/detalhes):** Reutilize `scripts/etl/camara-http.ts`. O cliente limita a leitura do JSON, usa `curl` como fallback e retorna `null` apenas para HTTP 404. Falhas de rede não podem virar coleções vazias salvas no cache. Falhas de leitura/gravação devem resultar em código de saída não zero.
  * **CEAP:** Valide o CSV completo antes da exclusão, preserve `vlrLiquido` e restrinja a substituição a `casa = CAMARA`. Não atualize views após carga parcial. As gravações em lote não são transacionais; evite reexecuções concorrentes. Teste downloads, validação e erros com mocks, sem mutar o Supabase de produção.
  * **Índice do CEAP:** Instalações existentes devem aplicar `scripts/sql/migracao_indice_ceap_sync.sql` no banco principal. O índice `(ano, casa, id)`, também no schema completo, atende à seleção ordenada e à exclusão dos lotes. Ao investigar lentidão, confira o plano real com `EXPLAIN`.

### 5. Componentes, UI e Design System
*   Siga as convenções modernas do App Router do Next.js.
*   O Polígrafo usa um design focado em "Terminal/Hacker OSINT" (fundo escuro forçado `#000000`, verde neon `green-500`, bordas retas `rounded-none`, fonte mono `font-mono`).
*   **Tipografia do Design System:**
    *   O tamanho mínimo de fonte é **10px** (`text-[10px]`), permitido **apenas** acompanhado de `uppercase font-bold tracking-wider`.
    *   Textos regulares, mistos ou descritivos devem ter no mínimo **12px** (`text-xs`).
    *   Nunca utilize classes manuais `< 10px` (ex.: `text-[8px]` ou `text-[9px]`).
*   Componentes base em `src/components/ui/` seguem shadcn/ui — gere novos nesse padrão.

### 6. Complexidade Ciclomática e Clean Code
*   O ESLint impõe a regra estrita `complexity: ["error", 10]`.
*   Mantenha funções curtas, modulares e com responsabilidade única. Extraia sub-rotinas e helpers sempre que a lógica crescer.

### 7. GitHub Actions e Automações
O projeto conta com 8 workflows automatizados (CEAP, CPGF, CMRJ, TSE Doadores, IBAMA, ANAC, SPU, CI). Todos usam Node 24 e podem ser disparados manualmente via `workflow_dispatch`. Ao criar novos workflows:
*   Use `actions/setup-node@v4` com `node-version: '24'` e **`cache: 'npm'`**.
*   **Sempre** utilize `npm ci` ao invés de `npm install` para garantir execuções consistentes e aderentes ao `package-lock.json`.
*   Nunca commite secrets — use `gh secret set` e referencie via `${{ secrets.NOME }}`.
*   Teste localmente com `npx tsx` antes de configurar o cron.
*   Os workflows `camara-perfil-sync.yml` e `ceap-sync.yml` usam `concurrency` sem cancelar cargas em andamento. A etapa de detalhes das proposições recebe as mesmas variáveis opcionais `NEXT_PUBLIC_SUPABASE_PERFIL_URL` e `SUPABASE_PERFIL_SERVICE_ROLE_KEY` das etapas de perfil e produção.
*   Perfil/produção reutilizam `.github/actions/camara-perfil-sync/action.yml`. O preflight `scripts/etl/camara-preflight.mjs` não acessa o banco e só permite outro runner para erros de transporte anteriores à carga. São no máximo dois runners sequenciais; a segunda falha permanece fatal. Não amplie `continue-on-error` para os ETLs.

### 8. Arquivos Temporários e Sandbox
Se precisar fazer testes locais, salvar resultados brutos de APIs ou analisar *payloads* em arquivos soltos (`.json`, `.csv`, etc.), **utilize a pasta `.sandbox/` na raiz do projeto**. Ela já está no `.gitignore` para evitar poluição do repositório e *commits* indesejados de dados de teste.

## Testes e Gate de Qualidade

Antes de abrir um PR, **todos os checks devem estar verdes**:

```bash
npm run lint              # ESLint
npx tsc --noEmit          # Checagem de tipos
npm run test              # Vitest (testes unitários em __tests__/unit/)
```

Ou rode tudo de uma vez:

```bash
npm run test:all          # lint + tsc --noEmit + vitest
```

Se estiver adicionando uma funcionalidade crítica, alterando lógicas financeiras ou inserindo um novo motor OSINT, **adicione ou atualize os testes** no diretório `__tests__/unit/`. Para testes que dependem de rede ou do dev server rodando, use `__tests__/integration/`.

## Idioma

O projeto é 100% em **português (pt-BR)** — comentários, documentação, commits, nomes de testes e mensagens da IA. Siga o estilo de commit convencional: `feat: adiciona nova fonte de dados XYZ`.

## Enviando as alterações

1. Faça o commit das suas modificações (`git commit -m "feat: adiciona nova fonte de dados XYZ"`).
2. Dê push para a sua branch (`git push origin feature/minha-feature`).
3. Abra um **Pull Request (PR)**.
4. Descreva claramente o que foi alterado e como os testes foram feitos.

Se tiver dúvidas, precisar de ajuda ou quiser discutir uma funcionalidade grande antes de começar, sinta-se livre para usar o nosso [Fórum (Discussions)](https://github.com/jeanfbraga/Poligrafo/discussions). Para relatar bugs documentados ou sugerir alterações específicas, abra uma [Issue](https://github.com/jeanfbraga/Poligrafo/issues/new/choose).
