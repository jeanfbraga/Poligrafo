import { buscarDiariosMunicipais } from "@/services/integrations/dou/queridodiario";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { GROQ_MODELS } from "@/services/ai/ai-models-config";

// Função auxiliar para analisar trechos com GROQ
async function estruturarTrechoDiario(
	trecho: string,
	nomePolitico: string,
): Promise<any> {
	const groqKey = process.env.GROQ_API_KEY;
	if (!groqKey) return null;

	const prompt = `Você é um analista OSINT de Diários Oficiais.
Analise o trecho a seguir e extraia os dados estruturados sobre a pessoa "${nomePolitico}".
Retorne APENAS um JSON com o seguinte formato:
{
  "tipo_evento": "Nomeação | Licitação | Contrato | Exoneração | Outro",
  "valor_monetario": <numero ou null se nao houver>,
  "data_publicacao": "YYYY-MM-DD ou null",
  "empresa_associada": "Nome da empresa/CNPJ se houver, ou null",
  "resumo": "Um resumo de 1 linha do que aconteceu no texto"
}
Trecho: "${trecho.replace(/"/g, "'")}"`;

	for (const model of GROQ_MODELS) {
		try {
			const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${groqKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: model,
					messages: [{ role: "user", content: prompt }],
					temperature: 0.1,
					response_format: { type: "json_object" },
				}),
				signal: AbortSignal.timeout(8000),
			});

			if (res.ok) {
				const data = await res.json();
				return JSON.parse(data.choices[0].message.content);
			}
		} catch (e) {
			// Tenta próximo modelo
		}
	}
	return null;
}

async function restaurarCacheDiarios(
	chaveCache: string,
	pessoaId: string,
	sendEvent: any,
	supabaseNodesBuffer: any[],
): Promise<boolean> {
	if (process.env.NODE_ENV === "development") return false;
	const { data: cacheData } = await supabaseAdmin
		.from("pesquisas")
		.select("grafo_dados")
		.eq("termo_busca", chaveCache)
		.order("atualizado_em", { ascending: false })
		.limit(1)
		.single();

	const nodes = cacheData?.grafo_dados?.nodes;
	if (!nodes || nodes.length === 0) return false;

	sendEvent("STATUS", { msg: `Restaurando publicações do Diário Oficial a partir do Cache...` });
	for (const n of nodes) {
		if (n.type !== "DIARIO_OFICIAL_NODE") continue;
		const newNode = {
			...n,
			id: `diario-cache-${Date.now()}-${Math.random().toString(36).substring(7)}`,
			_origemId: pessoaId,
		};
		sendEvent("NODE_NOVO", newNode);
		supabaseNodesBuffer.push(newNode);
	}
	return true;
}

function montarPayloadNodeDiario(
	gazette: any,
	trecho: string,
	infoExtraida: any,
	ufScope: string,
	pessoaId: string,
	index: number,
) {
	return {
		id: `diario-${gazette.territory_id || "br"}-${Date.now()}-${index}`,
		type: "DIARIO_OFICIAL_NODE",
		_origemId: pessoaId,
		data: {
			label: "Publicação em Diário Oficial",
			municipio: gazette.territory_name || "Desconhecido",
			uf: gazette.state_code || ufScope,
			dataPublicacao: gazette.date || infoExtraida?.data_publicacao,
			tipoEvento: infoExtraida?.tipo_evento || "Publicação Legal",
			valor: infoExtraida?.valor_monetario || 0,
			empresa: infoExtraida?.empresa_associada || null,
			resumo: infoExtraida?.resumo || `${trecho.substring(0, 150)}...`,
			url: gazette.url || gazette.txt_url,
			textoBruto: trecho,
		},
	};
}

async function processarGazettes(
	gazettes: any[],
	nomeParaBusca: string,
	ufScope: string,
	pessoaId: string,
	sendEvent: any,
	supabaseNodesBuffer: any[],
): Promise<any[]> {
	const nodesCriados: any[] = [];
	let excertosAnalisados = 0;

	for (const gazette of gazettes) {
		if (!gazette.excerpts?.length) continue;
		for (const trecho of gazette.excerpts) {
			if (excertosAnalisados >= 5) break;
			const info = await estruturarTrechoDiario(trecho, nomeParaBusca);
			const node = montarPayloadNodeDiario(gazette, trecho, info, ufScope, pessoaId, excertosAnalisados);
			sendEvent("NODE_NOVO", node);
			nodesCriados.push(node);
			supabaseNodesBuffer.push(node);
			excertosAnalisados++;
		}
		if (excertosAnalisados >= 5) break;
	}
	return nodesCriados;
}

async function salvarCacheDiarios(chaveCache: string, nodes: any[]) {
	if (nodes.length === 0 || process.env.NODE_ENV === "development") return;
	await supabaseAdmin.from("pesquisas").insert({
		termo_busca: chaveCache,
		cpf_raiz: null,
		grafo_dados: {
			timestamp: new Date().toISOString(),
			nodes,
			escopo: "MUNICIPAL",
			partial: true,
		},
	});
}

export async function investigarDiariosOficiais(
	nomeParaBusca: string,
	ufScope: string,
	pessoaId: string,
	sendEvent: any,
	supabaseNodesBuffer: any[],
) {
	try {
		sendEvent("STATUS", { msg: `Consultando Diários Oficiais via Querido Diário...` });
		const chaveCache = `diario_${nomeParaBusca}_${ufScope}`;
		const restaurado = await restaurarCacheDiarios(chaveCache, pessoaId, sendEvent, supabaseNodesBuffer);
		if (restaurado) return;

		const resultado = await buscarDiariosMunicipais({ termo: nomeParaBusca, size: 5 });
		if (!resultado.gazettes || resultado.gazettes.length === 0) return;

		sendEvent("STATUS", { msg: `Diários Oficiais encontrados. Processando extração via IA...` });
		const nodesCriados = await processarGazettes(
			resultado.gazettes,
			nomeParaBusca,
			ufScope,
			pessoaId,
			sendEvent,
			supabaseNodesBuffer,
		);
		await salvarCacheDiarios(chaveCache, nodesCriados);
	} catch (e) {
		console.error("Erro na integração Querido Diário:", e);
	}
}
