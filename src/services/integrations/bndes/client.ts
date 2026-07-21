import { fetchWithTimeout } from "../../../app/api/investigar/tse";

const API_BASE = "https://dadosabertos.bndes.gov.br/api/3/action";
const RESOURCE_OPERACOES_AUTOMATICAS = "612faa0b-b6be-4b2c-9317-da5dc2c0b901";
const RESOURCE_OPERACOES_NAO_AUTOMATICAS =
	"6f56b78c-510f-44b6-8274-78a5b7e931f4";

export interface OperacaoBNDES {
	cliente: string;
	cnpj: string;
	uf: string;
	municipio: string;
	valor: number;
	situacao: string;
	data: string;
	produto: string;
	instrumento: string;
	setor: string;
}

async function queryDatastore(
	resourceId: string,
	q: string,
): Promise<OperacaoBNDES[]> {
	try {
		const url = `${API_BASE}/datastore_search?resource_id=${resourceId}&q=${encodeURIComponent(q)}&limit=10`;
		const res = await fetchWithTimeout(url, { timeout: 6000 });
		if (!res.ok) return [];
		const json = await res.json();
		if (!json.success || !json.result?.records) return [];

		return json.result.records.map((r: any) => {
			const valor = Number(
				r.valor_da_operacao_em_reais ||
					r.valor_contratado_reais ||
					r.valor_desembolsado_reais ||
					0,
			);
			return {
				cliente: r.cliente || r.nome_do_cliente || "N/A",
				cnpj: r.cnpj || r.cnpj_do_cliente || "",
				uf: String(r.uf || r.uf_do_cliente || "N/A").trim(),
				municipio: r.municipio || r.municipio_do_cliente || "",
				valor,
				situacao: r.situacao_da_operacao || r.situacao_do_contrato || "N/A",
				data: r.data_da_contratacao || r.data_do_contrato || "N/A",
				produto: r.produto || "N/A",
				instrumento: r.instrumento_financeiro || "N/A",
				setor: r.setor_cnae || "N/A",
			};
		});
	} catch (e: any) {
		console.warn(
			`[BNDES] Erro ao consultar recurso ${resourceId}:`,
			e.message || e,
		);
		return [];
	}
}

export async function buscarOperacoesBNDES(
	cnpjOuNome: string,
): Promise<OperacaoBNDES[]> {
	if (!cnpjOuNome) return [];

	// Consulta em paralelo nas operações automáticas e não automáticas
	const [automaticas, naoAutomaticas] = await Promise.allSettled([
		queryDatastore(RESOURCE_OPERACOES_AUTOMATICAS, cnpjOuNome),
		queryDatastore(RESOURCE_OPERACOES_NAO_AUTOMATICAS, cnpjOuNome),
	]);

	const results: OperacaoBNDES[] = [];
	if (automaticas.status === "fulfilled") {
		results.push(...automaticas.value);
	}
	if (naoAutomaticas.status === "fulfilled") {
		results.push(...naoAutomaticas.value);
	}

	return results;
}
