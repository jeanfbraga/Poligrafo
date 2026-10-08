/**
 * Sondas do canário de fontes: uma consulta conhecida por endpoint que o
 * Polígrafo usa (ou vai usar). Também prova os pontos do diagnóstico de
 * 06/10/2026 (PNCP ignora `cnpjFornecedor`, `/sancoes` inexistente,
 * DataJud sem partes). Ver nota 29 do Obsidian.
 *
 * Referência: scripts/canary_sources.py e data/*\/constants.py do mcp-brasil.
 */
import { buscarFonte, classificarErroFonte } from "../../../src/lib/fonte-http";
import {
	avaliarEndpointSuspeito,
	avaliarFiltroFornecedor,
	avaliarLista,
	avaliarPartesDataJud,
	avaliarBuscaPncp,
	extrairLista,
	paginaAntirrobo,
} from "./avaliacoes";
import type { ContextoSonda, Sonda, Veredito } from "./tipos";

/** CNPJ público de referência (Petrobras), grande fornecedor de governo. */
const CNPJ_REF = "33000167000101";
/** CNPJ da Prefeitura de São Paulo (órgão contratante no PNCP). */
const CNPJ_PREF_SP = "46395000000139";
const TRANSPARENCIA = "https://api.portaldatransparencia.gov.br/api-de-dados";

const anoAtual = new Date().getFullYear();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const compacta = (d: Date) => iso(d).replace(/-/g, "");
const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);

type Avaliar = (corpo: unknown, res: Response) => Veredito;

interface OpcoesGet {
	headers?: Record<string, string>;
	metodo?: string;
	corpo?: string;
	avaliar?: Avaliar;
	/** Só confere o status (não lê o corpo; útil para arquivos grandes). */
	soStatus?: boolean;
}

async function lerCorpo(res: Response): Promise<unknown> {
	const texto = await res.text();
	try {
		return JSON.parse(texto);
	} catch {
		return texto;
	}
}

function vereditoStatus(res: Response): Veredito {
	const tamanho = res.headers.get("content-length");
	const extra = tamanho ? `, ${(Number(tamanho) / 1_048_576).toFixed(1)} MB` : "";
	return res.ok
		? { estado: "OK", detalhe: `HTTP ${res.status}${extra}` }
		: { estado: "FALHA", detalhe: `HTTP ${res.status}` };
}

function get(url: string, opcoes: OpcoesGet = {}) {
	return async (ctx: ContextoSonda): Promise<Veredito> => {
		try {
			const res = await buscarFonte(url, {
				method: opcoes.metodo ?? "GET",
				headers: opcoes.headers,
				body: opcoes.corpo,
				navegador: true,
				tentativas: 2,
				timeoutMs: ctx.timeoutMs,
			});
			if (opcoes.soStatus) {
				await res.body?.cancel().catch(() => undefined);
				return vereditoStatus(res);
			}
			const corpo = await lerCorpo(res);
			if (!res.ok && !opcoes.avaliar) return { estado: "FALHA", detalhe: `HTTP ${res.status}` };
			return (opcoes.avaliar ?? ((c) => avaliarLista(c)))(corpo, res);
		} catch (erro) {
			return { estado: "FALHA", detalhe: `${classificarErroFonte(erro)}: ${(erro as Error).message}` };
		}
	};
}

const pulada = (motivo: string): Veredito => ({ estado: "PULADA", detalhe: motivo });

function transparencia(caminho: string, avaliar?: Avaliar) {
	return async (ctx: ContextoSonda) => {
		const chave = ctx.env.TRANSPARENCIA_API_KEY;
		if (!chave) return pulada("sem TRANSPARENCIA_API_KEY");
		return get(`${TRANSPARENCIA}${caminho}`, {
			headers: { "chave-api-dados": chave },
			avaliar: avaliar ?? ((c, res) => (res.ok && Array.isArray(c)
				? { estado: "OK", detalhe: `HTTP ${res.status}, ${c.length} registro(s)` }
				: { estado: "FALHA", detalhe: `HTTP ${res.status}` })),
		})(ctx);
	};
}

const statusOk: Avaliar = (_c, res) => vereditoStatus(res);

function sonda(
	id: string,
	alcada: Sonda["alcada"],
	fonte: string,
	usadaEm: string,
	executar: Sonda["executar"],
	critica = false,
): Sonda {
	return { id, alcada, fonte, usadaEm, executar, critica };
}

// ─── Federal ────────────────────────────────────────────────────────────────

const federais: Sonda[] = [
	sonda("camara-deputados", "federal", "Câmara — deputados", "busca, perfil", get(
		"https://dadosabertos.camara.leg.br/api/v2/deputados?itens=5",
	), true),
	sonda("camara-despesas", "federal", "Câmara — CEAP ao vivo", "etl_extractors (plano B do cache)", async (ctx) => {
		const lista = await get("https://dadosabertos.camara.leg.br/api/v2/deputados?itens=1", {
			avaliar: (c) => ({ estado: "OK", detalhe: String((extrairLista(c)[0] as { id?: number })?.id ?? "") }),
		})(ctx);
		if (!lista.detalhe) return { estado: "FALHA", detalhe: "sem deputado para testar" };
		return get(`https://dadosabertos.camara.leg.br/api/v2/deputados/${lista.detalhe}/despesas?itens=5&ordenarPor=ano&ordem=DESC`, {
			avaliar: (c, res) => (res.ok ? { estado: "OK", detalhe: `${extrairLista(c).length} despesa(s)` } : { estado: "FALHA", detalhe: `HTTP ${res.status}` }),
		})(ctx);
	}),
	sonda("senado-lista", "federal", "Senado — senadores em exercício", "busca", get(
		"https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json",
		{ avaliar: (c, res) => (res.ok && JSON.stringify(c).includes("Parlamentar") ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status} ou formato inesperado` }) },
	), true),
	sonda("senado-ceaps", "federal", "Senado — CEAPS (CSV)", "etl_extractors, ETL ceap-senado", get(
		`https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/${anoAtual}/csv`,
		{ soStatus: true },
	)),
	sonda("cgu-ceis", "federal", "CGU — CEIS (codigoSancionado)", "sanções da pessoa", transparencia(
		`/ceis?codigoSancionado=${CNPJ_REF}&pagina=1`,
	), true),
	sonda("cgu-cnep", "federal", "CGU — CNEP (codigoSancionado)", "sanções da pessoa", transparencia(
		`/cnep?codigoSancionado=${CNPJ_REF}&pagina=1`,
	)),
	sonda("cgu-cepim", "federal", "CGU — CEPIM (cnpjSancionado)", "sanções de empresa (Fase 1)", transparencia(
		`/cepim?cnpjSancionado=${CNPJ_REF}&pagina=1`,
	)),
	sonda("cgu-sancoes-suspeito", "federal", "CGU — /sancoes (suspeito)", "osint-societario, proxy_osint, cnpj/route", async (ctx) => {
		const chave = ctx.env.TRANSPARENCIA_API_KEY;
		if (!chave) return pulada("sem TRANSPARENCIA_API_KEY");
		return get(`${TRANSPARENCIA}/sancoes?cnpjSancionado=${CNPJ_REF}&pagina=1`, {
			headers: { "chave-api-dados": chave },
			avaliar: (_c, res) => avaliarEndpointSuspeito(res.status),
		})(ctx);
	}),
	sonda("cgu-peps", "federal", "CGU — PEP", "sanções da pessoa", transparencia("/peps?nome=SILVA&pagina=1")),
	sonda("cgu-emendas", "federal", "CGU — emendas", "emendas por autor", transparencia(
		`/emendas?ano=${anoAtual - 1}&pagina=1`,
	), true),
	sonda("cgu-contratos-fornecedor", "federal", "CGU — contratos por CPF/CNPJ", "PNCP por fornecedor (Fase 1)", transparencia(
		`/contratos/cpf-cnpj?cpfCnpj=${CNPJ_REF}&pagina=1`,
	)),
	sonda("cgu-pessoas-juridicas", "federal", "CGU — vínculos de CNPJ", "Fase 4 (federal)", transparencia(
		`/pessoas-juridicas?cnpj=${CNPJ_REF}&pagina=1`,
		(c, res) => (res.ok && c ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }),
	)),
	sonda("pncp-fornecedor-filtro", "federal", "PNCP — contratos ?cnpjFornecedor", "pncp/client (licitações, contratos-beneficiário)", get(
		`https://pncp.gov.br/api/consulta/v1/contratos?cnpjFornecedor=${CNPJ_REF}&dataInicial=${compacta(diasAtras(60))}&dataFinal=${compacta(new Date())}&pagina=1&tamanhoPagina=20`,
		{ avaliar: (c) => avaliarFiltroFornecedor(extrairLista(c) as Record<string, unknown>[], CNPJ_REF) },
	)),
	sonda("pncp-orgao-filtro", "municipal", "PNCP — contratos ?cnpjOrgao", "contratos da prefeitura/governo (Fase 4)", get(
		`https://pncp.gov.br/api/consulta/v1/contratos?cnpjOrgao=${CNPJ_PREF_SP}&dataInicial=${compacta(diasAtras(60))}&dataFinal=${compacta(new Date())}&pagina=1&tamanhoPagina=20`,
		{
			avaliar: (c) => {
				const itens = extrairLista(c) as { orgaoEntidade?: { cnpj?: string } }[];
				const fora = itens.filter((i) => i.orgaoEntidade?.cnpj !== CNPJ_PREF_SP).length;
				if (itens.length === 0) return { estado: "OK", detalhe: "nenhum contrato no período" };
				return fora === 0
					? { estado: "OK", detalhe: `${itens.length} contrato(s), todos do órgão consultado` }
					: { estado: "ALERTA", detalhe: `filtro ignorado: ${fora} de ${itens.length} de outros órgãos` };
			},
		},
	)),
	sonda("pncp-fornecedores", "federal", "PNCP — /v1/fornecedores", "PNCP por fornecedor (Fase 1)", get(
		`https://pncp.gov.br/api/consulta/v1/fornecedores?cnpj=${CNPJ_REF}`,
		{ avaliar: (_c, res) => avaliarEndpointSuspeito(res.status) },
	)),
	sonda("pncp-busca-texto", "federal", "PNCP — busca textual", "PNCP por razão social (Fase 1)", get(
		"https://pncp.gov.br/api/search/?q=petroleo%20brasileiro&tipos_documento=contrato&pagina=1&tam_pagina=5",
		{ avaliar: (c) => avaliarBuscaPncp(c) },
	)),
	sonda("compras-contratos-fornecedor", "federal", "Compras.gov — contratos ?niFornecedor", "PNCP por fornecedor (Fase 1)", get(
		`https://dadosabertos.compras.gov.br/modulo-contratos/1_consultarContratos?pagina=1&tamanhoPagina=10&niFornecedor=${CNPJ_REF}&dataVigenciaInicialMin=${iso(diasAtras(730))}&dataVigenciaInicialMax=${iso(new Date())}`,
		{
			avaliar: (c, res) => (res.ok
				? avaliarFiltroFornecedor(extrairLista(c) as Record<string, unknown>[], CNPJ_REF)
				: avaliarEndpointSuspeito(res.status)),
		},
	)),
	sonda("compras-legado", "federal", "compras.dados.gov.br (legado)", "osint-fiscal, osint-societario, cnpj/route, socio", get(
		`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${CNPJ_REF}`,
		{ avaliar: (_c, res) => avaliarEndpointSuspeito(res.status) },
	)),
	sonda("datajud-partes", "federal", "DataJud — campo partes", "judiciario (busca por CPF)", async (ctx) => {
		const chave = ctx.env.DATAJUD_API_KEY;
		if (!chave) return pulada("sem DATAJUD_API_KEY");
		return get("https://api-publica.datajud.cnj.jus.br/api_publica_tjac/_search", {
			metodo: "POST",
			headers: {
				Authorization: chave.startsWith("APIKey ") ? chave : `APIKey ${chave}`,
				"Content-Type": "application/json",
			},
			corpo: JSON.stringify({ size: 2, query: { match_all: {} } }),
			avaliar: (c, res) => (res.ok
				? avaliarPartesDataJud(((c as { hits?: { hits?: [] } })?.hits?.hits) ?? [])
				: { estado: "FALHA", detalhe: `HTTP ${res.status}` }),
		})(ctx);
	}),
	sonda("tcu-certidao", "federal", "TCU — certidão consolidada", "certidão de empresas", get(
		`https://certidoes-apf.apps.tcu.gov.br/api/rest/publico/certidoes/${CNPJ_REF}`,
		{ avaliar: statusOk },
	)),
	sonda("tcu-inabilitados-atual", "federal", "TCU — inabilitados (host usado)", "tcu/client.ts", get(
		"https://dados-abertos.apps.tcu.gov.br/api/condenacao/consulta/inabilitados/12345678909",
		{ avaliar: (c, res) => (paginaAntirrobo(c) ? { estado: "ALERTA", detalhe: "página antirrobô no lugar dos dados: o client lê HTML como vazio" } : vereditoStatus(res)) },
	)),
	sonda("tcu-inabilitados-ords", "federal", "TCU — inabilitados (contas.tcu.gov.br)", "alternativa ao host bloqueado", get(
		"https://contas.tcu.gov.br/ords/condenacao/consulta/inabilitados",
	)),
	sonda("tse-divulgacand", "federal", "TSE — DivulgaCand", "identidade, patrimônio, doadores", get(
		"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/eleicao/ordinarias",
	), true),
	sonda("tse-cdn-candidatos", "federal", "TSE — CSV nacional de candidatos 2024", "ETL tse_eleitos (Fase 3)", get(
		"https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip",
		{ metodo: "HEAD", soStatus: true },
	)),
	sonda("tse-mapa-municipios", "municipal", "TSE — mapa municípios TSE↔IBGE", "ETL tse_eleitos (Fase 3)", get(
		"https://resultados.tse.jus.br/oficial/ele2024/619/config/mun-e000619-cm.json",
		{ avaliar: (c, res) => (res.ok && typeof c === "object" ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	)),
	sonda("brasilapi-cnpj", "federal", "BrasilAPI — CNPJ/QSA", "QSA e empresas", get(
		`https://brasilapi.com.br/api/cnpj/v1/${CNPJ_REF}`,
		{ avaliar: (c, res) => (res.ok && JSON.stringify(c).includes("qsa") ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	), true),
	sonda("transferegov-pix", "federal", "TransfereGov — emendas PIX", "TransfereGov", get(
		"https://api.transferegov.gestao.gov.br/transferenciasespeciais/plano_acao_especial?limit=1",
	)),
	sonda("transferegov-convenios", "federal", "TransfereGov — /convenios", "osint-contratos, cnpj/route", get(
		`https://api.transferegov.gestao.gov.br/convenios?cnpj_convenente=${CNPJ_PREF_SP}`,
		{ avaliar: (_c, res) => avaliarEndpointSuspeito(res.status) },
	)),
	sonda("dou-busca", "federal", "DOU — busca in.gov.br", "nomeações (Fase 4)", get(
		"https://www.in.gov.br/consulta/-/buscar/dou?q=nomear&s=do2&delta=1",
		{
			headers: { Accept: "text/html", Referer: "https://www.in.gov.br/consulta" },
			avaliar: (c, res) => (res.ok && String(c).includes("BuscaDouPortlet_params")
				? vereditoStatus(res)
				: { estado: "FALHA", detalhe: `HTTP ${res.status} sem bloco de resultados` }),
		},
	)),
	sonda("denasus", "federal", "DENASUS — portal gov.br", "auditorias SUS", get(
		"https://www.gov.br/saude/pt-br/composicao/denasus",
		{ headers: { Accept: "text/html" }, avaliar: statusOk },
	)),
	sonda("siconfi-entes", "municipal", "SICONFI — entes", "prefeito (LRF)", get(
		"https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes",
	)),
	sonda("bndes-ckan", "federal", "BNDES — CKAN", "empresas", get(
		"https://dadosabertos.bndes.gov.br/api/3/action/package_list",
		{ avaliar: (c, res) => (res.ok && (c as { success?: boolean })?.success ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	)),
	sonda("ibge-municipios", "municipal", "IBGE — municípios", "código IBGE (Fase 4)", get(
		"https://servicodados.ibge.gov.br/api/v1/localidades/estados/GO/municipios",
	)),
];

// ─── Estadual ───────────────────────────────────────────────────────────────

const estaduais: Sonda[] = [
	sonda("alesp-xml", "estadual", "ALESP — despesas de gabinete (XML)", "ETL alesp-despesas-sync", get(
		"https://www.al.sp.gov.br/repositorioDados/deputados/despesas_gabinetes.xml",
		{ metodo: "HEAD", soStatus: true },
	)),
	sonda("alerj-docigp", "estadual", "ALERJ — DOCIGP (deputados)", "ETL alerj-docigp-sync", get(
		"https://docigp.alerj.rj.gov.br/api/v1/congressmen?page=1",
	)),
	sonda("alerj-docigp-orcamentos", "estadual", "ALERJ — DOCIGP (orçamentos com lançamentos)", "ETL alerj-docigp-sync", get(
		"https://docigp.alerj.rj.gov.br/api/v1/congressmen/95/legislatures/2/budgets?page=1",
		{ avaliar: (c, res) => (res.ok && Array.isArray((c as { rows?: unknown[] })?.rows) ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	)),
	// O endereço antigo /ws/ redireciona para /api/v2/ (07/10/2026).
	sonda("almg-deputados", "estadual", "ALMG — deputados em exercício", "assembleias/almg.ts", get(
		"https://dadosabertos.almg.gov.br/api/v2/deputados/em_exercicio?formato=json",
		{ avaliar: (c, res) => (res.ok && Array.isArray((c as { list?: unknown[] })?.list) ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	)),
	sonda("almg-verbas", "estadual", "ALMG — verba indenizatória", "assembleias/almg.ts", get(
		`https://dadosabertos.almg.gov.br/api/v2/prestacao_contas/verbas_indenizatorias/deputados/12193/${anoAtual - 1}/3?formato=json`,
		{ avaliar: (c, res) => (res.ok && Array.isArray((c as { list?: unknown[] })?.list) ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	)),
	sonda("tce-sp", "municipal", "TCE-SP — municípios", "sp/tce.ts", get(
		"https://transparencia.tce.sp.gov.br/api/json/municipios",
	)),
	sonda("tce-rj", "municipal", "TCE-RJ — contratos município", "rj/tcerj-client.ts", get(
		"https://dados.tcerj.tc.br/api/v1/contratos_municipio?municipio=NITEROI&limite=5",
	)),
	sonda("tce-pe", "municipal", "TCE-PE — contratos", "pe/tce.ts", get(
		`https://sistemas.tce.pe.gov.br/DadosAbertos/Contratos!json?AnoReferencia=${anoAtual}&Esfera=M&Municipio=RECIFE`,
		{ avaliar: statusOk },
	)),
	sonda("tce-ce-atual", "municipal", "TCE-CE — host usado (dados.tce.ce.gov.br)", "ce/tce.ts", get(
		"https://dados.tce.ce.gov.br/api/municipios",
	)),
	sonda("tce-ce-mcp", "municipal", "TCE-CE — host do mcp-brasil", "alternativa", get(
		"https://api-dados-abertos.tce.ce.gov.br/municipios",
	)),
	sonda("tce-rn", "municipal", "TCE-RN — jurisdicionados", "rn/tce.ts", get(
		"https://apidadosabertos.tce.rn.gov.br/api/InformacoesBasicasApi/JurisdicionadosTCE/Json",
	)),
	sonda("tce-pi", "municipal", "TCE-PI — prefeituras", "pi/tce.ts", get(
		"https://sistemas.tce.pi.gov.br/api/portaldacidadania/prefeituras",
	)),
	sonda("tce-sc", "municipal", "TCE-SC — unidades gestoras", "sc/tce.ts", get(
		"https://servicos.tcesc.tc.br/endpoints-portal-transparencia/unidades-gestoras.php",
		{ avaliar: statusOk },
	)),
	sonda("tce-to", "municipal", "TCE-TO — e-Contas pessoas", "to/tce.ts", get(
		"https://api.tceto.tc.br/econtas/api/pessoas?nome=SILVA&pagina=1",
		{ headers: { Accept: "application/json" }, avaliar: statusOk },
	)),
	sonda("tce-pa", "municipal", "TCE-PA — diário oficial", "pa/tce.ts", get(
		"https://sistemas.tcepa.tc.br/dadosabertos/api/v1/diario_oficial?q=contrato",
		{ avaliar: statusOk },
	)),
	sonda("tce-rs", "municipal", "TCE-RS — municípios", "rs/tce.ts", get(
		"https://dados.tce.rs.gov.br/dados/auxiliar/municipios.json",
	)),
	sonda("tce-es", "municipal", "ES — contratações municipais (CKAN)", "es/tce.ts", get(
		"https://dados.es.gov.br/api/3/action/datastore_search?resource_id=bdc86561-cb94-4da9-9131-42ebe5d6c5ac&limit=1",
		{ avaliar: (c, res) => (res.ok && (c as { success?: boolean })?.success ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	)),
	sonda("tce-mg", "municipal", "TCE-MG — CKAN sem resource_id", "mg/tce.ts", get(
		"https://dadosabertos.tce.mg.gov.br/api/3/action/datastore_search?q=belo&limit=1",
		{ avaliar: (c, res) => (res.ok && (c as { success?: boolean })?.success ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	)),
	sonda("tcm-ba", "municipal", "TCM-BA — contratos", "ba/tce.ts", get(
		"https://www.tcm.ba.gov.br/api/dadosabertos/v1/contratos?municipio=SALVADOR&limite=1",
		{ avaliar: (_c, res) => avaliarEndpointSuspeito(res.status) },
	)),
	sonda("tce-pr", "municipal", "TCE-PR — licitações/contratos", "pr/tce.ts", get(
		"https://servicos.tce.pr.gov.br/TCEPR/Tribunal/Relatorios/Licitacoes/LicitacoesContratos?municipio=CURITIBA&itens=1",
		{ avaliar: (_c, res) => avaliarEndpointSuspeito(res.status) },
	)),
	sonda("tce-se", "municipal", "TCE-SE — contratos", "se/tce.ts", get(
		"https://www.tce.se.gov.br/api/dadosabertos/v1/contratos?municipio=ARACAJU&limite=1",
		{ avaliar: (_c, res) => avaliarEndpointSuspeito(res.status) },
	)),
	sonda("tce-pb", "municipal", "TCE-PB — Sagres", "pb/tce.ts", get(
		`https://sagresonline.tce.pb.gov.br/api/contratos?cpfCnpj=${CNPJ_REF}`,
		{ avaliar: (_c, res) => avaliarEndpointSuspeito(res.status) },
	)),
	sonda("tcm-sp", "municipal", "TCM-SP — contratos", "municipios/tcm-sp.ts", get(
		"https://www.tcm.sp.gov.br/api/public/contratos?q=prefeitura",
		{ avaliar: (_c, res) => avaliarEndpointSuspeito(res.status) },
	)),
	sonda("querido-diario", "municipal", "Querido Diário — diários municipais", "osint-diarios, Querido Diário", get(
		"https://api.queridodiario.org.br/gazettes?querystring=nomear&size=1",
		{ avaliar: (c, res) => (res.ok && JSON.stringify(c).includes("gazettes") ? vereditoStatus(res) : { estado: "FALHA", detalhe: `HTTP ${res.status}` }) },
	)),
];

export const SONDAS: Sonda[] = [...federais, ...estaduais];
