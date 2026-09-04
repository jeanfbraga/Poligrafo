# 🕵️‍♂️ POLÍGRAFO

![GitHub License](https://img.shields.io/github/license/jeanfbraga/Poligrafo?style=flat-square&color=green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)

> **Plataforma de auditoria cidadã (OSINT) e inteligência artificial para monitoramento e investigação do Congresso Nacional.**

O **Polígrafo** é uma aplicação web voltada para auditoria cidadã, jornalismo investigativo e análise de risco (OSINT). Com uma interface inspirada em terminais *hacker*, o sistema permite buscar por políticos (Deputados, Senadores, Vereadores e Deputados Estaduais) e cruzar automaticamente dados de múltiplas fontes públicas: Câmara Federal, Senado, TSE, CGU, DataJud (CNJ) e Tribunais de Contas.

O coração do sistema é uma **Pipeline de Inteligência Artificial em Cascata (4 Níveis)** que atua como detetive de dados. Ela julga a "letalidade" de gastos com recursos públicos (CEAP, Cotas, Emendas) identificando notas frias, empresas fantasmas e conflito de interesses através de quebras societárias (via BrasilAPI / ReceitaWS).

---

## 🔥 Funcionalidades Principais

*   **🔍 Busca Multi-Esfera e Autocomplete Integrado**: Busca com sugestões em tempo real para o Congresso Nacional (Câmara e Senado), Presidência, Governos Estaduais, Assembleias (ALERJ, ALESP) e Câmaras Municipais (ex: CMA / Aracaju, CMRJ / Rio de Janeiro, CMSP / São Paulo), com badges visuais de órgão e partido.
*   **🏛️ Modelo de Dados Canônico Unificado**: Arquitetura escalável que unifica qualquer esfera pública em entidades normalizadas (`politicos`, `orgaos_publicos`, `mandatos`, `despesas_publicas`), permitindo cruzar fornecedores e empresas em qualquer município ou estado do Brasil.
*   **⚖️ IA de Julgamento em Cascata (Score de Letalidade / Custo $0,00)**: Classificação automatizada de despesas e emendas centralizada em `src/services/ai/ai-models-config.ts`:
    *   **L1 (Groq Developer Free Tier)**: `groq/compound`, `openai/gpt-oss-120b`, `qwen/qwen3.6-27b` (200 RPM / 200k TPM).
    *   **L2 (OpenRouter Free Tier)**: Roteador automático `openrouter/free` + modelos com sufixo `:free`.
    *   **L3 (Google Gemini & Gemma)**: `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-3.5-flash-lite`, `gemma-4-31b-it`.
    *   **L4 (Heurística Matemática Local)**: Classificação pericial offline via RegEx e análise estatística, caso nenhuma chave de IA esteja configurada.
*   **⚠️ Alertas Judiciais, Fiscais e Ambientais**:
    *   **DataJud (CNJ)**: Busca automática por **Ações Civis de Improbidade Administrativa** ligadas ao político.
    *   **CGU (Cadastro de Inidôneos)**: Alertas sobre empresas punidas (CEIS/CNEP).
    *   **IBAMA & ANAC**: Infrações ambientais e aeronaves registradas (RAB).
    *   **Tribunais de Contas (TCEs)**: Cruzamento de prestação de contas estaduais e municipais (TCE-SE, TCE-SP, TCE-SC, TCE-RJ...).
*   **💸 Dossiê de Patrimônio**: Exibição centralizada dos bens declarados ao TSE e varredura de sócios.
*   **🔗 Malha Societária Dinâmica**: Pivotamento societário automático (QSA) com 1 clique para rastrear donos de empresas suspeitas.
*   **🕷️ Grafo Investigativo Interativo (React Flow)**: Canvas visual *drag-and-drop* para mapeamento da rede de corrupção ou influência.
*   **📄 Exportação de Dossiês**: Geração de relatórios consolidados em PDF, DOCX ou XLSX para uso jornalístico ou legal.
*   **⚡ Arquitetura Cache-First**: O sistema salva e restaura grafos inteiros localmente (com bypass automático e TTL), aliviando rate-limits das APIs governamentais, e cruza dados com os ETLs locais executados em background via GitHub Actions (ex.: `despesas_publicas`, `ceap_despesas_cache`, `cgu_sancoes_cache`).

---

## 🛠️ Stack Tecnológico

*   **Frontend**: [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/), [Lucide-React](https://lucide.dev/).
*   **Visualização e Animação**: [@xyflow/react](https://reactflow.dev/) (React Flow), `cytoscape`, `graphology`, `recharts` e `GSAP`.
*   **Estilização Avançada**: Terminal/OSINT UI, modo escuro forçado (`green-500`, sombras neon).
*   **Backend / Serverless**: API Routes com SSE (*Server-Sent Events*) em `src/app/api/investigar` para streaming de OSINT em tempo real.
*   **Banco de Dados**: [Supabase](https://supabase.com/) (PostgreSQL + Auth/Storage).
*   **Analytics e E2E**: Microsoft Clarity, Vercel Analytics, e Playwright.

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos

*   **Node.js ≥ 24** (CI usa Node 24; rode `node -v` para verificar. Há um `.nvmrc` com a versão 24 para quem usa `nvm`).
*   **Conta no [Supabase](https://supabase.com/)** (plano gratuito funciona).
*   **`curl`, `tar` e `unzip`** disponíveis no shell — usados pelos ETLs para baixar e extrair os dados públicos (já presentes no Windows 10+, Linux e macOS).
*   **(Opcional) Playwright**: necessário apenas para os ETLs/scrapers que usam navegador headless (ex.: cotas da CMRJ). Após o `npm install`, rode:
    ```bash
    npx playwright install chromium
    ```

### 2. Chaves de API

Para rodar o ecossistema completo de IA e extração de dados, você precisará das seguintes chaves no seu `.env.local`:

| Chave de Ambiente | Serviço / Uso | Obrigatório? |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase (Banco de Dados e Sync) | **Sim** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Supabase Público | **Sim** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Admin Role (cache, ETL, dashboard) | **Sim (backend)** |
| `GROQ_API_KEY` | Groq Developer Free Tier (Compound / GPT-OSS 120B / Qwen) - Motor L1 | **Recomendado** |
| `OPENROUTER_API_KEY` | OpenRouter (Auto-Router `openrouter/free` e modelos `:free`) - Motor L2 | Opcional |
| `GEMINI_API_KEY` | Google AI Studio Free Tier (Gemini 2.5 / 2.0 / Gemma) - Motor L3 | Opcional |
| `DATAJUD_API_KEY` | CNJ - Busca de Improbidade Administrativa. Suporta chave crua ou com prefixo `APIKey ` | Opcional |
| `TRANSPARENCIA_API_KEY` | CGU - Alertas CEIS/CNEP e Emendas PIX | Opcional |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 — **desligado por padrão** | Opcional |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Microsoft Clarity — **desligado por padrão** | Opcional |

> **Nota:** O sistema foi desenhado para degradar graciosamente. Sem chaves de IA, ele usa o **Nível 4 (Heurística de RegEx)** para pontuar gastos. Sem o `SUPABASE_SERVICE_ROLE_KEY`, caching, dashboard e ETLs ficam indisponíveis — mas a investigação básica funciona via APIs externas.

> **Analytics:** GA e Clarity só são ativados se você preencher as variáveis acima. Se você fez fork ou deploy próprio, use os **seus** IDs de analytics — nunca os do autor. Com as variáveis vazias (padrão), nenhum script de analytics é carregado.

### 3. Passos de Instalação

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/jeanfbraga/Poligrafo.git
   cd Poligrafo
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as Variáveis de Ambiente:**
   ```bash
   cp .env.example .env.local
   ```
   *Edite `.env.local` adicionando suas chaves geradas.*

4. **Configure o Banco de Dados (Supabase):**

   Abra o **SQL Editor** do seu projeto Supabase e execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql). Esse script é completo e idempotente, criando todas as tabelas (investigação, OSINT, perfil de parlamentares e votações), views, funções RPC, políticas de segurança (RLS) e o storage bucket necessários.

   ```bash
   # Via SQL Editor do Supabase:
   # Cole e execute o conteúdo completo de supabase/schema.sql

   # Ou via CLI:
   supabase db reset --db-url "postgresql://postgres:[SUA_SENHA]@db.[SEU_REF].supabase.co:5432/postgres" < supabase/schema.sql
   ```

   > **💡 100% Plug & Play (Banco Único):** Um único projeto Supabase gratuito é tudo o que você precisa. O `schema.sql` já contém todas as tabelas necessárias para rodar a investigação e os perfis parlamentares.

5. **(Opcional) Popule os dados com ETLs:**

   Os ETLs extraem dados de fontes públicas e salvam no Supabase. Todos são independentes e podem ser executados em qualquer ordem:

   ```bash
    npx tsx scripts/etl/ceap-sync.ts             # Despesas CEAP (Câmara Federal)
    npx tsx scripts/etl/ceap-senado-sync.ts      # Despesas CEAP (Senado Federal)
    npm run sync:perfil                         # Perfil político, gabinete e resumo CEAP
    npm run sync:producao                       # Produção legislativa dos deputados
    npm run sync:votos                           # Votos nominais e votações (Dumps CSV + Delta API)
    npx tsx scripts/etl/frequencia-sync.ts       # Frequência em sessões
    npx tsx scripts/etl/votacoes-sync.ts         # Participação em votações
    npx tsx scripts/etl/emendas-pix-sync.ts      # Emendas PIX (requer TRANSPARENCIA_API_KEY)
    npx tsx scripts/etl/tse-sync-real.ts         # Bens declarados ao TSE
    npm run sync:tse-doadores                    # Doadores de Campanha do TSE (Bypass de WAF)
    npx tsx scripts/etl/fotos-sync.ts            # Fotos dos parlamentares
    npx tsx scripts/etl/ibama-sync.ts            # Infrações Ambientais (IBAMA)
    npx tsx scripts/etl/anac-sync.ts             # Aeronaves (ANAC RAB)
    npm run sync:spu                             # Imóveis da União (Automático via Raio-X SEGES)
    npx tsx scripts/etl/cpgf-sync.ts             # Cartão Corporativo Presidencial (CPGF)
    npx tsx scripts/etl/cgu-sancoes-sync.ts      # Sanções Administrativas e Ficha Limpa (CGU)
    npx tsx scripts/etl/sync-cmrj-servidores.ts  # Servidores CMRJ
    npx tsx scripts/etl/cmrj_cotas_etl.ts        # Cotas CMRJ (requer Playwright)
    ```

    > Os ETLs de IBAMA, ANAC, SPU, CPGF, TSE, CGU, CEAP, Votos e Senado rodam automaticamente via GitHub Actions (com workflows dedicados e timeouts otimizados), mas podem ser forçados localmente rodando seus respectivos scripts `scripts/etl/*.ts`. O sincronizador de votos (`npm run sync:votos`) aceita flags `--ano [ANO]` e `--todos` para processar a 57ª Legislatura completa via dumps colunares em streaming.

    As consultas JSON dos ETLs de perfil e produção da Câmara usam timeout e fallback HTTPS com `curl`. Após recuperar uma falha nativa, reutilizam `curl` por cinco minutos para evitar repetir o timeout em cada deputado. Indisponibilidade após as tentativas encerra o script com erro, sem tratá-la como lista vazia. Antes da carga, o workflow verifica a conexão; se ela falhar por rede, tenta uma única vez em outro runner, sem gravações na primeira tentativa. Falhas de HTTP, dados, instalação ou durante a carga continuam reprovando a execução. O workflow também enriquece os detalhes das proposições usando o mesmo banco de perfis.

    O CEAP valida colunas, valores, ano e quantidade mínima do CSV inteiro antes de substituir os registros da Câmara. A exclusão usa lotes de até 500 registros para respeitar o tempo limite do Supabase. Downloads/extrações têm quatro tentativas; o workflow tem limite de 60 minutos e impede execuções simultâneas. Qualquer ano ou lote com falha impede a atualização das views. A substituição dos registros ainda ocorre em lotes, sem transação entre a exclusão e a inserção; uma falha de banco durante a carga exige nova sincronização.

    Em bancos existentes, aplique [`scripts/sql/migracao_indice_ceap_sync.sql`](scripts/sql/migracao_indice_ceap_sync.sql) no banco principal antes da carga CEAP. O índice `(ano, casa, id)` permite selecionar e excluir os lotes sem varrer registros de outros anos; novas instalações já o recebem pelo `schema.sql`.

6. **Inicie o Servidor:**
   ```bash
   npm run dev
   ```

### 🛠️ Scripts Utilitários
*   `npm run update:index`: Sincroniza/atualiza o índice de parlamentares federais.
*   `npm run sync:spu`: Sincroniza dados de imóveis da União (SPU) com o Supabase. Totalmente automatizado via download do portal de dados abertos do SEGES.
*   `npm run test`: Roda os testes **unitários** (Vitest, em `__tests__/unit`) — não exige rede, Supabase nem servidor rodando.
*   `npm run test:integration`: Roda a suíte de **integração** (`__tests__/integration`, `__tests__/estados` e testes colocalizados em `src/`). Pré-requisitos: servidor rodando em `localhost:3000` (`npm run dev`), Supabase real populado e acesso à rede (alguns testes usam Playwright e scraping ao vivo).
*   `npm run test:all`: Lint + Type-check + Testes unitários.

---

## 🗄️ Arquitetura do Banco de Dados

O schema principal está em [`supabase/schema.sql`](supabase/schema.sql). O banco contém:

| Camada | Tabelas/Views | Propósito |
|:---|:---|:---|
| **Investigação** | `pesquisas`, `contagem_pesquisas` | Cache de grafos (Bypass de 24h TTL) e telemetria de uso |
| **CEAP** | `ceap_despesas_cache` + 4 views | Despesas parlamentares federais (Câmara e Senado) |
| **TSE** | `tse_bens_historico`, `tse_doadores_cache` | Patrimônio e doadores de campanha |
| **Emendas** | `emendas_pix` + 2 views | Emendas PIX (Transferências Especiais) |
| **Sanções (CGU)**| `cgu_sancoes_cache` | Sanções Administrativas e Pessoas Politicamente Expostas |
| **CMRJ** | `cmrj_despesas`, `cmrj_vereador_gabinete`, `cmrj_servidores` | Câmara Municipal do Rio de Janeiro |
| **Câmara Federal** | `camara_frequencia`, `camara_votacoes` | Presença e votações |
| **CPGF** | `cpgf_despesas_cache` | Cartão Corporativo Presidencial (Lula, Bolsonaro, Dilma, Temer) |
| **OSINT** | `ibama_infracoes`, `anac_rab`, `spu_imoveis` | Infrações ambientais, aeronaves, imóveis |
| **Storage** | `fotos-politicos` (bucket) | Fotos oficiais dos parlamentares |

**Módulo de Perfil de Deputados** (tabelas adicionais — mesmo banco para contribuidores):

| Tabela | Conteúdo |
|:---|:---|
| `camara_perfil_politico_cache` | Dados cadastrais: nome civil, partido, UF, foto, comissões, frentes, profissões |
| `camara_votos_detalhados` | Histórico de votos por votação (sim, não, abstenção, obstrução) |
| `camara_producao_legislativa` | Proposições autorais do parlamentar |
| `camara_cota_resumo_cache` | Gasto CEAP mensal agregado (PK: `deputado_id, ano_referencia, mes_referencia`) |
| `camara_gabinete_servidores` | Servidores de gabinete (nome, função, data de admissão) |

> Essas tabelas são populadas pelo ETL `scripts/etl/perfil-politico-sync.ts` e servem a rota `/perfil/deputado/[id]`. A instância de produção as armazena em um segundo Supabase (workaround de storage), mas contribuidores podem usá-las no banco principal sem nenhuma alteração de configuração.

---

## 🌐 Deploy em Produção

Projeto otimizado para deploy imediato na **Vercel**, com suporte configurado para Serverless Functions estendidas e Edge Runtime (para segurar as rotas de OSINT via SSE).

---

## 🤝 Como Contribuir

Toda contribuição da comunidade investigativa, de dados e desenvolvedores é essencial. O projeto tem Licença MIT e é código aberto.

Antes de enviar PRs, leia nossos guias:
*   [**Código de Conduta**](CODE_OF_CONDUCT.md): Diretrizes da comunidade.
*   [**Guia de Contribuição**](CONTRIBUTING.md): Padrões de código e fluxo de PR.
*   [**Guia para Agentes de IA**](AGENTS.md): Referência de arquitetura, convenções e protocolo de trabalho para agentes de código.
*   [**Política de Segurança**](SECURITY.md): Para relatórios de vulnerabilidades.

## 💬 Comunidade e Suporte

A comunidade é o coração do projeto. Se você encontrou um erro, tem uma ideia genial, ou quer discutir dados abertos cívicos:

- 🐛 **Encontrou um erro ou quer sugerir algo?** [Abra uma Issue](https://github.com/jeanfbraga/Poligrafo/issues/new/choose) utilizando nossos templates estruturados.
- ❓ **Dúvidas, Ajuda e Discussões em geral:** Acesse nosso fórum no [GitHub Discussions](https://github.com/jeanfbraga/Poligrafo/discussions).

---

## 👨‍💻 Autor

Desenvolvido e mantido por **Jean Braga** como um esforço independente de dados abertos cívicos.

> *Disclaimer: Esta aplicação utiliza dados públicos amparados pela Lei de Acesso à Informação (LAI) do Governo Federal Brasileiro. Seu uso visa facilitar o jornalismo de dados e a auditoria social.*
