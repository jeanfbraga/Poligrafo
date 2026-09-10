import { primeiroValorTexto } from "@/lib/utils";
import { fetchWithTimeout } from "../../tse";

// ==========================================
// Extrator NATIVO: TCE Pará (PA)
// API Dados Abertos - Diário Oficial
// ==========================================

const API_DIARIO =
	"https://sistemas.tcepa.tc.br/dadosabertos/api/v1/diario_oficial";
const TIMEOUT_PA = 15000;

function parseAtoAcordaoPA(ato: any, termo: string): any | null {
	const textoCompleto = JSON.stringify(ato).toLowerCase();
	if (!textoCompleto.includes(termo.toLowerCase())) return null;

	const num = primeiroValorTexto(ato.numeroPublicacao, ato.id, "S/N");
	const tipo = primeiroValorTexto(ato.tipoAto, ato.tipo_ato, "Ato Oficial");
	const ementa = primeiroValorTexto(
		ato.ementa,
		ato.assunto,
		ato.resumo,
		"Documento sem ementa detalhada.",
	);
	const link = primeiroValorTexto(ato.url, ato.link_documento, API_DIARIO);
	const dataAto = primeiroValorTexto(
		ato.dataPublicacao,
		ato.data_publicacao,
		"Recente",
	);

	return {
		titulo: `${tipo} Nº ${num}`,
		resumo: ementa.length > 200 ? `${ementa.substring(0, 197)}...` : ementa,
		url: link,
		dataPublicacao: dataAto,
		ementa,
	};
}

function isAtoRelevante(
	textoCompleto: string,
	isCpf: boolean,
	mioloCpf: string | null,
	termoAvo: string,
	termoB: string,
): boolean {
	if (isCpf && mioloCpf && textoCompleto.includes(mioloCpf)) return true;
	if (termoAvo.length > 5 && textoCompleto.includes(termoAvo)) return true;
	if (termoB.length > 5 && textoCompleto.includes(termoB)) return true;
	return false;
}

function extrairValorMoeda(ementaStr: string): number {
	const match = ementaStr.match(/(?:r\$|reais|valor)\s*(?:de\s*)?([\d.,]+)/i);
	if (!match?.[1]) return 0;
	const strNum = match[1].replace(/\./g, "").replace(",", ".");
	const valor = parseFloat(strNum);
	return Number.isNaN(valor) ? 0 : valor;
}

function parseDespesaAtoPA(
	ato: any,
	tipo: string,
	isCpf: boolean,
	mioloCpf: string | null,
	termoAvo: string,
	termoB: string,
): any | null {
	const textoCompleto = JSON.stringify(ato).toLowerCase();
	if (!isAtoRelevante(textoCompleto, isCpf, mioloCpf, termoAvo, termoB)) {
		return null;
	}

	const ementaStr = String(
		ato.ementa || ato.assunto || ato.resumo || "",
	).toLowerCase();
	const dataAto = primeiroValorTexto(
		ato.dataPublicacao,
		ato.data_publicacao,
		"Recente",
	);
	const titulo = primeiroValorTexto(ato.tipoAto, ato.tipo_ato, tipo);
	const num = primeiroValorTexto(ato.numeroPublicacao, ato.id, "S/N");
	const valor = extrairValorMoeda(ementaStr);
	const ementaResumo = primeiroValorTexto(
		ato.ementa,
		ato.assunto,
		"Documento sem resumo.",
	);

	return {
		cnpjCpfFornecedor: "S/N",
		nomeFornecedor: `Extrato D.O. ${titulo} Nº ${num}`,
		tipoDespesa: `${ementaResumo.substring(0, 300)}...`,
		valorDocumento: valor,
		dataDocumento: dataAto.includes("T") ? dataAto.split("T")[0] : dataAto,
		urlDocumento: primeiroValorTexto(ato.url, ato.link_documento, API_DIARIO),
	};
}

export async function buscarAcordaosTcePA(nomeBuscado: string): Promise<any[]> {
	const termo = nomeBuscado.trim();
	if (!termo) return [];

	console.log(`[TCE-PA] Iniciando busca no Diário Oficial para: ${termo}`);
	const processosEncontrados: any[] = [];

	const url = `${API_DIARIO}?q=${encodeURIComponent(termo)}`;

	try {
		const res = await fetchWithTimeout(url, {
			headers: {
				Accept: "application/json",
				"User-Agent": "PoligrafoBot/1.0",
			},
			timeout: TIMEOUT_PA,
		});

		if (!res.ok) {
			console.warn(
				`[TCE-PA] Falha ao acessar Diário Oficial. Status: ${res.status}`,
			);
			return [];
		}

		const raw = await res.json();
		const data = Array.isArray(raw)
			? raw
			: raw.data ||
				raw.itens ||
				Object.values(raw).find((v) => Array.isArray(v)) ||
				[];

		data.forEach((ato: any) => {
			const item = parseAtoAcordaoPA(ato, termo);
			if (item) processosEncontrados.push(item);
		});

		console.log(
			`[TCE-PA] Localizados ${processosEncontrados.length} ato(s) no Diário Oficial.`,
		);
	} catch (e) {
		console.warn(`[TCE-PA] Falha ao extrair Diário Oficial:`, e);
	}

	return processosEncontrados;
}

/**
 * Motor de busca de Despesas para o Estado do Pará.
 * Usa a API do Diário Oficial buscando pelas categorias CONTRATOS e LICITACOES,
 * filtrando pelo município e pelo identificador (nome ou CPF do fornecedor/político).
 */
export async function buscarDespesasPA(
	identificador: string,
	municipioUri: string,
	nomeParaBusca?: string,
) {
	const termoAvo = String(identificador).toLowerCase().trim();
	const termoB = (nomeParaBusca || "").toLowerCase().trim();
	const isCpf = /^\d{11}$/.test(termoAvo);
	const mioloCpf = isCpf ? termoAvo.substring(3, 9) : null;

	const queryBusca = municipioUri
		? municipioUri.replace(/-/g, " ")
		: "estado do para";
	console.log(`[TCE-PA] Buscando Contratos e Licitações para: ${queryBusca}`);

	const despesasEncontradas: any[] = [];
	const frentes = ["CONTRATOS", "LICITACOES"];
	const params = `q=${encodeURIComponent(queryBusca)}&tamanho=50`;

	for (const tipo of frentes) {
		const url = `${API_DIARIO}?${params}&tipo_ato=${tipo}`;

		try {
			const res = await fetchWithTimeout(url, {
				headers: {
					Accept: "application/json",
					"User-Agent": "PoligrafoBot/1.0",
				},
				timeout: TIMEOUT_PA,
			});

			if (!res.ok) continue;

			const raw = await res.json();
			const data = Array.isArray(raw) ? raw : raw.data || raw.itens || [];

			data.forEach((ato: any) => {
				const item = parseDespesaAtoPA(
					ato,
					tipo,
					isCpf,
					mioloCpf,
					termoAvo,
					termoB,
				);
				if (item) despesasEncontradas.push(item);
			});
		} catch (e) {
			console.warn(`[TCE-PA] Falha ao extrair despesas do tipo ${tipo}:`, e);
		}
	}

	return despesasEncontradas
		.sort((a, b) => b.valorDocumento - a.valorDocumento)
		.slice(0, 50);
}
