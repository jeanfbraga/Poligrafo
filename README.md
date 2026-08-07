# 🕵️‍♂️ POLÍGRAFO

![GitHub License](https://img.shields.io/github/license/jeanfbraga/Poligrafo?style=flat-square&color=green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)

> **Plataforma de auditoria cidadã (OSINT) e inteligência artificial para monitoramento e investigação do Congresso Nacional.**

O **Polígrafo** é uma aplicação web voltada para auditoria cidadã, jornalismo investigativo e análise de risco (OSINT). Com uma interface inspirada em terminais *hacker*, o sistema permite buscar por políticos (Deputados, Senadores, Vereadores e Deputados Estaduais) e cruzar automaticamente dados de múltiplas fontes públicas: Câmara Federal, Senado, TSE, CGU, DataJud (CNJ) e Tribunais de Contas.

O coração do sistema é uma **Pipeline de Inteligência Artificial em Cascata (4 Níveis)** que atua como detetive de dados. Ela julga a "letalidade" de gastos com recursos públicos (CEAP, Cotas, Emendas) identificando notas frias, empresas fantasmas e conflito de interesses através de quebras societárias (via BrasilAPI / ReceitaWS).

---

## 🔥 Funcionalidades Principais

*   **🔍 Busca Multi-Câmara e Regional**: Busca automatizada em diversas esferas legislativas (Câmara, Senado, ALERJ, CMRJ) e verificação cruzada com Tribunais de Contas (TCE-SP, TCE-SC).
*   **⚖️ IA de Julgamento em Cascata (Score de Letalidade)**: Classificação automatizada de despesas através de um motor resiliente:
    *   **L1 (Groq - Llama 3 70B)**: Engine principal ultra-rápida.
    *   **L2 (OpenRouter)**: Fallback dinâmico (Gemma, DeepSeek).
    *   **L3 (Google Gemini)**: Fallback secundário (Flash Lite, Flash, Gemma).
    *   **L4 (Heurística Matemática)**: Classificação via RegEx e limites da Câmara, ativado caso as APIs falhem.
*   **⚠️ Alertas Judiciais e Fiscais**:
    *   **DataJud (CNJ)**: Busca automática por **Ações Civis de Improbidade Administrativa** ligadas ao político.
    *   **CGU (Cadastro de Inidôneos)**: Alertas sobre empresas punidas (CEIS/CNEP).
*   **💸 Dossiê de Patrimônio**: Exibição centralizada dos bens declarados ao TSE e varredura de sócios.
*   **🔗 Malha Societária Dinâmica**: Pivotamento societário automático (QSA) com 1 clique para rastrear donos de empresas suspeitas.
*   **🕷️ Grafo Investigativo Interativo (React Flow)**: Canvas visual *drag-and-drop* para mapeamento da rede de corrupção ou influência.
*   **📄 Exportação de Dossiês**: Geração de relatórios consolidados em PDF, DOCX ou XLSX para uso jornalístico ou legal.
*   **⚡ Arquitetura Cache-First**: O sistema salva e restaura grafos inteiros localmente (com bypass automático e TTL), aliviando rate-limits das APIs governamentais, e cruza dados com os ETLs locais executados em background via GitHub Actions (ex.: `ceap_despesas_cache`, `cgu_sancoes_cache`).

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
| `GROQ_API_KEY` | Groq (Llama-3 70B) - Motor IA Primário (L1) | **Recomendado** |
| `OPENROUTER_API_KEY` | OpenRouter - Motor IA Secundário (L2) | Opcional |
| `GEMINI_API_KEY` | Google Gemini - Fallback IA (L3) | Opcional |
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

   Abra o **SQL Editor** do seu projeto Supabase e execute o conteúdo dos arquivos de schema. Esses scripts criam todas as tabelas, views, funções RPC, políticas de segurança (RLS) e o storage bucket necessários.

   **Banco principal** (investigação, OSINT, dashboard):
   ```bash
   # Via SQL Editor do Supabase:
   # Cole e execute o conteúdo de supabase/schema.sql

   # Ou via CLI:
   supabase db reset --db-url "postgresql://postgres:[SUA_SENHA]@db.[SEU_REF].supabase.co:5432/postgres" < supabase/schema.sql
   ```

   **Módulo de Perfil de Deputados** (`/perfil/deputado/[id]`) — tabelas: `camara_perfil_politico_cache`, `camara_votos_detalhados`, `camara_producao_legislativa`, `camara_cota_resumo_cache`, `camara_gabinete_servidores`:

   > **Contribuidores:** Crie essas tabelas **no mesmo banco** acima. Um único projeto Supabase é suficiente.
   >
   > **Nota do mantenedor:** A instância de produção usa um **segundo projeto Supabase** exclusivo para o módulo de Perfis — workaround pelo limite de 500 MB de armazenamento do plano gratuito. Para contribuidores com um banco limpo, essa separação é desnecessária.

   O schema deste módulo está em [`supabase/schema-perfil.sql`](supabase/schema-perfil.sql) *(a criar — por enquanto, consulte a [documentação do projeto](Obsidian%20Poligrafo%20Docs/ADR%20%E2%80%94%20Schema%20do%20Banco%20Publicado.md) para o DDL completo)*.

5. **(Opcional) Popule os dados com ETLs:**

   Os ETLs extraem dados de fontes públicas e salvam no Supabase. Todos são independentes e podem ser executados em qualquer ordem:

   ```bash
   npx tsx scripts/etl/ceap-sync.ts             # Despesas CEAP (Câmara Federal)
   npx tsx scripts/etl/ceap-senado-sync.ts      # Despesas CEAP (Senado Federal)
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

   > Os ETLs de IBAMA, ANAC, SPU, CPGF, TSE, CGU, CEAP e Senado rodam automaticamente via GitHub Actions, mas podem ser forçados localmente rodando seus respectivos scripts `scripts/etl/*.ts`.

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

Temos templates pré-configurados em *Issues* para facilitar Bug Reports ou Feature Requests.

---

## 👨‍💻 Autor

Desenvolvido e mantido por **Jean Braga** como um esforço independente de dados abertos cívicos.

> *Disclaimer: Esta aplicação utiliza dados públicos amparados pela Lei de Acesso à Informação (LAI) do Governo Federal Brasileiro. Seu uso visa facilitar o jornalismo de dados e a auditoria social.*
