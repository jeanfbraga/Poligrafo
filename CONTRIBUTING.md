# Contribuindo para o Polígrafo

Obrigado por se interessar em contribuir para o Polígrafo! Como um projeto de código aberto voltado para a transparência pública, toda ajuda é bem-vinda, seja corrigindo bugs, adicionando fontes de dados (OSINT) ou melhorando a interface e os prompts de Inteligência Artificial.

## Como começar

1. **Faça um Fork** do repositório.
2. Crie uma branch para a sua modificação (`git checkout -b feature/minha-feature`).
3. Instale as dependências com `npm install`.
4. Copie `.env.example` para `.env.local` e configure as suas chaves de API necessárias para rodar o projeto localmente.
5. Inicie o ambiente de desenvolvimento (`npm run dev`).

## Diretrizes de Código

* **Next.js & React**: Siga as convenções modernas do App Router do Next.js.
* **Componentes**: Mantenha os componentes UI o mais desacoplados possível.
* **APIs de Terceiros**: Todo novo *fetch* externo deve conter tratamento de erro apropriado e `timeout` (para não derrubar as requisições serveless na Vercel).
* **Testes**: Se estiver adicionando uma funcionalidade crítica ou um motor OSINT novo, adicione ou atualize os testes no diretório `__tests__/`.

## Enviando as alterações

1. Faça o commit das suas modificações (`git commit -m "feat: adiciona nova fonte de dados XYZ"`).
2. Dê push para a sua branch (`git push origin feature/minha-feature`).
3. Abra um **Pull Request (PR)**.
4. Descreva claramente o que foi alterado e como os testes foram feitos.

Se tiver dúvidas ou quiser discutir uma nova funcionalidade grande antes de começar, sinta-se livre para abrir uma **Issue** no GitHub.
