import { NextResponse } from "next/server";

export async function GET() {
	const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://poligrafo.app";

	const content = `# Polígrafo — Inteligência Artificial & Auditoria Cidadã (OSINT)

> Plataforma aberta de inteligência de dados, OSINT e auditoria pública para monitoramento de agentes políticos brasileiros.

## Visão Geral
O **Polígrafo** cruza dados públicos de fontes oficiais (Câmara dos Deputados, Senado Federal, TSE, CGU, DataJud/CNJ, IBAMA, ANAC, SPU, BNDES, FNDE, TransfereGov e Diários Oficiais) e utiliza uma pipeline de IA em cascata (4 níveis) para classificar despesas públicas (CEAP, cotas, emendas PIX) e identificar notas suspeitas, empresas de fachada e conflitos de interesse.

## Principais Recursos & Endpoints de Consulta

- **Página Inicial & Dashboard**: ${baseUrl}/
  - Agregador de métricas nacionais, maiores gastadores da CEAP, assiduidade parlamentar e mapa de calor por estado.
  - Endpoint de dados brutos: \`${baseUrl}/api/dashboard/home\`

- **Dossiê de Perfil de Deputado**: ${baseUrl}/perfil/deputado/{id}
  - Parâmetros aceitos via Query String: \`nome\`, \`partido\`, \`uf\`, \`foto\`
  - Exemplo: \`${baseUrl}/perfil/deputado/204560?nome=Alexandre+Padilha&partido=PT&uf=SP\`
  - Dados exibidos: Cota parlamentar (CEAP) mês a mês, secretários de gabinete, assiduidade em sessões, histórico de votações nominais e proposições autorais.
  - Endpoint de dados brutos: \`${baseUrl}/api/perfil/deputado/{id}\`

- **Dossiê do Cartão Corporativo Presidencial (CPGF)**: ${baseUrl}/perfil/presidente/{id}
  - Perfis suportados: \`lula\`, \`bolsonaro\`
  - Exemplo: \`${baseUrl}/perfil/presidente/lula\`
  - Endpoint de dados brutos: \`${baseUrl}/api/perfil/presidente/{id}\`

- **Motor de Investigação SSE em Tempo Real**: ${baseUrl}/api/investigar?alvo={nome_ou_cpf}
  - Endpoint SSE (Server-Sent Events) que executa a malha OSINT e gera a rede de conexões em formato JSON.

## Fontes de Dados Públicas (LAI)
- **Câmara dos Deputados**: API Dados Abertos (v2) — CEAP, votações, frequência, proposições e gabinete.
- **Senado Federal**: Dados Abertos — Cota parlamentar e proposições.
- **TSE (Tribunal Superior Eleitoral)**: DivulgaCandContas — Bens declarados e doadores de campanha.
- **CGU (Portal da Transparência)**: Emendas PIX, CEIS/CNEP (empresas inidôneas) e CPGF.
- **DataJud (CNJ)**: Processos judiciais de Improbidade Administrativa.
- **IBAMA & ANAC**: Infrações ambientais e Registro Aeronáutico Brasileiro (RAB).
- **SPU (SEGES)**: Imóveis da União.

## Especificação Técnica
- **Arquitetura**: Next.js 16 (App Router), React 19, TypeScript strict.
- **Licença**: MIT (Código Aberto).
- **Sitemap XML**: ${baseUrl}/sitemap.xml
- **Robots.txt**: ${baseUrl}/robots.txt
`;

	return new NextResponse(content, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=86400, s-maxage=86400",
		},
	});
}
