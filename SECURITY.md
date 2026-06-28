# Política de Segurança

## Versões Suportadas

Atualmente, apenas a versão mais recente na branch `main` recebe suporte para atualizações de segurança.

## Relatando uma Vulnerabilidade

Levamos a segurança a sério. Se você encontrar uma vulnerabilidade de segurança, siga as etapas abaixo:

1. **NÃO abra uma Issue pública.** Expor uma vulnerabilidade publicamente antes que possamos corrigi-la pode ser perigoso para as instâncias ativas do projeto.
2. Acesse a aba **Security** (Segurança) deste repositório no GitHub.
3. Clique em **Advisories** e depois no botão **Report a Vulnerability** para abrir um canal de comunicação restrito conosco.
4. Descreva a falha com todos os detalhes possíveis (como reproduzir, impacto potencial e prova de conceito).

A equipe receberá um alerta privado e entrará em contato assim que possível para tratar a vulnerabilidade e lançar uma correção antes de publicar um CVE ou um aviso (advisory) público.

## Boas Práticas da Aplicação

- Nunca commite o arquivo `.env.local` ou qualquer credencial no repositório.
- Acesso direto ao Supabase (`SUPABASE_SERVICE_ROLE_KEY`) e demais chaves de API restritas devem sempre ser feitas no **lado do servidor** (`app/api` ou `scripts`).
- O proxy de imagens e dados sanitizados evitam *Server-Side Request Forgery (SSRF)*. Sempre valide domínios de *endpoints* governamentais antes de realizar extrações.
