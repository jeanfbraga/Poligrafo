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
    *   **L3 (Google Gemini)**: Fallback secundário.
    *   **L4 (Heurística Matemática)**: Classificação via RegEx e limites da Câmara, ativado caso as APIs falhem.
*   **⚠️ Alertas Judiciais e Fiscais**:
    *   **DataJud (CNJ)**: Busca automática por **Ações Civis de Improbidade Administrativa** ligadas ao político.
    *   **CGU (Cadastro de Inidôneos)**: Alertas sobre empresas punidas (CEIS/CNEP).
*   **💸 Dossiê de Patrimônio**: Exibição centralizada dos bens declarados ao TSE e varredura de sócios.
*   **🔗 Malha Societária Dinâmica**: Pivotamento societário automático (QSA) com 1 clique para rastrear donos de empresas suspeitas.
*   **🕷️ Grafo Investigativo Interativo (React Flow)**: Canvas visual *drag-and-drop* para mapeamento da rede de corrupção ou influência.
*   **📄 Exportação de Dossiês**: Geração de relatórios consolidados em PDF, DOCX ou XLSX para uso jornalístico ou legal.

---

## 🛠️ Stack Tecnológico

*   **Frontend**: [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/), [Lucide-React](https://lucide.dev/).
*   **Visualização e Animação**: [@xyflow/react](https://reactflow.dev/) (React Flow), `cytoscape`, `graphology`, `recharts` e `GSAP`.
*   **Estilização Avançada**: Terminal/OSINT UI, modo escuro forçado (`green-500`, sombras neon).
*   **Backend / Serverless**: API Routes com SSE (*Server-Sent Events*) em `app/api/investigar` para streaming de OSINT em tempo real.
*   **Banco de Dados**: [Supabase](https://supabase.com/) (PostgreSQL + Auth/Storage).
*   **Analytics e E2E**: Microsoft Clarity, Vercel Analytics, e Playwright.

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos e Chaves de API
Para rodar o ecossistema completo de IA e extração de dados, você precisará das seguintes chaves no seu `.env.local`:

| Chave de Ambiente | Serviço / Uso | Obrigatório? |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | Groq (Llama-3 70B) - Motor IA Primário (L1) | **Recomendado** |
| `OPENROUTER_API_KEY` | OpenRouter - Motor IA Secundário (L2) | Opcional |
| `GEMINI_API_KEY` | Google Gemini - Fallback IA (L3) | Opcional |
| `DATAJUD_API_KEY` | CNJ - Busca de Improbidade Administrativa | Opcional |
| `TRANSPARENCIA_API_KEY` | CGU - Alertas CEIS/CNEP em massa | Opcional |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase (Banco de Dados e Sync) | **Sim** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Supabase Público | **Sim** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Admin Role | Opcional |

*(Nota: O sistema foi desenhado para não quebrar. Se faltar a chave de IA, ele assume o Nível 4 de Heurística de RegEx para pontuar os gastos).*

### 2. Passos de Instalação

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

4. **Inicie o Servidor:**
   ```bash
   npm run dev
   ```

### 🛠️ Scripts Utilitários (ETLs)
*   `npm run update:index`: Sincroniza/atualiza o índice de parlamentares federais.
*   `npm run sync:spu`: Sincroniza dados com a nuvem Supabase.

---

## 🌐 Deploy em Produção

Projeto otimizado para deploy imediato na **Vercel**, com suporte configurado para Serverless Functions estendidas e Edge Runtime (para segurar as rotas de OSINT via SSE).

---

## 🤝 Como Contribuir

Toda contribuição da comunidade investigativa, de dados e desenvolvedores é essencial. O projeto tem Licença MIT e é código aberto.

Antes de enviar PRs, leia nossos guias:
*   [**Código de Conduta**](CODE_OF_CONDUCT.md): Diretrizes da comunidade.
*   [**Guia de Contribuição**](CONTRIBUTING.md): Padrões de código e fluxo de PR.
*   [**Política de Segurança**](SECURITY.md): Para relatórios de vulnerabilidades.

Temos templates pré-configurados em *Issues* para facilitar Bug Reports ou Feature Requests.

---

## 👨‍💻 Autor

Desenvolvido e mantido por **Jean Braga** como um esforço independente de dados abertos cívicos.

> *Disclaimer: Esta aplicação utiliza dados públicos amparados pela Lei de Acesso à Informação (LAI) do Governo Federal Brasileiro. Seu uso visa facilitar o jornalismo de dados e a auditoria social.*
