# 🕵️‍♂️ POLÍGRAFO

![Polígrafo](https://github.com/jeanfbraga/Poligrafo/assets/your-actual-header-image.png) <!-- Update with actual screenshot or logo -->

> **Investigação OSINT de Dados Públicos e Cruzamento de Indícios de Irregularidades.**

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

---

## 🛠️ Stack Tecnológico

*   **Frontend**: [Next.js](https://nextjs.org/) (React), [Tailwind CSS](https://tailwindcss.com/) (Styling), [Lucide-React](https://lucide.dev/) (Ícones).
*   **Grafo e Visualização**: [@xyflow/react](https://reactflow.dev/) (Diagramação interativa de redes).
*   **Estilização Avançada**: Terminal/OSINT UI, cores `green-500`, sombras neon e bordas afiadas (`rounded-none`).
*   **Backend / Serverless**: Next.js API Routes (`app/api/investigar`) usando Server-Sent Events (SSE) para *streaming* em tempo real das descobertas no painel frontal.
*   **Inteligência Artificial**: API do Google Gemini (`@google/genai`) acionada pelo servidor.
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
   Crie um arquivo `.env.local` na raiz do projeto e adicione sua chave de API:
   ```env
   GEMINI_API_KEY=sua-chave-aqui-das-apis-do-google
   # Opcional (se você tiver chave da CGU para expandir os radares):
   TRANSPARENCIA_API_KEY=sua-chave-cgu
   ```

4. **Inicie o Servidor de Desenvolvimento:**
   ```bash
   npm run dev
   ```

5. **Acesse no Navegador:**
   Abra `http://localhost:3000` e comece sua investigação.

---

## 🌐 Deploy em Produção

O projeto está configurado e perfeitamente otimizado para deploy sem atrito na **Vercel**. 
Garantido que as Serverless Functions (`route.ts`) suportem streaming SSE ativando o suporte a Edge ou Streaming prolongado.

---

## 👨‍💻 Autor

Desenvolvido e atualizado por **Jean Braga** como um experimento de Dados Abertos e Interação de UI.

> *Disclaimer: Esta aplicação utiliza dados 100% públicos e hospedados pelo Governo Federal Brasileiro através da Lei de Acesso à Informação (LAI). O objetivo é facilitar a visualização jornalística via tecnologia de redes.*
