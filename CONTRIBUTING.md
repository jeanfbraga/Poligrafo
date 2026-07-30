# Contribuindo para o Polígrafo

Obrigado por se interessar em contribuir para o Polígrafo! Como um projeto de código aberto voltado para a transparência pública, toda ajuda é bem-vinda, seja corrigindo bugs, adicionando fontes de dados (OSINT) ou melhorando a interface e os prompts de Inteligência Artificial.

## Como começar

1. **Faça um Fork** do repositório.
2. Crie uma branch para a sua modificação (`git checkout -b feature/minha-feature`).
3. Instale as dependências com `npm install`.
4. Copie `.env.example` para `.env.local` e configure as suas chaves de API necessárias para rodar o projeto localmente (ex: Supabase, Groq, OpenRouter, DataJud, CGU).
5. Inicie o ambiente de desenvolvimento (`npm run dev`).

## Arquitetura e Diretrizes de Código

Para garantir que a base do projeto permaneça coesa e que o motor de OSINT continue robusto, pedimos que siga os seguintes padrões arquiteturais:

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
*   Todo novo *fetch* externo deve usar a função de utilidade `fetchWithTimeout` para evitar travar as requisições *serverless* da Vercel.
*   Mantenha a segurança e higienize os dados contra injestão maliciosa.

### 3. Integração com Banco de Dados (Supabase) e ETLs
*   **Acesso Seguro:** Operações críticas (gravação de alertas, sincronização massiva) devem ser feitas usando a `SUPABASE_SERVICE_ROLE_KEY` exclusivamente do lado do servidor.
*   **Scripts de ETL (Sincronização em Lote):**
    O projeto possui *pipelines* para baixar bases governamentais gigantes e popular o banco de dados. Eles ficam na pasta `scripts/etl/` (ex: `ibama-sync.ts`, `anac-sync.ts`, `spu-sync.ts`).
    *   **Como testar/rodar os ETLs localmente:**
        1. Certifique-se de que o seu `.env.local` possui as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
        2. Execute o script via *tsx* (que compila TypeScript on-the-fly). Exemplo:
           `npx tsx scripts/etl/ibama-sync.ts`
        3. **Atenção à Memória:** Nossos ETLs utilizam bibliotecas como `csv-parse` e `fs.createReadStream` para não estourar a memória (arquivos >100MB). Se for criar um novo ETL, evite carregar tudo em memória de uma vez (não use `.split('\n')`). Utilize `streams` e processe o envio para o Supabase em lotes (*batches*) de 500 a 1000 registros com `upsert`.

### 4. Componentes e UI
*   Siga as convenções modernas do App Router do Next.js.
*   O Polígrafo usa um design focado em "Terminal/Hacker OSINT" (fundo escuro forçado, verde neon `green-500`, bordas retas). Mantenha esse padrão visual.

## Testes

Se estiver adicionando uma funcionalidade crítica, alterando lógicas financeiras ou inserindo um novo motor OSINT, **adicione ou atualize os testes** no diretório `__tests__/`. O projeto usa `Vitest` (execute com `npm run test`).

## Enviando as alterações

1. Faça o commit das suas modificações (`git commit -m "feat: adiciona nova fonte de dados XYZ"`).
2. Dê push para a sua branch (`git push origin feature/minha-feature`).
3. Abra um **Pull Request (PR)**.
4. Descreva claramente o que foi alterado e como os testes foram feitos.

Se tiver dúvidas ou quiser discutir uma funcionalidade grande antes de começar, sinta-se livre para abrir uma **Issue** no GitHub.
