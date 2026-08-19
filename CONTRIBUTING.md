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

### 2. Adicionando Novos Scrapers (Motores OSINT)
O Polígrafo coleta dados de diversas casas legislativas e tribunais. Se você for adicionar uma nova fonte de dados:
*   Coloque os scrapers estaduais/municipais na pasta `src/app/api/investigar/estados/[UF]/`. (Exemplo: `src/app/api/investigar/estados/rj/alerj.ts`).
*   Scrapers de âmbito federal ou judicial geral (como CNJ/DataJud e CGU) devem ficar em `src/app/api/investigar/scrapers/`.
*   Clients de APIs de dados devem ficar em `src/services/integrations/[fonte]/client.ts`.
*   Todo novo *fetch* externo deve usar a função de utilidade `fetchWithTimeout` (exportada de `src/app/api/investigar/tse.ts`) para evitar travar as requisições *serverless* da Vercel.
*   Respeite os rate limiters de `src/services/core/rate-limiter.ts`.
*   Mantenha a segurança e higienize os dados contra injeção maliciosa e prompt injection.

### 3. Padrão Cache-First (Supabase como Insumos)
Ao criar novas integrações que alimentam a investigação, siga o padrão **cache-first** já extensamente implementado:
1. **Cache-first**: consulta o Supabase primeiro (query indexada, sub-50ms). Ex: `ceap_despesas_cache`, `emendas_pix`.
2. **Fallback live**: se cache vazio ou stale, consulta a API original (TransfereGov, Dados Abertos, etc).
3. **Write-back**: grava o resultado no cache para próximas buscas via ETLs em background.
4. **Bypass de 24h**: O resultado completo de uma investigação (o grafo inteiro) fica armazenado na tabela `pesquisas`. Buscas pelo mesmo político dentro de 24h retornarão o grafo inteiro do banco instantaneamente, pulando até mesmo os *fallback lives* e requisições à IA, protegendo a cota das APIs externas.
5. **Transparência**: emita evento SSE indicando a fonte (`[CACHE]` vs API) para visualização no frontend.

### 4. Integração com Banco de Dados (Supabase) e ETLs
*   **Acesso Seguro:** Operações críticas (gravação de alertas, sincronização massiva) devem ser feitas usando a `SUPABASE_SERVICE_ROLE_KEY` exclusivamente do lado do servidor.
*   **Schema Único e Completo:** O arquivo [`supabase/schema.sql`](supabase/schema.sql) é 100% auto-contido e idempotente, provisionando todas as tabelas (investigação, OSINT e perfis parlamentares) em um único projeto Supabase.
*   **Scripts de ETL (Sincronização em Lote):**
    O projeto possui *pipelines* para baixar bases governamentais gigantes e popular o banco de dados. Eles ficam na pasta `scripts/etl/` (ex: `ibama-sync.ts`, `anac-sync.ts`, `cpgf-sync.ts`).
    *   **Como testar/rodar os ETLs localmente:**
        1. Certifique-se de que o seu `.env.local` possui as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
        2. Execute o script via *tsx* (que compila TypeScript on-the-fly). Exemplo:
           `npx tsx scripts/etl/ibama-sync.ts`
        3. **Atenção à Memória:** Nossos ETLs utilizam bibliotecas como `csv-parse` e `fs.createReadStream` para não estourar a memória (arquivos >100MB). Se for criar um novo ETL, evite carregar tudo em memória de uma vez (não use `.split('\n')`). Utilize `streams` e processe o envio para o Supabase em lotes (*batches*) de 500 a 1000 registros com `upsert`.
    *   **Cross-platform:** Para download de arquivos, use detecção de plataforma (`process.platform === 'win32'` → `curl.exe`, senão → `curl`) para garantir compatibilidade com os runners Ubuntu do GitHub Actions.

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
