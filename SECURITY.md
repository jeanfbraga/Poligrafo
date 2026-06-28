# Política de Segurança

## Versões Suportadas

Atualmente, apenas a versão mais recente na branch `main` recebe suporte para atualizações de segurança.

## Relatando uma Vulnerabilidade

Levamos a segurança a sério. Se você encontrar uma vulnerabilidade de segurança, siga as etapas abaixo:

1. **NÃO abra uma Issue pública.** Expor uma vulnerabilidade publicamente antes que possamos corrigi-la pode ser perigoso para as instâncias ativas do projeto.
2. Envie um e-mail com o relatório de vulnerabilidade para **jeanfelipe.design@gmail.com**.
3. Inclua todos os detalhes possíveis:
   - Como reproduzir o problema.
   - O impacto potencial.
   - Prova de conceito, se houver.

Entraremos em contato assim que possível para tratar a vulnerabilidade e lançar uma correção antes de publicar um CVE ou um aviso (advisory).

## Boas Práticas da Aplicação

- Nunca commite o arquivo `.env.local` ou qualquer credencial no repositório.
- Acesso direto ao Supabase (`SUPABASE_SERVICE_ROLE_KEY`) e demais chaves de API restritas devem sempre ser feitas no **lado do servidor** (`app/api` ou `scripts`).
- O proxy de imagens e dados sanitizados evitam *Server-Side Request Forgery (SSRF)*. Sempre valide domínios de *endpoints* governamentais antes de realizar extrações.
