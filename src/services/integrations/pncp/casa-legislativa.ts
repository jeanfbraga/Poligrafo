/**
 * CNPJ da casa legislativa do mandato (câmara municipal, assembleia, Câmara Legislativa
 * do DF) pela busca do portal do PNCP.
 *
 * A API oficial só acha órgão pelo CNPJ exato (mcp-brasil, data/compras/pncp/client.py,
 * `consultar_orgao`). A busca do portal (`/api/search/`) filtra por município (IBGE),
 * UF, poder e esfera, e devolve o CNPJ do órgão em cada contrato.
 *
 * O poder Legislativo também inclui tribunais de contas (TCM-RJ, TCM-SP, TCEs) e escolas
 * de contas: só vale órgão com "CAMARA" (municipal e DF) ou "ASSEMBLEIA LEGISLATIVA"
 * (estadual) no nome. O texto da busca põe a casa no topo — sem ele, em São Paulo a
 * Câmara aparecia 3 vezes entre 100 resultados do TCM (08/10/2026).
 */
import { cnpjValido, soDigitos } from "@/lib/documento";
import { buscarJson } from "@/lib/fonte-http";

const BUSCA_PNCP = "https://pncp.gov.br/api/search/";

export interface CasaLegislativa {
	cnpj: string;
	/** Como o PNCP grava (ex.: "CUIABA CAMARA MUNICIPAL"). */
	nome: string;
	/** Para o log e a fonte: "Câmara Municipal (Cuiabá)", "Assembleia Legislativa de SP". */
	rotulo: string;
}

export type AlvoCasa = { esfera: "MUNICIPAL"; codIbge: string } | { esfera: "ESTADUAL"; uf: string };

interface ItemBusca {
	orgao_cnpj?: string;
	orgao_nome?: string;
	municipio_nome?: string;
	codigo_ibge?: string;
	uf?: string;
}

interface Consulta {
	parametros: string;
	nomeValido: (nome: string) => boolean;
	doLugar: (item: ItemBusca) => boolean;
	rotulo: (item: ItemBusca) => string;
}

function semAcento(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

export function consultaDaCasa(alvo: AlvoCasa): Consulta {
	if (alvo.esfera === "MUNICIPAL") {
		return {
			parametros: `q=camara&municipios=${alvo.codIbge}&poderes=L&esferas=M`,
			nomeValido: (n) => /CAMARA/.test(semAcento(n)) && !/TRIBUNAL|ESCOLA/.test(semAcento(n)),
			doLugar: (i) => String(i.codigo_ibge ?? "") === alvo.codIbge,
			// "de/do/da" depende da cidade (do Rio, do Recife): o nome vai entre parênteses.
			rotulo: (i) => `Câmara Municipal (${i.municipio_nome ?? alvo.codIbge})`,
		};
	}
	const uf = alvo.uf.toUpperCase();
	if (uf === "DF") {
		return {
			parametros: "q=camara%20legislativa&ufs=DF&poderes=L&esferas=D",
			nomeValido: (n) => /CAMARA LEGISLATIVA/.test(semAcento(n)),
			doLugar: (i) => String(i.uf ?? "").toUpperCase() === "DF",
			rotulo: () => "Câmara Legislativa do DF",
		};
	}
	return {
		parametros: `q=assembleia&ufs=${uf}&poderes=L&esferas=E`,
		nomeValido: (n) => /ASSEMBLEIA LEGISLATIVA/.test(semAcento(n)),
		doLugar: (i) => String(i.uf ?? "").toUpperCase() === uf,
		rotulo: () => `Assembleia Legislativa de ${uf}`,
	};
}

/** O órgão que mais aparece entre os resultados válidos (nome e lugar conferidos, CNPJ válido). */
export function escolherCasa(itens: ItemBusca[], consulta: Consulta): CasaLegislativa | null {
	const contagem = new Map<string, { item: ItemBusca; n: number }>();
	for (const item of itens) {
		const cnpj = soDigitos(item.orgao_cnpj);
		if (!cnpjValido(cnpj) || !consulta.nomeValido(String(item.orgao_nome ?? "")) || !consulta.doLugar(item)) continue;
		const atual = contagem.get(cnpj);
		contagem.set(cnpj, { item, n: (atual?.n ?? 0) + 1 });
	}
	const [melhor] = [...contagem.entries()].sort((a, b) => b[1].n - a[1].n);
	if (!melhor) return null;
	const [cnpj, { item }] = melhor;
	return { cnpj, nome: String(item.orgao_nome), rotulo: consulta.rotulo(item) };
}

/** Lança erro se a busca falhar (o chamador registra no log); null = casa não encontrada. */
export async function buscarCasaLegislativa(alvo: AlvoCasa, fetchFn?: typeof fetch): Promise<CasaLegislativa | null> {
	const consulta = consultaDaCasa(alvo);
	const url = `${BUSCA_PNCP}?tipos_documento=contrato&ordenacao=-data&pagina=1&tam_pagina=50&status=todos&${consulta.parametros}`;
	const r = await buscarJson<{ items?: ItemBusca[] }>(url, {
		fonte: "pncp-busca",
		timeoutMs: 15_000,
		tentativas: 3,
		memoria: { ttlMs: 24 * 60 * 60 * 1000 },
		fetchFn,
	});
	if (!r.ok) throw new Error(`busca do PNCP: ${r.mensagem}`);
	return escolherCasa(r.dados?.items ?? [], consulta);
}
