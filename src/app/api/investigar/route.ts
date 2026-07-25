export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { checkRateLimit } from "@/lib/api-rate-limit";
import { fetchWithTimeout } from "./tse";

// ==========================================
// Tipos e Interfaces
// ==========================================

interface ParlamentarBasico {
	id: number | string;
	uri: string;
	nome: string;
	uf: string;
	idLegislatura: number;
	casa:
		| "CAMARA"
		| "SENADO"
		| "ALERJ"
		| "ALESP"
		| "GOVERNO_ESTADUAL"
		| "PREFEITURA"
		| "PRESIDENCIA_DA_REPUBLICA"
		| `CAMARA_MUNICIPAL_${string}`;
	afastamento?: {
		motivo: string;
		suplente: string | null;
	};
	urlFoto?: string;
}
interface DetalhesDeputado {
	cpf: string;
	nomeCivil: string;
	sexo: string;
	dataNascimento: string;
}
interface GraphNode {
	id: string;
	type: "PESSOA" | "DESPESA" | "CONTRATO" | "EMENDA" | "DIARIO_OFICIAL_NODE";
	data: {
		label: string;
		[key: string]: any;
	};
	edge?: any;
}

// Utilitários movidos para tse.ts e agora importados.

// ==========================================
// Integracao Gemini API (Motor Heurístico)
// ==========================================
// ==========================================
// Integracao Gemini API (Motor Heurístico) movida para ai_helpers.ts
// ==========================================

// ==========================================
// NOVOS MÓDULOS OSINT DE CONTEXTO GLOBAL
// ==========================================

// ==========================================
// Funções ETL Públicas
// ==========================================

// NOVA FUNÇÃO: Tenta encontrar o político no Senado Federal

// ==========================================
// Funções de Listagem (Desambiguação)
// ==========================================

async function _buscarDetalhesPolitico(
	id: number,
): Promise<DetalhesDeputado | null> {
	const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${id}`;
	const response = await fetchWithTimeout(url);
	if (!response.ok)
		throw new Error(`Erro na API (Detalhes): status ${response.status}`);
	const json = await response.json();
	const dados = json.dados;
	if (!dados) return null;
	return {
		cpf: dados.cpf,
		nomeCivil: dados.nomeCivil,
		sexo: dados.sexo,
		dataNascimento: dados.dataNascimento,
	};
}

// ==========================================
// Integrações OSINT Específicas
// ==========================================

// NOVA FUNÇÃO: Investiga a Pessoa Física do Político
// NOVA FUNÇÃO: Busca Processos Judiciais no DataJud (CNJ)

// NOVA FUNÇÃO: Investiga a Pessoa Física do Político

// NOVA FUNÇÃO: Busca convênios milionários no Transferegov
async function _buscarConveniosTransferegov(cnpjLimpo: string) {
	try {
		const url = `https://api.transferegov.gestao.gov.br/convenios?cnpj_convenente=${cnpjLimpo}`;
		const res = await fetchWithTimeout(url, {
			timeout: 12000,
		});
		if (!res.ok) return null;
		const data = await res.json();
		if (Array.isArray(data) && data.length > 0) {
			const valorTotal = data.reduce(
				(acc, curr) => acc + (Number(curr.valor_global) || 0),
				0,
			);
			return {
				quantidade: data.length,
				valorTotal,
			};
		}
		return null;
	} catch (_e) {
		return null;
	}
}

// NOVA FUNÇÃO: Bate na base de Aeronaves caso haja um prefixo suspeito
async function _verificarAeronaveAnac(textoBusca: string) {
	// Regex para extrair prefixos de aeronaves brasileiras (ex: PR-ABC, PP-XYZ, PT-123)
	const regexPrefixo = /\b(PR|PP|PT|PS)[-\s]?([A-Z]{3}|[0-9]{3})\b/gi;
	const match = regexPrefixo.exec(textoBusca);
	if (!match) return null;
	const prefixo = `${match[1]}-${match[2]}`.toUpperCase();
	try {
		// Usando API da comunidade/RAB para consultar o prefixo
		const url = `https://rab.api.aero/v1/aeronaves/${prefixo}`;
		const res = await fetchWithTimeout(url, {
			timeout: 3500,
		});
		if (!res.ok) return null;
		return await res.json();
	} catch (_e) {
		return null;
	}
}

// A função buscarAeronavesProprietario foi movida para lib/anac/client.ts

// Funções do TSE removidas (buscarDoadoresTSE movido para ai_helpers.ts)

// A função buscarDoadoresTSE foi movida para tse.ts e agora é importada.

// OSINT Profundo em Fornecedores de Risco ALTO

// ==========================================
// RASTREIO DOWNSTREAM (CGU, Compras.gov, BrasilAPI)
// ==========================================

async function _buscarViagensFAB(
	cpfLimpo: string,
	pessoaId: string,
	sendEvent: any,
	_casaPolitico?: string,
) {
	if (!cpfLimpo || cpfLimpo === "00000000000") return;
	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	if (!apiKey) return;
	try {
		const url = `https://api.portaldatransparencia.gov.br/api-de-dados/viagens?cpfViajante=${cpfLimpo}&pagina=1`;
		let data: any[] = [];
		if (cpfLimpo.length === 11) {
			const res = await fetchWithTimeout(url, {
				headers: {
					"chave-api-dados": apiKey,
				},
				timeout: 6000,
			});
			if (res.ok) {
				data = await res.json();
			}
		}
		if (Array.isArray(data) && data.length > 0) {
			sendEvent("STATUS", {
				msg: `[VIAGENS] Rastreando diárias governamentais e voos da Força Aérea Brasileira (FAB).`,
			});
			data.slice(0, 5).forEach((item: any, idx: number) => {
				const _isInternacional = item.tipoViagem?.descricao === "Internacional";
				const _temVoo = item.trechos?.some((t: any) => t.trechoId && t.origem);
				sendEvent("NODE_NOVO", {
					id: `viagem-${cpfLimpo}-${idx}-${Date.now()}`,
					type: "DESPESA",
					_origemId: pessoaId,
					data: {
						label: `Viagem Oficial: ${item.destinos?.[0]?.localidadeDestino || "N/I"}`,
						valor: item.valorTotalViagem,
						tipo: item.tipoViagem?.descricao || "Viagem a Serviço",
						documento: cpfLimpo,
						dataDocumento: `${item.dataInicio} a ${item.dataFim}`,
						motivo_ia: item.motivo || "Motivo de viagem financiada pelo Estado",
						score_letalidade: item.valorTotalViagem > 25000 ? 75 : 45,
					},
				});
			});
		}
	} catch (e) {
		console.error("[OSINT Viagens Error]", e);
	}
}

// ==========================================
// ROTA GET (Server-Sent Events)
// ==========================================
export async function GET(request: Request) {
	// Proteção de entrada: esta rota consome quotas pagas de LLM
	const limited = checkRateLimit(request, { scope: "investigar", limit: 10 });
	if (limited) return limited;

	const { parseInvestigarRequest } = await import(
		"@/services/core/request-parser"
	);
	const parsed = parseInvestigarRequest(request.url);
	if (parsed instanceof Response) return parsed; // Handles NextResponse.json early return
	const {
		nomeParaBusca,
		ufScope,
		cargoParam,
		ufParam,
		forceRef,
		refParam,
		correcoesNomes,
		nomeBruto,
	} = parsed as any;
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			let isStreamClosed = false;
			const safeClose = () => {
				if (!isStreamClosed) {
					isStreamClosed = true;
					try {
						controller.close();
					} catch (_e) {}
				}
			};
			const sendEvent = (tipo: string, payload: any) => {
				if (isStreamClosed) return;
				try {
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({
								tipo,
								payload,
							})}\n\n`,
						),
					);
				} catch (_e) {}
			};
			try {
				const { executarInvestigacaoPrincipal } = await import(
					"@/services/core/investigador-principal"
				);
				await executarInvestigacaoPrincipal({
					nomeParaBusca,
					ufScope,
					cargoParam,
					ufParam,
					forceRef,
					refParam,
					correcoesNomes,
					nomeBruto,
					sendEvent,
					safeClose,
					isDev: process.env.NODE_ENV === "development",
					dbSearchId: null,
					// Ajuste dbSearchId se necessário
					encoder,
					controller,
					reqUrl: request.url,
				});
			} catch (e) {
				console.error("Erro fatal:", e);
			}
		},
	});
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
