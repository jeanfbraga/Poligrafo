# 🕵️‍♂️ POLÍGRAFO

![GitHub License](https://img.shields.io/github/license/jeanfbraga/Poligrafo?style=flat-square&color=green)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)

> **Plataforma de auditoria cidadã (OSINT) e inteligência artificial para monitoramento e investigação do Congresso Nacional.**

O **Polígrafo** é uma aplicação web voltada para auditoria cidadã, jornalismo investigativo e análise de risco (OSINT). Com uma interface inspirada em terminais *hacker*, o sistema permite buscar por políticos (Deputados, Senadores, Vereadores) e cruzar automaticamente dados da Câmara, Senado, Tribunal Superior Eleitoral (TSE) e Controladoria-Geral da União (CGU).

Através da integração com IA (Gemini), o Polígrafo atua como um detetive de dados, identificando gastos com pontuação alta de "letalidade" (suspeitos) e exibindo laços com fornecedores inidôneos, expandindo dossiês societários através do *breakdown* de CNPJs (via BrasilAPI / ReceitaWS).

---

## 🔥 Funcionalidades Principais

*   **🔍 Busca Multi-Câmara**: Identifique imediatamente de onde é o parlamentar (Câmara dos Deputados vs. Senado Federal). Para vereadores, utilize o prefixo do estado (ex: `sp: eduardo`).
*   **⚠️ Alertas da CGU (Cadastro de Inidôneos)**: Verifica automaticamente se o político ou fornecedor possui registros de punições no CEIS/CNEP ou pelo Tribunal Superior Eleitoral.
*   **💸 Dossiê de Patrimônio**: Exibição centralizada dos bens declarados pelos políticos ao TSE.
*   **⚖️ IA de Julgamento de Despesas (Score de Letalidade)**: Integração com IA para classificar reembolsos (CEAP) do parlamentar, flagrando notas suspeitas de gráficas fantasmas, restaurantes de luxo ou serviços exorbitantes em vermelho (🔥).
*   **🔗 Malha Societária Dinâmica**: Clique em **"Aprofundar Investigação"** em qualquer despesa suspeita para quebrar o sigilo societário. A aplicação fará o *pivot* buscando a Razão Social, CNAE e Quadro de Sócios (QSA) via API, expandindo a rede na tela.
*   **🕷️ Grafo Investigativo Interativo (React Flow)**: Visualize todas as conexões em uma interface *drag-and-drop* no canvas, permitindo arrastar evidências suspeitas direto da Sandbox Lateral.
*   **📄 Exportação de Dossiês**: Gere relatórios consolidados das investigações em PDF, DOCX ou XLSX para uso off-line, reportagens ou documentação legal.

---

## 🛠️ Stack Tecnológico

*   **Frontend**: [Next.js](https://nextjs.org/) (React), [Tailwind CSS](https://tailwindcss.com/) (Styling), [Lucide-React](https://lucide.dev/) (Ícones).
*   **Visualização e Animação**: [@xyflow/react](https://reactflow.dev/), `cytoscape`, `graphology` (Grafos complexos), `recharts` (Gráficos), e `GSAP` (Animações).
*   **Estilização Avançada**: Terminal/OSINT UI, cores `green-500`, sombras neon e bordas afiadas (`rounded-none`).
*   **Backend / Serverless**: Next.js API Routes com Server-Sent Events (SSE) para *streaming* em tempo real.
    *   `app/api/investigar`: Núcleo de OSINT e IA.
    *   `app/api/dashboard`: Dados consolidados para dashboards.
    *   `app/api/exportar-dossie`: Geração de documentos (PDF, DOCX, XLSX).
*   **Banco de Dados**: [Supabase](https://supabase.com/) (PostgreSQL + Auth/Storage).
*   **Inteligência Artificial**: API do Google Gemini acionada pelo servidor.
*   **Analytics e Testes**: Microsoft Clarity, Vercel Analytics, e Playwright.
*   **APIs Governamentais Consumidas**:
    *   Dados Abertos da Câmara dos Deputados
    *   Dados Abertos do Senado Federal
    *   `DivulgaCand` do TSE
    *   Portal da Transparência da CGU
    *   `BrasilAPI` e `ReceitaWS` (Dossiês de CNPJ)

---

## 🚀 Como Executar Localmente

### Pré-requisitos
*   Node.js instalado (v18+).
*   Chave de API do **Google Gemini** ativa (para habilitar o scoring de IA e extração de QSA).
*   URL e Chaves do **Supabase** (para banco de dados e sincronização de cache).

### Passos

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
   Copie o arquivo de exemplo e adicione suas chaves:
   ```bash
   cp .env.example .env.local
   ```
   *Edite o arquivo `.env.local` adicionando suas credenciais do Gemini, Supabase, etc.*

4. **Inicie o Servidor de Desenvolvimento:**
   ```bash
   npm run dev
   ```

5. **Acesse no Navegador:**
   Abra `http://localhost:3000` e comece sua investigação.

### 🛠️ Scripts Utilitários
*   `npm run update:index`: Sincroniza/atualiza o índice de deputados e senadores em cache local.
*   `npm run sync:spu`: Sincroniza dados com o banco Supabase.

---

## 🌐 Deploy em Produção

O projeto está configurado e perfeitamente otimizado para deploy sem atrito na **Vercel**. 
Garantido que as Serverless Functions (`route.ts`) suportem streaming SSE ativando o suporte a Edge ou Streaming prolongado.

---

## 🤝 Como Contribuir

Como um projeto **Open Source** (Licença MIT), toda contribuição da comunidade investigativa e de desenvolvedores é muito bem-vinda!

Recomendamos fortemente a leitura dos nossos guias antes de enviar seu código:
*   [**Código de Conduta**](CODE_OF_CONDUCT.md): Diretrizes de convivência para a comunidade.
*   [**Guia de Contribuição**](CONTRIBUTING.md): Padrões de código, arquitetura e como submeter Pull Requests.
*   [**Política de Segurança**](SECURITY.md): Como relatar vulnerabilidades de forma responsável.

1. Faça um *Fork* do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaInovacao`)
3. Faça o commit de suas mudanças (`git commit -m 'feat: adicionando X'`)
4. Faça o push para a branch (`git push origin feature/MinhaInovacao`)
5. Abra um **Pull Request**

Temos templates pré-configurados para facilitar o envio de correções de bugs (Bug Reports) ou pedidos de novas funcionalidades (Feature Requests) lá na aba de *Issues* do GitHub.

---

## 👨‍💻 Autor

Desenvolvido e atualizado por **Jean Braga** como um experimento de Dados Abertos e Interação de UI.

> *Disclaimer: Esta aplicação utiliza dados 100% públicos e hospedados pelo Governo Federal Brasileiro através da Lei de Acesso à Informação (LAI). O objetivo é facilitar a visualização jornalística via tecnologia de redes.*
