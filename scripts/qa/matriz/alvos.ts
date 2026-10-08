/**
 * Alvos da matriz de alçadas: um político por cargo × UF, escolhidos para
 * exercitar cada caminho do pipe (e cada problema do diagnóstico de
 * 06/10/2026 — ver nota 29 do Obsidian).
 *
 * `consulta` é exatamente o que a rota /api/investigar recebe na URL.
 * Quando não há `ref`, a matriz faz a busca (modo A), escolhe o primeiro
 * candidato e roda a investigação com a ref dele (modo B), como a UI faz.
 */
export interface AlvoMatriz {
	id: string;
	descricao: string;
	alcada: "federal" | "estadual" | "municipal";
	consulta: { nome?: string; uf?: string; cargo?: string; ref?: string };
	/** O que se espera ver no nó PESSOA (campo `cargo`) quando o pipe acerta. */
	cargoEsperado: string;
	/** Problema do diagnóstico que este alvo exercita. */
	exercita: string;
}

export const ALVOS: AlvoMatriz[] = [
	{
		id: "dep-federal-mg",
		descricao: "Deputado federal (MG)",
		alcada: "federal",
		consulta: { nome: "Nikolas Ferreira", uf: "MG" },
		cargoEsperado: "Deputado Federal",
		exercita: "caminho principal; CPF da Câmara × TSE",
	},
	{
		id: "dep-federal-sp-tse-base",
		descricao: "Deputado federal (SP) com eleito e bens na nossa base",
		alcada: "federal",
		consulta: { ref: "FEDERAL:CAMARA:178992" },
		cargoEsperado: "Deputado Federal",
		exercita: "TSE lido das nossas bases (sem DivulgaCand ao vivo); patrimônio 2022 e 2026",
	},
	{
		id: "dep-federal-rs-gabinete",
		descricao: "Deputado federal (RS) com funcionários que doaram e um com mandato de vereador",
		alcada: "federal",
		consulta: { nome: "Marcon", uf: "RS" },
		cargoEsperado: "Deputado Federal",
		exercita: "gabinete × doadores da campanha, eleitos da UF e sócios de fornecedores (08/10/2026)",
	},
	{
		id: "senador-pr",
		descricao: "Senador (PR)",
		alcada: "federal",
		consulta: { nome: "Sergio Moro", uf: "PR" },
		cargoEsperado: "Senador da República",
		exercita: "CEAPS do Senado; CPF vindo só do TSE",
	},
	{
		id: "senador-rj",
		descricao: "Senador (RJ) com empresa declarada ao TSE",
		alcada: "federal",
		consulta: { nome: "Flávio Bolsonaro", uf: "RJ" },
		cargoEsperado: "Senador da República",
		exercita: "rota quebrava ao carregar o playwright (08/10/2026); bens com quotas sem nome de empresa",
	},
	{
		id: "presidente",
		descricao: "Presidente da República",
		alcada: "federal",
		consulta: { ref: "PRESIDENTE:BR:Luiz Inácio Lula da Silva" },
		cargoEsperado: "Presidente da República",
		exercita: "presidente recebia normas da cota da Câmara",
	},
	{
		id: "governador-sp",
		descricao: "Governador (SP)",
		alcada: "estadual",
		consulta: { nome: "Tarcísio de Freitas", uf: "SP" },
		cargoEsperado: "Governador",
		exercita: "governador sem nenhuma fonte estadual",
	},
	{
		id: "dep-estadual-sp",
		descricao: "Deputado estadual (SP / ALESP)",
		alcada: "estadual",
		consulta: { nome: "André do Prado", uf: "SP" },
		cargoEsperado: "Deputado Estadual",
		exercita: "XML de 164 MB da ALESP baixado ao vivo",
	},
	{
		id: "dep-estadual-rj",
		descricao: "Deputado estadual (RJ / ALERJ)",
		alcada: "estadual",
		consulta: { nome: "Rodrigo Bacellar", uf: "RJ" },
		cargoEsperado: "Deputado Estadual",
		exercita: "DOCIGP vira só mensagem",
	},
	{
		id: "dep-estadual-mg",
		descricao: "Deputado estadual (MG)",
		alcada: "estadual",
		consulta: { nome: "Ana Paula Siqueira", uf: "MG" },
		cargoEsperado: "Deputado Estadual",
		exercita: "ref ESTADUAL: sem tratamento (terminava em erro)",
	},
	{
		id: "dep-estadual-go",
		descricao: "Deputado estadual (GO)",
		alcada: "estadual",
		consulta: { nome: "Bruno Peixoto", uf: "GO" },
		cargoEsperado: "Deputado Estadual",
		exercita: "ref ESTADUAL: em UF sem integração estadual",
	},
	{
		id: "dep-estadual-pe",
		descricao: "Deputado estadual (PE)",
		alcada: "estadual",
		consulta: { nome: "Dani Portela", uf: "PE" },
		cargoEsperado: "Deputado Estadual",
		exercita: "gabinete pela API da ALEPE; contratos da Assembleia (08/10/2026)",
	},
	{
		id: "dep-distrital-df",
		descricao: "Deputado distrital (DF)",
		alcada: "estadual",
		consulta: { nome: "Fábio Felix", uf: "DF" },
		cargoEsperado: "Deputado Distrital",
		exercita: "contratos do governo do DF e da Câmara Legislativa (PNCP, 08/10/2026)",
	},
	{
		id: "prefeito-sp-capital",
		descricao: "Prefeito de São Paulo",
		alcada: "municipal",
		consulta: { nome: "Ricardo Nunes", uf: "SP", cargo: "PREFEITO" },
		cargoEsperado: "Prefeito",
		exercita: "prefeito de SP virava vereador (sem SICONFI/FNDE/SPU)",
	},
	{
		id: "prefeito-rj-capital",
		descricao: "Prefeito do Rio de Janeiro",
		alcada: "municipal",
		consulta: { nome: "Eduardo Paes", uf: "RJ", cargo: "PREFEITO" },
		cargoEsperado: "Prefeito",
		exercita: "prefeito do RJ virava vereador; TCE-RJ na capital (TCM-RJ)",
	},
	{
		id: "prefeito-niteroi",
		descricao: "Prefeito de Niterói (RJ)",
		alcada: "municipal",
		consulta: { nome: "Rodrigo Neves", uf: "RJ", cargo: "PREFEITO" },
		cargoEsperado: "Prefeito",
		exercita: "municipal do interior do RJ recebia dados da CMRJ",
	},
	{
		id: "prefeito-recife",
		descricao: "Prefeito do Recife (PE)",
		alcada: "municipal",
		consulta: { nome: "João Campos", uf: "PE", cargo: "PREFEITO" },
		cargoEsperado: "Prefeito",
		exercita: "TCE-PE devolve o município inteiro como despesa",
	},
	{
		id: "vereador-rio",
		descricao: "Vereador do Rio de Janeiro",
		alcada: "municipal",
		consulta: { nome: "Rafael Aloisio Freitas", uf: "RJ" },
		cargoEsperado: "Vereador Municipal",
		exercita: "CMRJ (cache no Supabase)",
	},
	{
		id: "prefeito-goiania",
		descricao: "Prefeito de Goiânia (GO — UF sem cobertura municipal)",
		alcada: "municipal",
		consulta: { nome: "Sandro Mabel", uf: "GO", cargo: "PREFEITO" },
		cargoEsperado: "Prefeito",
		exercita: "11 UFs não acham prefeito/vereador",
	},
	{
		id: "prefeito-goiania-como-tela",
		descricao: "Prefeito de Goiânia, sem cargo na URL (como a tela envia hoje)",
		alcada: "municipal",
		consulta: { nome: "Sandro Mabel", uf: "GO" },
		cargoEsperado: "Prefeito",
		exercita: "controlador.ts não envia o cargo; GO cai no roteador municipal vazio",
	},
	{
		id: "prefeito-cuiaba",
		descricao: "Prefeito de Cuiabá (MT — UF sem cobertura municipal)",
		alcada: "municipal",
		consulta: { nome: "Abilio Brunini", uf: "MT", cargo: "PREFEITO" },
		cargoEsperado: "Prefeito",
		exercita: "11 UFs não acham prefeito/vereador",
	},
];
