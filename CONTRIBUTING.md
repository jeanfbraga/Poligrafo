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
5. Configure o banco — execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do seu projeto Supabase.
6. Inicie o ambiente de desenvolvimento (`npm run dev`).

## Arquitetura e Diretrizes de Código

Para uma referência completa da arquitetura, convenções, fluxo de investigação e protocolo de trabalho, consulte o [`AGENTS.md`](AGENTS.md).

Abaixo estão os pontos mais relevantes para contribuidores:

### 1. Motor de Inteligência Artificial em Cascata (AI Fallbacks)
Nosso sistema de IA de julgamento (Score de Letalidade) funciona em um esquema de cascata de 4 níveis para garantir resiliência e evitar custos abusivos:
*   **L1 (Groq - Llama 3 70B)**: Usado para triagem de alta velocidade e custo zero.
*   **L2 (OpenRouter)**: Fallback dinâmico caso a cota do Groq acabe.
*   **L3 (Google Gemini)**: Fallback secundário (Flash Lite, Flash, Gemma).
*   **L4 (Heurística Matemática)**: Classificação via RegEx se todas as APIs falharem.

> **Importante:** Se for alterar ou criar novos prompts de IA (arquivos em `src/app/api/investigar/ai_helpers.ts`), certifique-se de testar os prompts **em todos os níveis da cascata**. Modelos diferentes reagem de formas diferentes aos prompts de JSON estrito.

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
*   **Scripts de ETL (Sincronização em Lote):**
    O projeto possui *pipelines* para baixar bases governamentais gigantes e popular o banco de dados. Eles ficam na pasta `scripts/etl/` (ex: `ibama-sync.ts`, `anac-sync.ts`, `cpgf-sync.ts`).
    *   **Como testar/rodar os ETLs localmente:**
        1. Certifique-se de que o seu `.env.local` possui as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
        2. Execute o script via *tsx* (que compila TypeScript on-the-fly). Exemplo:
           `npx tsx scripts/etl/ibama-sync.ts`
        3. **Atenção à Memória:** Nossos ETLs utilizam bibliotecas como `csv-parse` e `fs.createReadStream` para não estourar a memória (arquivos >100MB). Se for criar um novo ETL, evite carregar tudo em memória de uma vez (não use `.split('\n')`). Utilize `streams` e processe o envio para o Supabase em lotes (*batches*) de 500 a 1000 registros com `upsert`.
    *   **Cross-platform:** Para download de arquivos, use detecção de plataforma (`process.platform === 'win32'` → `curl.exe`, senão → `curl`) para garantir compatibilidade com os runners Ubuntu do GitHub Actions.

### 5. Componentes e UI
*   Siga as convenções modernas do App Router do Next.js.
*   O Polígrafo usa um design focado em "Terminal/Hacker OSINT" (fundo escuro forçado, verde neon `green-500`, bordas retas, fonte mono). Mantenha esse padrão visual.
*   Componentes base em `src/components/ui/` seguem shadcn/ui — gere novos nesse padrão.

### 6. GitHub Actions e Automações
O projeto conta com 8 workflows automatizados (CEAP, CPGF, CMRJ, TSE Doadores, IBAMA, ANAC, SPU, CI). Todos usam Node 24 e podem ser disparados manualmente via `workflow_dispatch`. Ao criar novos workflows:
*   Use `actions/setup-node@v4` com `node-version: '24'` e **`cache: 'npm'`**.
*   **Sempre** utilize `npm ci` ao invés de `npm install` para garantir execuções consistentes e aderentes ao `package-lock.json`.
*   Nunca commite secrets — use `gh secret set` e referencie via `${{ secrets.NOME }}`.
*   Teste localmente com `npx tsx` antes de configurar o cron.

### 7. Arquivos Temporários e Sandbox
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
