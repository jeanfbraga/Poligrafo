import { analyzeGraphNetwork } from "@/lib/graph-analysis";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { podeLerCachePesquisas } from "@/lib/cache-pesquisas";
import { ColecaoNos, envolverEmissor } from "@/services/core/colecao-nos";
import { redirecionarEtapasPara, reemitirEtapasDoCache } from "@/services/core/etapas-ao-vivo";
import { buscarCandidatos } from "@/services/core/busca-candidatos";
import { buscarEleitoDoAlvo, candidatosDaBaseEleitos } from "@/services/integrations/tse/eleitos";
import { perfilDaCasa } from "@/services/core/alcada";
import { alvoLocalDaRef, interpretarRef } from "@/services/core/alvo-ref";
import { resolverIdentidade } from "@/services/core/identidade";
import { nomesDeReferencia, verificarEmpresaDoPolitico } from "@/services/core/socio-confirmacao";
import { alvoDoGabinete, emitirCruzamentos } from "@/services/cruzamentos";
import { buscarDadosCnpj } from "@/services/integrations/receita/cnpj";
import { coletarContratosDoMandato, emitirColetaDoMandato } from "@/services/core/contratos-do-ente";
import { despesasAlerjParaOPipe } from "@/services/integrations/alerj/despesas-base";
import { despesasDaAssembleia } from "@/services/integrations/assembleias/despesas";
import { cruzarDoadoresComContratosPublicos } from "@/services/core/doadores-contratos";
import { normalizarDespesa, nosDeContratosDoEnte, separarPorNatureza } from "@/services/core/despesa-normalizada";
import { cpfValido, documentoValido } from "@/lib/documento";
import { analisarConflitoVotacoes } from "@/services/integrations/camara/conflito-legislativo";
import congressoIndex from "@/services/integrations/data/congresso-index.json";
import {
	analisarEmendasComInteligencia,
	analisarLoteComInteligencia,
	analisarMalhaOsintComInteligencia,
} from "../../app/api/investigar/ai_helpers";
import {
	buscarDeputadoEstadualRJ,
	buscarPerfilDOCIGP,
} from "../../app/api/investigar/estados/rj/alerj";
import { buscarServidoresCMRJ } from "../../app/api/investigar/estados/rj/camara-rj-client";
import {
	buscarDeputadoEstadualSP,
	buscarDespesasDeputadoEstadualSP,
} from "../../app/api/investigar/estados/sp/alesp";
import {
	buscarDespesasCamara,
	buscarDespesasSenado,
	buscarEmendas,
} from "../../app/api/investigar/etl_extractors";
import {
	buscarDespesasMunicipalMestre,
	buscarMunicipalMestre,
} from "../../app/api/investigar/municipios/router";
import { buscarDetalhesPolitico } from "../../app/api/investigar/scrapers/legislativo";
import {
	buscarCpfNoTSE,
	buscarDoadoresTSE,
	fetchWithTimeout,
	normalizeString,
} from "../../app/api/investigar/tse";
import { buscarAeronavesProprietario } from "../integrations/anac/client";

// Helper mockado para simplificar tipagem no momento

import { buscarAcordaosTcePA } from "../../app/api/investigar/estados/pa/tce";
import { buscarProcessosTceTo } from "../../app/api/investigar/estados/to/tce";
import {
	buscarPolitico,
	buscarPoliticosCamaraLista,
	buscarProjetosLeiCamara,
	buscarSenadoresLista,
} from "../../app/api/investigar/scrapers/legislativo";
import {
	buscarContratosPNCP,
	buscarConveniosTransferegov,
	verificarAeronaveAnac,
} from "../../app/api/investigar/scrapers/osint-contratos";
import { investigarDiariosOficiais } from "../../app/api/investigar/scrapers/osint-diarios";
import {
	buscarCartaoCorporativo,
	buscarReceitasFederais,
	buscarViagensFAB,
	investigarPolitico,
} from "../../app/api/investigar/scrapers/osint-fiscal";
import {
	expandirMalhaSocietaria,
	investigarFornecedorNivelHard,
} from "../../app/api/investigar/scrapers/osint-societario";
import { buscarOperacoesBNDES } from "../integrations/bndes/client";
import {
	consultarFUNDEB,
	consultarPNAE,
	consultarPNATE,
} from "../integrations/fnde/client";

import {
	buscarEnteSiconfi,
	consultarIndicadoresLRF,
} from "../integrations/siconfi/client";
import { buscarImoveisMunicipioSupabase } from "../integrations/spu/client";
import { buscarCertidaoTCU } from "../integrations/tcu/client";
import {
	buscarEmendasPorCNPJ,
	buscarEmendasPorAutor as buscarTransfereGovPorAutor,
	buscarEmendasPorMunicipio as buscarTransfereGovPorMunicipio,
	gerarResumoEmendasPIX,
} from "../integrations/transferegov/client";

function isNodeBemLegado(node: any): boolean {
	const id = String(node?.id || "");
	if (id.startsWith("bens-") || id.startsWith("bem-")) return true;
	if (node?.data?.codigo === "TSE-BENS") return true;
	const label = String(node?.data?.label || "");
	if (label.startsWith("BEM DECLARADO:") || label === "Patrimônio Declarado (TSE)") return true;
	const objeto = String(node?.data?.objeto || "");
	return objeto.startsWith("Total de Bens");
}

async function resolverNomeCivilReidratacao(data: any): Promise<string | undefined> {
	const nomeCivilAtual = String(data.nomeCivil || "").toLowerCase().trim();
	const labelAtual = String(data.label || "").toLowerCase().trim();
	const eIgualAoLabel = !data.nomeCivil || nomeCivilAtual === labelAtual;

	if (eIgualAoLabel && data.casa === "CAMARA" && data.idPoliticoOriginal) {
		try {
			const { buscarDetalhesPolitico } = await import("@/app/api/investigar/scrapers/legislativo");
			const det = await buscarDetalhesPolitico(Number(data.idPoliticoOriginal));
			if (det?.nomeCivil) return det.nomeCivil;
		} catch {
			// Ignora falha de detalhe
		}
	}
	return data.nomeCivil || undefined;
}

async function buscarBensPorNomesCandidato(nomes: (string | undefined)[]): Promise<any[]> {
	const { buscarBensPorNomeTSE } = await import("@/services/integrations/tse/bens");
	const nomesValidos = Array.from(new Set(nomes.filter((n): n is string => Boolean(n))));
	for (const nome of nomesValidos) {
		const bens = await buscarBensPorNomeTSE(nome);
		if (bens.length > 0) return bens;
	}
	return [];
}

async function consultarBensLocaisParaReidratacao(pessoa: any): Promise<any[]> {
	const data = pessoa.data ?? {};
	const cpf = String(data.cpf || "").replace(/\D/g, "");
	if (cpfValido(cpf)) {
		const { buscarBensHistoricoTSE } = await import("@/services/integrations/tse/bens");
		const bensCpf = await buscarBensHistoricoTSE(cpf);
		if (bensCpf.length > 0) return bensCpf;
	}

	const nomeCivilExtra = await resolverNomeCivilReidratacao(data);
	return buscarBensPorNomesCandidato([data.nomeCivil, nomeCivilExtra, data.label]);
}

function extrairCpfValidoParaReidratacao(pessoa: any, tseLive: any): string | null {
	const raw = pessoa.data?.cpf || tseLive?.documentoPrincipal;
	const clean = raw ? String(raw).replace(/\D/g, "") : "";
	return cpfValido(clean) ? clean : null;
}

function montarItemBensLive(tseLive: any) {
	return {
		ano_eleicao: tseLive.anoEleicao || 2026,
		valor_total: tseLive.patrimonioTotal,
		descricao_bens: tseLive.bensDeclarados || [],
		historico: tseLive.historicoPatrimonio || [],
		tseLive,
	};
}

const MAPA_CARGO_COD_REIDRATACAO: Record<string, string> = {
	SENADO: "5",
	GOVERNO_ESTADUAL: "3",
	ALERJ: "7",
	ALESP: "7",
	ASSEMBLEIA_LEGISLATIVA: "7",
	PREFEITURA: "11",
	PRESIDENCIA_DA_REPUBLICA: "1",
};

function resolverCargoCodParaCasa(casa?: string): string {
	if (!casa) return "6";
	if (MAPA_CARGO_COD_REIDRATACAO[casa]) return MAPA_CARGO_COD_REIDRATACAO[casa];
	if (casa.startsWith("CAMARA_MUNICIPAL")) return "13";
	return "6";
}

async function consultarBensLiveParaReidratacao(pessoa: any): Promise<any[]> {
	try {
		const { buscarCpfNoTSE } = await import("@/app/api/investigar/tse");
		const { persistirBensHistoricosTSE } = await import("@/services/integrations/tse/bens");
		const data = pessoa?.data ?? {};
		const uf = data.uf || "BR";
		const cargoCod = resolverCargoCodParaCasa(data.casa);
		const nomeBusca = data.label || data.nomeCivil || "";
		const nomeCivil = await resolverNomeCivilReidratacao(data);

		const tseLive = await buscarCpfNoTSE(nomeBusca, uf, cargoCod, nomeCivil);
		if (!tseLive?.patrimonioTotal || tseLive.patrimonioTotal <= 0) return [];

		const cpf = extrairCpfValidoParaReidratacao(pessoa, tseLive);
		if (cpf) {
			void persistirBensHistoricosTSE(cpf, nomeBusca, tseLive);
		}

		return [montarItemBensLive(tseLive)];
	} catch (err) {
		console.warn("[TSE Reidratacao Live Fallback Error]", err);
		return [];
	}
}

async function consultarBensTSEParaReidratacao(pessoa: any): Promise<any[]> {
	const bensLocais = await consultarBensLocaisParaReidratacao(pessoa);
	if (bensLocais.length > 0) return bensLocais;
	return consultarBensLiveParaReidratacao(pessoa);
}

function aplicarMetricasHistoricoNoNode(targetData: any, live: any): void {
	if (!live) return;
	if (live.historicoPatrimonio) targetData.historicoPatrimonio = live.historicoPatrimonio;
	if (live.patrimonioAnterior !== undefined) targetData.patrimonioAnterior = live.patrimonioAnterior;
	if (live.anoPatrimonioAnterior !== undefined) targetData.anoPatrimonioAnterior = live.anoPatrimonioAnterior;
	if (live.variacaoPatrimonio !== undefined) targetData.variacaoPatrimonio = live.variacaoPatrimonio;
	if (live.variacaoPatrimonioPercentual !== undefined) targetData.variacaoPatrimonioPercentual = live.variacaoPatrimonioPercentual;
}

function extrairDocumentoValidoParaNode(principal: any): string | null {
	const docLive = principal.tseLive?.documentoPrincipal || principal.tseLive?.cpf || principal.cpf_candidato;
	if (!docLive) return null;
	const docLimpo = String(docLive).replace(/\D/g, "");
	return documentoValido(docLimpo) ? docLimpo : null;
}

function reidratarDocumentoNodeSeAusente(pessoaData: any, principal: any): void {
	const precisaCpf = !documentoValido(pessoaData.cpf);
	if (!precisaCpf) return;

	const docLimpo = extrairDocumentoValidoParaNode(principal);
	if (docLimpo) {
		pessoaData.cpf = docLimpo;
		pessoaData.documentoPrincipal = docLimpo;
		pessoaData.isCnpj = docLimpo.length === 14;
	}
}

function reidratarNomeCivilNodeSeAusente(pessoaData: any, principal: any): void {
	const nomeAtual = String(pessoaData.nomeCivil || "").toLowerCase().trim();
	const labelAtual = String(pessoaData.label || "").toLowerCase().trim();
	const precisaNome = !pessoaData.nomeCivil || nomeAtual === labelAtual;
	const nomeLive = principal.tseLive?.nome;
	if (precisaNome && nomeLive) {
		pessoaData.nomeCivil = nomeLive;
	}
}

function aplicarBensNoPessoaNode(pessoa: any, bens: any[]): void {
	const principal = bens?.[0];
	if (!principal?.valor_total) return;

	pessoa.data.patrimonio = Number(principal.valor_total) || 0;
	pessoa.data.anoPatrimonio = principal.ano_eleicao;
	pessoa.data.bensDeclarados = principal.descricao_bens || [];
	aplicarMetricasHistoricoNoNode(pessoa.data, principal.tseLive);

	reidratarDocumentoNodeSeAusente(pessoa.data, principal);
	reidratarNomeCivilNodeSeAusente(pessoa.data, principal);
}

async function reidratarPessoaCacheSeNecessario(cachedNodes: any[], chaveCache?: string): Promise<void> {
	const pessoa = cachedNodes.find((n: any) => n.type === "PESSOA");
	const precisaReidratar =
		!pessoa?.data?.patrimonio ||
		pessoa.data.patrimonio === 0 ||
		!pessoa.data?.bensDeclarados ||
		pessoa.data.bensDeclarados.length === 0;

	if (!pessoa || !precisaReidratar) return;

	try {
		const bens = await consultarBensTSEParaReidratacao(pessoa);
		if (bens.length > 0) {
			aplicarBensNoPessoaNode(pessoa, bens);

			if (chaveCache) {
				const { supabaseAdmin } = await import("@/lib/supabase-admin");
				await supabaseAdmin
					.from("pesquisas")
					.update({
						cpf_raiz: pessoa.data.cpf || null,
						grafo_dados: {
							nodes: cachedNodes,
							timestamp: new Date().toISOString(),
						},
						atualizado_em: new Date().toISOString(),
					})
					.eq("termo_busca", chaveCache);
			}
		}
	} catch (err) {
		console.warn("[Self-Healing Cache Error]", err);
	}
}

// eslint-disable-next-line complexity
export async function executarInvestigacaoPrincipal(params: any) {
	const {
		nomeParaBusca,
		ufScope,
		cargoParam,
		ufParam,
		forceRef,
		refParam,
		correcoesNomes,
		nomeBruto,
		sendEvent: emitirParaTela,
		safeClose,
		isDev,
		dbSearchId,
		encoder,
		controller,
		reqUrl,
	} = params;
	{
		// PASSO 1: O Alvo
		let deputadoBasico: any | null = null;
		// Tudo que vai para a tela também vai para o cache, com o score final da IA.
		const supabaseNodes = new ColecaoNos();
		const sendEvent = envolverEmissor(emitirParaTela, supabaseNodes);
		// Os avisos de conexão (ETAPA) também passam pelo emissor que guarda no cache.
		redirecionarEtapasPara(sendEvent);
		const malhaOsintBuffer: any[] = [];
		if (!forceRef) {
			// MODO BUSCA (sem ref): alçadas em paralelo, ordenadas pela semelhança do nome
			const checkNome = (nomeBruto || "").toLowerCase().trim();
			const autoRefGov: string | undefined = correcoesNomes[checkNome]?.autoRef;
			const { candidatos, houveErroApi } = await buscarCandidatos(
				{
					nome: nomeParaBusca,
					uf: ufScope,
					cargo: cargoParam,
					somenteFederal: ufParam === "FEDERAL",
					refGovernadorSugerida: autoRefGov?.startsWith("GOVERNADOR:") ? autoRefGov : undefined,
				},
				{
					camara: buscarPoliticosCamaraLista,
					senado: buscarSenadoresLista,
					tse: (nome, uf, cargo) => buscarCpfNoTSE(nome, uf, cargo),
					alesp: buscarDeputadoEstadualSP,
					alerj: buscarDeputadoEstadualRJ,
					municipal: buscarMunicipalMestre,
					eleitos: candidatosDaBaseEleitos,
					status: (msg) => sendEvent("STATUS", { msg }),
				},
			);
			if (candidatos.length === 0) {
				sendEvent("ERROR", {
					mensagem: houveErroApi
						? `A busca falhou devido a Timeout/Falha de conexão com as APIs do Governo (Câmara/Senado/TSE). Tente novamente em alguns minutos.`
						: `Nenhum político encontrado para "${nomeParaBusca}".`,
				});
				safeClose();
				return;
			}
			// Envia para o painel de desambiguação e encerra
			sendEvent("STATUS", {
				msg: `${candidatos.length} perfis encontrados. Aguardando seleção do operador...`,
			});
			sendEvent("CANDIDATOS_ENCONTRADOS", {
				termo: nomeParaBusca,
				candidatos,
			});
			safeClose();
			return;
		} else {
			// MODO SELEÇÃO DIRETA (O usuário clicou na UI de Desambiguação ou auto-selecionou)

			// ==========================================
			// TENTATIVA DE CACHE HIT (SUPABASE)
			// ==========================================
			const isDev = process.env.NODE_ENV === "development";
			const chaveCacheDeLeitura = refParam
				? `${nomeParaBusca}_${refParam}`
				: nomeParaBusca;
			try {
				if (podeLerCachePesquisas()) {
					const limiteCache24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
					const { data: cacheData, error: cacheErr } = await supabaseAdmin
						.from("pesquisas")
						.select("grafo_dados")
						.eq("termo_busca", chaveCacheDeLeitura)
						.gte("atualizado_em", limiteCache24h)
						.order("atualizado_em", {
							ascending: false,
						})
						.limit(1)
						.single();
					if (
						!cacheErr &&
						cacheData &&
						cacheData.grafo_dados &&
						cacheData.grafo_dados.nodes &&
						Array.isArray(cacheData.grafo_dados.nodes) &&
						cacheData.grafo_dados.nodes.length > 0 &&
						cacheData.grafo_dados.partial !== true
					) {
						sendEvent("STATUS", {
							msg: "[CACHE] Restaurando investigação completa do banco de dados (Bypass de 24h)...",
						});

						const nodesLegadosIgnorados = new Set<string>();
						const cachedNodes = (cacheData.grafo_dados.nodes || []).filter((node: any) => {
							if (isNodeBemLegado(node)) {
								nodesLegadosIgnorados.add(node.id);
								return false;
							}
							return true;
						});

						await reidratarPessoaCacheSeNecessario(cachedNodes, chaveCacheDeLeitura);

						for (const node of cachedNodes) {
							sendEvent("NODE_NOVO", node);
						}
						
						if (cacheData.grafo_dados.edges) {
							for (const edge of cacheData.grafo_dados.edges) {
								if (!nodesLegadosIgnorados.has(edge.source) && !nodesLegadosIgnorados.has(edge.target)) {
									sendEvent("EDGE_NOVA", edge);
								}
							}
						}

						// De quando é o dossiê e o que cada fonte respondeu naquela investigação.
						reemitirEtapasDoCache(cacheData.grafo_dados, sendEvent);
						sendEvent("DONE", {
							msg: "Dossiê finalizado (restaurado do cache).",
						});

						// Encerramos a investigação instantaneamente economizando APIs
						safeClose();
						return;
					}
				}
			} catch (e) {
				console.warn("[Supabase Cache Miss]", e);
			}
			sendEvent("STATUS", {
				msg: `Extraindo dossiê completo da casa legislativa...`,
			});

			// Extrair prefixos e chamar a API correta
			const alvoLocal = alvoLocalDaRef(interpretarRef(forceRef), nomeBruto || nomeParaBusca);
			if (forceRef?.startsWith("FEDERAL:CAMARA:")) {
				const idRef = forceRef.split(":")[2];
				const localMatch = (congressoIndex as any[]).find(
					(p: any) => String(p.id) === String(idRef),
				);
				if (localMatch) {
					deputadoBasico = {
						id: idRef,
						uri: `https://dadosabertos.camara.leg.br/api/v2/deputados/${idRef}`,
						nome: localMatch.nome,
						uf: localMatch.uf || ufScope || "BR",
						idLegislatura: 57,
						casa: "CAMARA",
					};
				} else {
					deputadoBasico = await buscarPolitico(`id=${idRef}`);
					if (deputadoBasico) {
						(deputadoBasico as any).id = idRef;
						deputadoBasico.casa = "CAMARA";
					} else {
						deputadoBasico = {
							id: idRef,
							uri: `https://dadosabertos.camara.leg.br/api/v2/deputados/${idRef}`,
							nome: (nomeBruto || nomeParaBusca).toUpperCase(),
							uf: ufScope || "BR",
							idLegislatura: 57,
							casa: "CAMARA",
						};
					}
				}
			} else if (forceRef?.startsWith("FEDERAL:SENADO:")) {
				const idRef = forceRef.split(":")[2];
				const localMatchSenado = (congressoIndex as any[]).find(
					(p: any) => String(p.id) === String(idRef),
				);
				if (localMatchSenado) {
					deputadoBasico = {
						id: idRef,
						uri: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${idRef}`,
						nome: localMatchSenado.nome,
						uf: localMatchSenado.uf || ufScope || "BR",
						idLegislatura: 57,
						casa: "SENADO",
					};
				} else {
					const senadoresAll = await buscarSenadoresLista(nomeParaBusca);
					deputadoBasico =
						senadoresAll.find((s) => String(s.id) === idRef) || null;
					if (!deputadoBasico) {
						deputadoBasico = {
							id: idRef,
							uri: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${idRef}`,
							nome: (nomeBruto || nomeParaBusca).toUpperCase(),
							uf: ufScope || "BR",
							idLegislatura: 57,
							casa: "SENADO",
						};
					}
				}
			} else if (alvoLocal) {
				// Municipais e assembleias, inclusive ESTADUAL:{UF}:{doc} (antes sem tratamento)
				// e prefeito de SP/RJ (antes virava vereador): ver services/core/alvo-ref.ts
				deputadoBasico = alvoLocal;
			} else if (
				forceRef &&
				(forceRef.startsWith("GOVERNADOR:") ||
					forceRef.startsWith("PREFEITO:") ||
					forceRef.startsWith("PRESIDENTE:"))
			) {
				const partesGov = forceRef.split(":");
				const cargoTipo = partesGov[0]; // GOVERNADOR, PREFEITO or PRESIDENTE
				const ufGov = partesGov.length >= 2 ? partesGov[1].toUpperCase() : "BR";
				const nomeGov = partesGov.length >= 3 ? partesGov[2] : nomeParaBusca;
				let cTse = "11";
				if (cargoTipo === "GOVERNADOR") cTse = "3";
				if (cargoTipo === "PRESIDENTE") cTse = "1";

				// Tenta buscar o documento no TSE dinamicamente
				sendEvent("STATUS", {
					msg: `Buscando ${cargoTipo} "${nomeGov}" na base eleitoral TSE...`,
				});
				const tseDados = await buscarCpfNoTSE(nomeGov, ufGov, cTse);
				const docId =
					tseDados?.documentoPrincipal?.replace(/\D/g, "") || nomeGov;
				deputadoBasico = {
					id: docId,
					uri: "",
					nome: tseDados?.nome || nomeGov,
					uf: ufGov,
					idLegislatura: tseDados?.anoEleicao || 2023,
					casa:
						cargoTipo === "PRESIDENTE"
							? "PRESIDENCIA_DA_REPUBLICA"
							: cargoTipo === "GOVERNADOR"
								? "GOVERNO_ESTADUAL"
								: "PREFEITURA",
				};
				// Preserva os dados do TSE para o nó PESSOA
				(deputadoBasico as any)._tseResult = tseDados;
			}
			if (!deputadoBasico) {
				sendEvent("ERROR", {
					mensagem: `Parlamentar ref ${forceRef} não encontrado.`,
				});
				safeClose();
				return;
			}
		}

		// Tenta pegar o CPF da API da Câmara. Se for do Senado, vem nulo.
		let detalhes = null;
		if (
			deputadoBasico.casa === "CAMARA" &&
			!Number.isNaN(Number(deputadoBasico.id))
		) {
			try {
				detalhes = await buscarDetalhesPolitico(Number(deputadoBasico.id));
			} catch (_e) {
				console.log("[API Câmara Falhou, ignorando detalhes...]");
			}
		}
		const possivelDoc = String(deputadoBasico.id).replace(/\D/g, "");

		// SEMPRE bate no TSE para resgatar o Patrimônio e Nome Civil (mesmo se o documento vier da ref)
		sendEvent("STATUS", {
			msg: "Extraindo dados complementares e patrimônio na base eleitoral do TSE...",
		});
		// Regras da alçada numa tabela só (cargo TSE, rótulo, esfera, fontes): services/core/alcada.ts
		const perfilAlcada = perfilDaCasa(deputadoBasico.casa, deputadoBasico.uf);
		const codigoCargoTse = perfilAlcada.cargoTse;
		const nomeParaTSE = deputadoBasico.nome
			.replace(/\s*\(.*?\)\s*/g, "")
			.trim();
		// No municipal, a busca no TSE fica no município da ref (antes valia o 1º município com o nome).
		const municipioDoAlvo = perfilAlcada.esfera === "MUNICIPAL" ? deputadoBasico.uri : undefined;
		// Eleito da ref na base tse_eleitos (Banco de Perfil), pelo número do candidato ou CPF.
		const [tseResult, eleitoDaRef] = await Promise.all([
			buscarCpfNoTSE(nomeParaTSE, deputadoBasico.uf, codigoCargoTse, detalhes?.nomeCivil, municipioDoAlvo),
			buscarEleitoDoAlvo({ id: deputadoBasico.id, cpfOficial: detalhes?.cpf, nome: nomeParaTSE, uf: deputadoBasico.uf, cargoTse: codigoCargoTse }).catch(() => null),
		]);

		// Identidade verificada (v2): documento válido, confiança e se os dados do TSE são da
		// mesma pessoa. Nunca adota CPF achado só pelo nome (ver services/core/identidade.ts).
		const identidade = resolverIdentidade({
			cpfOficial: detalhes?.cpf,
			docDaRef: possivelDoc,
			tse: tseResult,
			eleito: eleitoDaRef,
		});
		const cpfLimpo = identidade.documento;
		const documentoIsCnpj = identidade.documentoIsCnpj;
		for (const conflito of identidade.conflitos) {
			sendEvent("STATUS", { msg: `[IDENTIDADE] ${conflito}` });
		}
		if (identidade.usarDadosTse && tseResult?.nome) {
			detalhes = detalhes || ({} as any);
			detalhes!.nomeCivil = tseResult.nome;
		}
		if (documentoIsCnpj) {
			sendEvent("STATUS", {
				msg: `[LGPD] Apenas CNPJ de Campanha disponível nativamente. Buscas de patrimônio pessoal limitadas.`,
			});
		}

		// Armazena o resultado do TSE para uso posterior (patrimônio, foto, partido) — só se for a mesma pessoa
		(deputadoBasico as any)._tseResult = identidade.usarDadosTse ? tseResult : null;
		const pessoaId = `pessoa-${cpfLimpo ?? deputadoBasico.id}`;
		// Contratos do órgão do mandato e da própria casa no PNCP (~20 s por página): começa já, em paralelo; emite no fim.
		const coletaEnte = coletarContratosDoMandato({
			esfera: perfilAlcada.esfera, uf: deputadoBasico.uf, codIbge: eleitoDaRef?.cd_municipio_ibge, municipio: (deputadoBasico as any)._nomeMunicipio,
			cargoTse: perfilAlcada.cargoTse,
		});

		// Se o documento é um CNPJ de campanha, pula a investigação de patrimônio pessoal profunda (mas mantém o que veio do TSE)
		sendEvent("STATUS", {
			msg: !cpfLimpo
				? `Documento do político não confirmado: consultas por CPF (sanções, TCU, processos) serão puladas.`
				: documentoIsCnpj
				? `CNPJ de Campanha capturado (${cpfLimpo}). Usando dados declarados ao TSE...`
				: `CPF capturado (${cpfLimpo}). Investigando Ficha Limpa, TCU e Processos Judiciais...`,
		});
		const tseData = (deputadoBasico as any)._tseResult;
		const fichaPolitico = await investigarPolitico(
			cpfLimpo ?? "",
			deputadoBasico.nome,
			deputadoBasico.uf,
			pessoaId,
			sendEvent,
			perfilAlcada.cargoTse,
		);

		// Resolução resiliente do patrimônio do político (TSE DivulgaCand + Fallback em cascata Supabase)
		const { resolverPatrimonioTSE } = await import("@/services/integrations/tse/bens");
		await resolverPatrimonioTSE(
			fichaPolitico,
			tseData,
			cpfLimpo ?? "",
			deputadoBasico.nome,
			sendEvent,
			detalhes?.nomeCivil,
		);

		if (documentoIsCnpj && fichaPolitico.patrimonioTotal === 0) {
			fichaPolitico.alertasPessoais.push(
				"[LGPD] Patrimônio pessoal oculto no TSE (Apenas CNPJ de Campanha disponível).",
			);
		}
		const cargoDisplay = perfilAlcada.cargoDisplay;
		const pessoaNodePayload = {
			id: pessoaId,
			type: "PESSOA",
			data: {
				label: deputadoBasico.nome,
				nomeCivil: detalhes?.nomeCivil || deputadoBasico.nome,
				// Envia o cpfLimpo validado. O frontend formata com regex de acordo with isCnpj.
				cpf: documentoValido(cpfLimpo) ? cpfLimpo : undefined,
				documentoPrincipal:
					documentoValido(cpfLimpo) ? cpfLimpo : undefined,
				isCnpj: documentoIsCnpj,
				uf: deputadoBasico.uf,
				cargo: cargoDisplay,
				idLegislatura: deputadoBasico.idLegislatura,
				casa: deputadoBasico.casa,
				patrimonio: (fichaPolitico.patrimonioTotal && fichaPolitico.patrimonioTotal > 0)
					? fichaPolitico.patrimonioTotal
					: (tseData?.patrimonioTotal && tseData.patrimonioTotal > 0)
						? tseData.patrimonioTotal
						: (fichaPolitico.patrimonioTotal ?? tseData?.patrimonioTotal ?? 0),
				anoPatrimonio: fichaPolitico.anoPatrimonio || tseData?.anoEleicao || undefined,
				patrimonioAnterior: fichaPolitico.patrimonioAnterior ?? tseData?.patrimonioAnterior,
				anoPatrimonioAnterior: fichaPolitico.anoPatrimonioAnterior || tseData?.anoPatrimonioAnterior,
				variacaoPatrimonio: fichaPolitico.variacaoPatrimonio ?? tseData?.variacaoPatrimonio,
				variacaoPatrimonioPercentual: fichaPolitico.variacaoPatrimonioPercentual ?? tseData?.variacaoPatrimonioPercentual,
				historicoPatrimonio: (fichaPolitico.historicoPatrimonio && fichaPolitico.historicoPatrimonio.length > 0)
					? fichaPolitico.historicoPatrimonio
					: (tseData?.historicoPatrimonio || []),
				bensDeclarados: (fichaPolitico.bensDeclarados && fichaPolitico.bensDeclarados.length > 0)
					? fichaPolitico.bensDeclarados
					: (tseData?.bensDeclarados || []),
				alertasPessoais: fichaPolitico.alertasPessoais,
				afastamento: deputadoBasico.afastamento,
				urlFoto: deputadoBasico.urlFoto || (deputadoBasico as any)._tseResult?.urlFoto,
				partido: (deputadoBasico as any).partido || (deputadoBasico as any)._tseResult?.partido,
				idPoliticoOriginal: deputadoBasico.id,
				identidade: {
					confianca: identidade.confianca,
					evidencias: identidade.evidencias,
					conflitos: identidade.conflitos,
					sqCandidato: identidade.sqCandidato,
				},
			},
		};
		sendEvent("NODE_NOVO", pessoaNodePayload);
		supabaseNodes.push(pessoaNodePayload);

		// ==========================================
		// PARCIAL CACHE: Cria a linha no DB Cedo!
		// ==========================================
		let dbSearchId: string | null = null;
		const isDev = process.env.NODE_ENV === "development";
		const chaveCacheDeSalvamento = refParam
			? `${nomeParaBusca}_${refParam}`
			: nomeParaBusca;
		if (!isDev) {
			try {
				const { data, error } = await supabaseAdmin
					.from("pesquisas")
					.upsert(
						{
							termo_busca: chaveCacheDeSalvamento,
							cpf_raiz: documentoValido(cpfLimpo) ? cpfLimpo : null,
							grafo_dados: {
								timestamp: new Date().toISOString(),
								nodes: supabaseNodes,
								escopo: deputadoBasico?.casa || "GLOBAL",
								partial: true,
							},
						},
						{ onConflict: "termo_busca" },
					)
					.select("id")
					.single();
				if (data?.id) dbSearchId = data.id;
				if (error) console.error("[Partial Cache Init Error]", error);
			} catch (e) {
				console.error("[Partial Cache Init Error]", e);
			}
		}


		// ==========================================
		// CONTAGEM DE PESQUISAS (Dashboard "Mais Investigados")
		// ==========================================
		try {
			const nomeNormalizado = deputadoBasico.nome.toLowerCase().trim();
			await supabaseAdmin.rpc("incrementar_pesquisa", {
				p_nome: nomeNormalizado,
				p_id_politico: String(deputadoBasico.id || ""),
				p_casa: deputadoBasico.casa || "GLOBAL",
				p_ref: refParam || null,
				p_partido: (deputadoBasico as any).partido || tseData?.partido || null,
				p_uf: deputadoBasico.uf || tseData?.uf || null,
				p_cargo: cargoDisplay || null,
				p_foto_url: (deputadoBasico as any).urlFoto || deputadoBasico.urlFoto || tseData?.urlFoto || null,
			});
		} catch (_e) {
			// Silencioso — contagem é telemetria, não deve travar investigação
		}

		// Pré-Passo CGU/BrasilAPI: SKIP para executivos (Deep OSINT já faz essas chamadas adiante)
		const isExecutivo = perfilAlcada.executivo;
		if (documentoValido(cpfLimpo) && !isExecutivo) {
			sendEvent("STATUS", {
				msg: `Cruzando documento ${cpfLimpo} nas bases da CGU e Receita Federal...`,
			});
			if (typeof buscarReceitasFederais === "function") {
				await buscarReceitasFederais(cpfLimpo!, pessoaId, sendEvent);
			}

			// Só expande malha se não for CNPJ (pessoas físicas)
			if (!documentoIsCnpj && typeof expandirMalhaSocietaria === "function") {
				await expandirMalhaSocietaria(cpfLimpo!, pessoaId, sendEvent);
			}
		}



		// NOVO PASSO: Integração com Diários Oficiais para cargos 11 e 13
		if (
			deputadoBasico.casa === "PREFEITURA" ||
			String(deputadoBasico.casa).startsWith("CAMARA_MUNICIPAL")
		) {
			await investigarDiariosOficiais(
				deputadoBasico.nome,
				deputadoBasico.uf,
				pessoaId,
				sendEvent,
				supabaseNodes,
				eleitoDaRef?.cd_municipio_ibge,
			);
		}

		// Prepara contexto normativo comum
		// Governador e assembleias agora são ESTADUAL (antes caíam em FEDERAL e o prompt usava a cota da Câmara).
		const esferaPolitico = perfilAlcada.esfera;

		// PASSO 2: Emendas Parlamentares (Extração Completa)
		sendEvent("STATUS", {
			msg: "Rastreando emendas parlamentares em todas as legislaturas disponíveis...",
		});
		// Emendas por nome do autor só para quem apresenta emenda federal (deputado federal e senador).
		// Antes rodava para todo cargo e trazia emendas de homônimos federais.
		const { emendas, resumo: resumoEmendas } = perfilAlcada.emendasPorAutor
			? await buscarEmendas(deputadoBasico.nome)
			: { emendas: [] as any[], resumo: null as any };
		if (!perfilAlcada.emendasPorAutor) {
			sendEvent("STATUS", { msg: `Emendas parlamentares federais por autor: não se aplica a ${perfilAlcada.cargoDisplay}.` });
		}
		// Emite nó de resumo totalizador antes das emendas individuais
		if (resumoEmendas && resumoEmendas.totalEmendas > 0) {
			const resumoId = `emenda-resumo-${pessoaId}`;
			const resumoPayload = {
				id: resumoId,
				type: "EMENDA_RESUMO",
				_origemId: pessoaId,
				data: {
					label: `EMENDAS PARLAMENTARES (${resumoEmendas.totalEmendas})`,
					totalEmendas: resumoEmendas.totalEmendas,
					totalEmpenhado: resumoEmendas.totalEmpenhado,
					totalPago: resumoEmendas.totalPago,
					percentualExecucao: resumoEmendas.percentualExecucao,
					fantasmas: resumoEmendas.fantasmas,
					emendasPIX: resumoEmendas.emendasPIX,
					porTipo: resumoEmendas.porTipo,
					topLocalidades: resumoEmendas.topLocalidades,
					alertas: resumoEmendas.alertas,
				},
			};
			sendEvent("NODE_NOVO", resumoPayload);
			supabaseNodes.push(resumoPayload);
			sendEvent("STATUS", {
				msg: `${resumoEmendas.totalEmendas} emendas encontradas. Total empenhado: R$ ${resumoEmendas.totalEmpenhado.toLocaleString("pt-BR")} | Execução: ${resumoEmendas.percentualExecucao}%`,
			});
		}

		// PASSO 2.1: TransfereGov (Emendas PIX detalhadas)
		sendEvent("STATUS", {
			msg: "Rastreando detalhamento de Emendas PIX no TransfereGov...",
		});
		let transfereGov: any[] = [];
		try {
			let usedCache = false;
			const nomeBuscaTg = deputadoBasico.casa === "PREFEITURA" ? (deputadoBasico.uri?.length > 2 ? deputadoBasico.uri.replace(/-/g, " ") : deputadoBasico.nome) : deputadoBasico.nome;
			if (deputadoBasico.casa !== "PREFEITURA") {
				// Busca primeiro na base de dados (cache-first)
				try {
					const { data: emendasPix, error: emendasPixErr } = await supabaseAdmin
						.from("emendas_pix")
						.select("*")
						.eq("autor", deputadoBasico.nome);
					
					if (!emendasPixErr && emendasPix && emendasPix.length > 0) {
						sendEvent("STATUS", {
							msg: `[CACHE] Detalhamento de Emendas PIX recuperado instantaneamente do banco de dados.`,
						});
						transfereGov = emendasPix.map(e => ({
							numeroEmenda: "PIX",
							cnpjBeneficiario: "",
							nomeBeneficiario: e.municipio_destino,
							ufBeneficiario: e.uf_destino,
							areaPoliticaPublica: "Transferência Especial (PIX)",
							situacao: "Enviado",
							valorCusteio: Number(e.valor_custeio || 0),
							valorInvestimento: Number(e.valor_investimento || 0)
						}));
						usedCache = true;
					}
				} catch (err) {
					console.warn("[CACHE MISS] emendas_pix:", err);
				}
			}

			if (!usedCache) {
				if (deputadoBasico.casa === "PREFEITURA") {
					sendEvent("STATUS", {
						msg: `Rastreando Emendas PIX enviadas para o município de ${nomeBuscaTg.toUpperCase()}...`,
					});
					transfereGov = await buscarTransfereGovPorMunicipio(nomeBuscaTg);
				} else {
					transfereGov = await buscarTransfereGovPorAutor(nomeBuscaTg);
				}
			}
			if (transfereGov.length > 0) {
				const tgId = `transferegov-${pessoaId}`;
				const resumoPix = await gerarResumoEmendasPIX(deputadoBasico.nome);
				// Somatório TransfereGov
				const totalCusteio =
					resumoPix?.valorTotalCusteio ||
					transfereGov.reduce((acc, t) => acc + (t.valorCusteio || 0), 0);
				const totalInv =
					resumoPix?.valorTotalInvestimento ||
					transfereGov.reduce((acc, t) => acc + (t.valorInvestimento || 0), 0);
				const numEmendas = resumoPix?.totalEmendas || transfereGov.length;
				const tgPayload = {
					id: tgId,
					type: "EMENDA_RESUMO",
					// Reutilizando a cor/shape do resumo de emendas
					_origemId: pessoaId,
					data: {
						label: `TRANSFEREGOV: EMENDAS PIX (${numEmendas})`,
						totalEmendas: numEmendas,
						totalEmpenhado: totalCusteio + totalInv,
						alertas: [
							`Mapeadas ${numEmendas} transferências especiais diretas (Emendas PIX).`,
							`Custeio: R$ ${totalCusteio.toLocaleString("pt-BR")}`,
							`Investimento: R$ ${totalInv.toLocaleString("pt-BR")}`,
						],
					},
				};
				sendEvent("NODE_NOVO", tgPayload);
				supabaseNodes.push(tgPayload);
			} else {
				// Fallback: Se a API falhou (ex: 502 Bad Gateway), tenta resgatar do cache Supabase de pesquisas antigas
				try {
					if (podeLerCachePesquisas()) {
						const { supabaseAdmin } = await import("@/lib/supabase-admin");
						const chaveCacheDeLeitura = refParam
							? `${nomeParaBusca}_${refParam}`
							: nomeParaBusca;
						const { data: cacheData } = await supabaseAdmin
							.from("pesquisas")
							.select("grafo_dados")
							.eq("termo_busca", chaveCacheDeLeitura)
							.order("atualizado_em", {
								ascending: false,
							})
							.limit(1)
							.single();
						if (cacheData?.grafo_dados?.nodes) {
							const cachedTgNode = cacheData.grafo_dados.nodes.find(
								(n: any) =>
									n.type === "EMENDA_RESUMO" &&
									n.data?.label?.includes("TRANSFEREGOV"),
							);
							if (cachedTgNode) {
								sendEvent("STATUS", {
									msg: `TransfereGov offline. Resgatando dados de Emendas PIX do cache...`,
								});
								// Ajusta o id e _origemId para o grafo atual
								cachedTgNode.id = `transferegov-cache-${pessoaId}`;
								cachedTgNode._origemId = pessoaId;
								malhaOsintBuffer.push(cachedTgNode);
								supabaseNodes.push(cachedTgNode);
							}
						}
					}
				} catch (err) {
					console.warn("Erro no fallback do TransfereGov", err);
				}
			}
		} catch (e) {
			console.error("[TransfereGov Error]", e);
			// Fonte fora do ar é aviso de status, não achado: antes virava um nó
			// vermelho (score 86) no Canvas, como se fosse indício contra o político.
			sendEvent("STATUS", {
				msg: `Falha na conexão com o TransfereGov (API offline). Emendas PIX não consultadas nesta investigação.`,
			});
		}

		// 2.2 SPU - Imóveis da União
		try {
			if (deputadoBasico.casa === "PREFEITURA") {
				const nomeMunic =
					deputadoBasico.uri && deputadoBasico.uri.length > 2
						? deputadoBasico.uri.replace(/-/g, " ")
						: deputadoBasico.nome;
				sendEvent("STATUS", {
					msg: `Consultando Patrimônio da União (SPU) em ${nomeMunic.toUpperCase()}...`,
				});
				const spuImoveis = await buscarImoveisMunicipioSupabase(
					nomeMunic,
					deputadoBasico.uf,
				);
				if (spuImoveis.length > 0) {
					// Soma o valor total
					const valorTotal = spuImoveis.reduce(
						(acc, i) => acc + (i.valor_imovel || 0),
						0,
					);
					const areaTotal = spuImoveis.reduce(
						(acc, i) => acc + (i.area_m2 || 0),
						0,
					);
					const spuPayload = {
						id: `spu-imoveis-${pessoaId}`,
						type: "CONTRATO",
						// Usa a cor/shape de contrato ou algo visualmente similar
						_origemId: pessoaId,
						data: {
							label: `Patrimônio SPU (${spuImoveis.length})`,
							fornecedor: `Governo Federal`,
							valor:
								valorTotal > 0
									? `R$ ${valorTotal.toLocaleString("pt-BR")}`
									: `Área: ${Math.round(areaTotal).toLocaleString("pt-BR")} m²`,
							motivo_ia: `Foram identificados ${spuImoveis.length} imóveis pertencentes à União neste município. É importante cruzar essa informação com licitações municipais para investigar possíveis ocupações ou alienações irregulares de áreas federais.`,
							score_letalidade: 20,
						},
					};
					sendEvent("NODE_NOVO", spuPayload);
					supabaseNodes.push(spuPayload);
				}
			}
		} catch (e: any) {
			console.error("[SPU Error]", e.message);
		}

		// AI Triage das Emendas antes de emitir
		if (emendas.length > 0) {
			sendEvent("STATUS", {
				msg: "Auditando proposições com API Groq/Gemini L1...",
			});
			const emendasAvaliadasPelaIA = await analisarEmendasComInteligencia(
				emendas,
				deputadoBasico.uf,
				esferaPolitico,
				deputadoBasico.casa,
			);

			// Emite emendas individuais enriquecidas
			// eslint-disable-next-line complexity
			emendasAvaliadasPelaIA.forEach((emenda: any, i: number) => {
				// Ignorar emendas 100% executadas no Canvas
				if (emenda._percentualExecucao === 100) {
					return;
				}
				const emendaId = `emenda-${emenda.codigoEmenda || i}`;
				const risco = emenda._riscoTipo || {
					nivel: "NORMAL",
					label: "Emenda Individual",
				};

				// Encontra beneficiário correspondente nas emendas PIX do TransfereGov se houver
				let beneficiario = null;
				if (transfereGov.length > 0) {
					const matchedTg = transfereGov.find(
						(tg) =>
							tg.numeroEmenda &&
							(String(tg.numeroEmenda).includes(String(emenda.codigoEmenda)) ||
								String(emenda.codigoEmenda).includes(String(tg.numeroEmenda))),
					);
					if (matchedTg) {
						beneficiario = {
							cnpj: matchedTg.cnpjBeneficiario,
							nome: matchedTg.nomeBeneficiario,
							uf: matchedTg.ufBeneficiario,
							area: matchedTg.areaPoliticaPublica,
							situacao: matchedTg.situacao,
						};
					}
				}
				const emendaPayload = {
					id: emendaId,
					type: "EMENDA",
					_origemId: pessoaId,
					data: {
						label: `EMENDA: ${emenda.localidadeDoGasto || emenda.funcao || "Função Não Informada"}`,
						objeto:
							emenda.localidadeDoGasto ||
							emenda.funcao ||
							"Localidade/Função Não Informada",
						valor: emenda._empenhado,
						codigo: emenda.codigoEmenda,
						ano: emenda.ano,
						tipo: risco.label,
						funcao: emenda.funcao || "Função Indisponível",
						subfuncao: emenda.subfuncao || "",
						programa: emenda.nomePrograma || "",
						valorPago: emenda._totalEfetivamentePago,
						valorLiquidado: emenda._liquidado,
						valorRestoInscrito: emenda._restoInscrito,
						valorRestoPago: emenda._restoPago,
						percentualExecucao: emenda._percentualExecucao,
						isFantasma: emenda._isFantasma,
						riscoNivel: risco.nivel,
						score_letalidade: emenda.score_letalidade ?? 20,
						motivo_ia:
							emenda.motivo_ia ??
							`Status Operacional | Pagamento: ${emenda._percentualExecucao}%`,
						classificacao: emenda.classificacao ?? "REGULAR_COM_RESSALVA",
						enquadramento_normativo: emenda.enquadramento_normativo ?? "-",
						fundamentacao_tecnica:
							emenda.fundamentacao_tecnica ??
							"Sem apontamento técnico profundo.",
						alertas: emenda._alertas,
						beneficiario: beneficiario,
					},
				};
				sendEvent("NODE_NOVO", emendaPayload);
				supabaseNodes.push(emendaPayload);
			});
		}

		// PASSO 2.6: CNPJ de Campanha TSE
		if ((deputadoBasico as any)._tseResult?.cnpjCampanha) {
			const cnpjCamp = (deputadoBasico as any)._tseResult.cnpjCampanha;
			const cnpjPayload = {
				id: `cnpj-campanha-${cnpjCamp}`,
				type: "EMPRESA" as const,
				_origemId: pessoaId,
				data: {
					label: "Comitê/CNPJ de Campanha",
					cnpj: cnpjCamp,
					situacao: "REGISTRO TSE",
					cnae: "Campanha Eleitoral",
				},
			};
			// Emissão única: vai só para o buffer (a triagem da malha emite o NODE_NOVO)
			malhaOsintBuffer.push(cnpjPayload);
			supabaseNodes.push(cnpjPayload);
		}

		// PASSO 3: Gasto Bruto CEAP
		sendEvent("STATUS", {
			msg: `Carregando lote massivo de Cotas do portal da ${deputadoBasico.casa}...`,
		});
		let despesasCruas = [];
		const teveTimeout = false;
		if (deputadoBasico.casa === "CAMARA") {
			despesasCruas = await buscarDespesasCamara(
				Number(deputadoBasico.id),
				sendEvent,
			);
		} else if (deputadoBasico.casa === "SENADO") {
			despesasCruas = await buscarDespesasSenado(
				deputadoBasico.id,
				deputadoBasico.nome,
				sendEvent,
			);
		} else if (
			deputadoBasico.casa === "CAMARA_MUNICIPAL_SP" ||
			deputadoBasico.casa === "CAMARA_MUNICIPAL_RJ" ||
			String(deputadoBasico.casa).startsWith("CAMARA_MUNICIPAL") ||
			deputadoBasico.casa === "PREFEITURA"
		) {
			const docTce = cpfLimpo ?? "";
			sendEvent("STATUS", {
				msg: `Roteando varredura TCE/ProxyOSINT para a alçada municipal (${deputadoBasico.uf})...`,
			});
			const brutasMunicipio = await buscarDespesasMunicipalMestre(
				deputadoBasico.uf,
				docTce,
				deputadoBasico.nome,
				deputadoBasico.uri,
				deputadoBasico.casa,
			);
			// Contratos do município inteiro (TCE) são contexto, não gasto do mandato:
			// só o que vem marcado como MANDATO (ex.: cota da CMRJ) vai para a triagem.
			const { mandato, ente } = separarPorNatureza(
				brutasMunicipio.map((d: any) => normalizarDespesa(d, { fonte: `TCE-${deputadoBasico.uf}`, natureza: "ENTE" })),
			);
			despesasCruas = mandato;
			for (const noEnte of nosDeContratosDoEnte(ente, pessoaId)) {
				sendEvent("NODE_NOVO", noEnte);
			}
			if (ente.length > 0) {
				sendEvent("STATUS", {
					msg: `${ente.length} contrato(s)/empenho(s) do órgão encontrados no TCE (contexto; não são gastos do mandato).`,
				});
			}
			if (deputadoBasico.casa === "CAMARA_MUNICIPAL_RJ") {
				sendEvent("STATUS", {
					msg: `Consultando API de Servidores da CMRJ...`,
				});
				const servidoresCMRJ = await buscarServidoresCMRJ(deputadoBasico.nome);

				// Transforma os servidores da CMRJ em Nodes (emissão única via buffer):
				servidoresCMRJ.forEach((serv: any, i: number) => {
					const servPayload = {
						id: `servidor-cmrj-${Date.now()}-${i}`,
						type: "PESSOA",
						_origemId: pessoaId,
						data: {
							label: serv.nome,
							cargo: serv.cargo,
							salario: serv.salario,
							vinculo: serv.tipoVinculo,
							score_letalidade: 10,
							motivo_ia: `Servidor do gabinete do vereador na CMRJ.`,
						},
					};
					malhaOsintBuffer.push(servPayload);
					supabaseNodes.push(servPayload);
				});
				const nomeVereadorLimpo =
					(deputadoBasico as any)._tseResult?.nomeUrna || deputadoBasico.nome;

				// Busca o total e as despesas da cota no banco
				sendEvent("STATUS", {
					msg: `Extraindo gastos da Cota de Gabinete para a malha...`,
				});
				const { data: cotaDespesas, error: cotaErr } = await supabaseAdmin
					.from("cmrj_despesas")
					.select("*")
					.ilike("vereador_nome", `%${nomeVereadorLimpo.trim()}%`)
					.order("data_despesa", {
						ascending: false,
					});
				let totalCota = 0;
				if (!cotaErr && cotaDespesas) {
					cotaDespesas.forEach((d: any) => (totalCota += Number(d.valor) || 0));
				}

				// Injeta APENAS o Nó Gatilho do Dashboard de Gastos (emissão única via buffer)
				const dashPayload = {
					id: `dashboard-cota-cmrj-${Date.now()}`,
					type: "RESUMO_GASTOS",
					_origemId: pessoaId,
					data: {
						label: "Raio-X de Gastos",
						valor: totalCota,
						ano: "Ver Dashboard",
						nomeVereador: nomeVereadorLimpo,
						// usado para a API do dashboard
						score_letalidade: 0, // Nó neutro
					},
				};
				malhaOsintBuffer.push(dashPayload);
				supabaseNodes.push(dashPayload);
			}
			// IMPORTANTE: Por ora o Mestre consolida as empresas societárias num payload simplificado.
			// Se houver necessidade de manter os nós de "EMPRESA" separados, a função Proxy precisa ser tratada via Stream.
		} else if (deputadoBasico.casa === "ALERJ") {
			// Enrichment via DOCIGP (perfil público)
			sendEvent("STATUS", {
				msg: "Consultando sistema DOCIGP da ALERJ (Descentralização Orçamentária)...",
			});
			const perfilDocigp = await buscarPerfilDOCIGP(
				deputadoBasico.nome,
				sendEvent,
			);
			if (perfilDocigp) {
				sendEvent("STATUS", {
					msg: `DOCIGP: ${perfilDocigp.apelido} (${perfilDocigp.partido}) — Mandato ${perfilDocigp.temMandato ? "ATIVO" : "INATIVO"}`,
				});
			}

			// Despesas de gabinete pela base do DOCIGP (Banco de Perfil): src/services/integrations/alerj/despesas-base.ts.
			// O nó do Órgão (ALERJ) continua para o deep dive manual no painel.
			despesasCruas = await despesasAlerjParaOPipe(deputadoBasico.nome, sendEvent);
			sendEvent("STATUS", {
				msg: "Instanciando núcleo da Assembleia Legislativa do RJ...",
			});
			const orgaoId = `orgao-alerj-${Date.now()}`;
			const orgaoPayload = {
				id: orgaoId,
				type: "ORGAO",
				_origemId: pessoaId,
				data: {
					label: "ALERJ - Assembleia Legislativa do Estado do RJ",
					esfera: "Estadual",
					nomePolitico: deputadoBasico.nome,
					casa: "ALERJ",
				},
			};
			malhaOsintBuffer.push(orgaoPayload);
			supabaseNodes.push(orgaoPayload);
		} else if (deputadoBasico.casa === "ALESP") {
			sendEvent("STATUS", {
				msg: "Buscando Cotas da Assembleia Legislativa de São Paulo (ALESP)...",
			});
			despesasCruas = await buscarDespesasDeputadoEstadualSP(
				String(deputadoBasico.id),
				deputadoBasico.nome,
				sendEvent,
			);
		} else if (deputadoBasico.casa === "GOVERNO_ESTADUAL") {
			sendEvent("STATUS", {
				msg: "Governador detectado. Foco exclusivo em repasses federais transversais...",
			});
			despesasCruas = [];
		} else if (deputadoBasico.casa === "ASSEMBLEIA_LEGISLATIVA") {
			// Deputado estadual fora de SP/RJ: fonte por UF (MG = ALMG, DF = CLDF pelo CPF); sem fonte, o log diz isso.
			despesasCruas = await despesasDaAssembleia(deputadoBasico.uf, { nome: deputadoBasico.nome, cpf: cpfLimpo }, sendEvent);
		}

		// =========================================================
		// [NOVO] DEEP OSINT PARA TODAS AS ALÇADAS (Federal, Estadual, Municipal)
		// =========================================================

		// A. Investigar Ficha Limpa e Patrimônio (CGU/TSE)
		// Usaremos a `fichaPolitico` que já foi extraída no topo da requisição para não duplicar tempo de DATAJUD!

		// A.5. Investigação Nativa Jurisprudencial (TCE-PA e TCE-TO)
		if (deputadoBasico.uf === "PA") {
			sendEvent("STATUS", {
				msg: "Alvo do Pará detectado. Realizando scraping de Jurisprudência no TCE-PA...",
			});
			const acordaos = await buscarAcordaosTcePA(deputadoBasico.nome);
			if (acordaos.length > 0) {
				sendEvent("STATUS", {
					msg: `[TCE-PA] Foram encontrados ${acordaos.length} Acórdão(s)/Processo(s) atrelados ao nome do político.`,
				});
				acordaos.forEach((acordao, i) => {
					const nodePayload = {
						id: `acordao-pa-${Date.now()}-${i}`,
						type: "PROCESSO_JUDICIAL",
						_origemId: pessoaId,
						data: {
							label: acordao.titulo,
							resumo: acordao.resumo,
							data: acordao.dataPublicacao,
							url: acordao.url,
							ementa: acordao.ementa,
							tribunal: "TCE-PA",
						},
					};
					malhaOsintBuffer.push(nodePayload);
					supabaseNodes.push(nodePayload);
				});
			}
		}
		if (deputadoBasico.uf === "TO") {
			sendEvent("STATUS", {
				msg: "Alvo de Tocantins detectado. Vasculhando processos no TCE-TO (e-Contas)...",
			});
			const processosTO = await buscarProcessosTceTo(deputadoBasico.nome);
			if (processosTO.length > 0) {
				sendEvent("STATUS", {
					msg: `[TCE-TO] ${processosTO.length} processos de contas/denúncia detectados.`,
				});
				processosTO.forEach((proc, i) => {
					const nodePayload = {
						id: `processo-to-${Date.now()}-${i}`,
						type: "PROCESSO_JUDICIAL",
						_origemId: pessoaId,
						data: {
							label: proc.numero_processo,
							resumo: proc.assunto,
							tribunal: "TCE-TO",
							ano: proc.ano,
							motivo_ia: `Processo de ${proc.assunto} referente ao ano de ${proc.ano}. Relator: ${proc.relator}.`,
						},
					};
					malhaOsintBuffer.push(nodePayload);
					supabaseNodes.push(nodePayload);
				});
			}
		}
		if (fichaPolitico.sancoesCgu) {
			sendEvent("STATUS", {
				msg: "[ALERTA MÁXIMO] O CPF do político consta no Cadastro de Inidôneos/Sancionados da CGU!",
			});
		}

		// B. Buscar receitas governamentais vinculadas ao nome/cpf dele
		sendEvent("STATUS", {
			msg: "Vasculhando repasses diretos e contratos federais ao político na CGU...",
		});
		await buscarReceitasFederais(
			cpfLimpo ?? "",
			pessoaId,
			sendEvent,
		);

		// B2. Buscar Gastos com Cartão Corporativo (CPGF)
		sendEvent("STATUS", {
			msg: "Analisando faturas de Cartão de Pagamento do Governo Federal (CPGF)...",
		});
		await buscarCartaoCorporativo(
			cpfLimpo ?? "",
			pessoaId,
			sendEvent,
			deputadoBasico.casa,
		);

		// B3. Buscar Viagens a Serviço (Voos FAB / Diárias)
		sendEvent("STATUS", {
			msg: "Rastreando Viagens a Serviço e Voos da FAB financiados com recursos públicos...",
		});
		await buscarViagensFAB(
			cpfLimpo ?? "",
			pessoaId,
			sendEvent,
			deputadoBasico.casa,
		);

		// C. Expandir Malha Societária
		sendEvent("STATUS", {
			msg: "Expandindo malha societária via BrasilAPI para rastrear blindagem patrimonial...",
		});
		const empresasRelacionadasCNPJs = await expandirMalhaSocietaria(
			cpfLimpo ?? "",
			pessoaId,
			sendEvent,
		);

		// C2. Busca reversa por nome — encontra empresas onde o político é sócio
		sendEvent("STATUS", {
			msg: `Fazendo busca reversa de empresas vinculadas ao nome "${deputadoBasico.nome}"...`,
		});
		try {
			const { buscarEmpresasDoSocio } = await import(
				"@/services/core/socio-search"
			);
			const empresasPorNome = await buscarEmpresasDoSocio(deputadoBasico.nome);
			if (empresasPorNome && empresasPorNome.length > 0) {
				// ANTI-FALSO-POSITIVO: a busca reversa por nome é fraca (homônimos). A empresa só
				// entra se o QSA confirmar nome e, com CPF confirmado, os 6 dígitos do meio do CPF
				// (services/core/socio-confirmacao.ts).
				const nomesRef = nomesDeReferencia([
					detalhes?.nomeCivil,
					(deputadoBasico as any)._tseResult?.nome,
					(deputadoBasico as any)._tseResult?.nomeUrna,
					deputadoBasico.nome,
				]);
				let confirmadas = 0;
				for (const emp of empresasPorNome) {
					if (!emp) continue;
					const cnpjEmp = (emp.cnpj || "").replace(/\D/g, "");
					if (!cnpjEmp || empresasRelacionadasCNPJs.includes(cnpjEmp))
						continue;

					const veredito = await verificarEmpresaDoPolitico(cnpjEmp, nomesRef, identidade.cpf);
					if (!veredito.confirmado) {
						sendEvent("STATUS", {
							msg: `[OSINT] "${emp.razao_social || cnpjEmp}" descartada: ${veredito.motivo} (proteção anti-homônimo).`,
						});
						continue;
					}

					confirmadas++;
					empresasRelacionadasCNPJs.push(cnpjEmp);
					const devEmpresaRev = {
						id: `empresa-rev-${cnpjEmp}`,
						type: "EMPRESA",
						_origemId: pessoaId,
						data: {
							label: emp.razao_social || "Empresa Localizada",
							cnpj: cnpjEmp,
							situacao: emp.situacao || "N/I",
							cnae: emp.cnae || "N/I",
							motivo_ia: `Vínculo societário confirmado via QSA: ${veredito.motivo}.`,
							forcaVinculo: veredito.forca,
						},
					};
					// Mesmo objeto completo no buffer de stream e no cache persistido
					malhaOsintBuffer.push(devEmpresaRev);
					supabaseNodes.push(devEmpresaRev);
				}
				if (confirmadas > 0) {
					sendEvent("STATUS", {
						msg: `[OSINT] ${confirmadas} empresa(s) com vínculo societário CONFIRMADO via QSA.`,
					});
				}
			}
		} catch (e) {
			console.warn("[Deep OSINT] Falha na busca reversa por nome:", e);
		}

		// D. Loop para cada empresa identificada investigar recebimentos em PARALELO
		if (empresasRelacionadasCNPJs && empresasRelacionadasCNPJs.length > 0) {
			sendEvent("STATUS", {
				msg: `Localizadas ${empresasRelacionadasCNPJs.length} empresa(s). Varrendo base de Convênios do Transferegov para cada uma em paralelo...`,
			});
			const investigacoesEmpresas = empresasRelacionadasCNPJs.map(
				async (cnpjRastreado) => {
					sendEvent("STATUS", {
						msg: `[OSINT] Checando contratos federais para o CNPJ: ${cnpjRastreado}`,
					});
					await buscarReceitasFederais(
						cnpjRastreado,
						`empresa-${cnpjRastreado}`,
						sendEvent,
					);
					const convenios = await buscarConveniosTransferegov(cnpjRastreado);
					if (convenios && convenios.quantidade > 0) {
						sendEvent("STATUS", {
							msg: `[ALTA SUSPEIÇÃO] A empresa privada (${cnpjRastreado}) possui ${convenios.quantidade} convênio(s) federal(is) ativos milionários.`,
						});
						const convPayload = {
							id: `convenio-${cnpjRastreado}-${Date.now()}`,
							type: "CONTRATO",
							_origemId: `empresa-${cnpjRastreado}`,
							data: {
								label: "Convênio Transferegov.br",
								objeto: `${convenios.quantidade} convênios ativos milionários.`,
								valor: convenios.valorTotal,
								codigo: cnpjRastreado,
								ano: "Atual",
							},
						};
						malhaOsintBuffer.push(convPayload);
						supabaseNodes.push(convPayload);
					}
				},
			);
			await Promise.allSettled(investigacoesEmpresas);
		} else {
			sendEvent("STATUS", {
				msg: "Nenhuma empresa vinculada com contratos federais abertos encontrada (BrasilAPI).",
			});
		}

		// E. Checagem ANAC/RAB — Busca aeronaves registradas em nome do político ou de suas empresas em PARALELO
		sendEvent("STATUS", {
			msg: "Varrendo Registro Aeronáutico Brasileiro (ANAC/RAB) por aeronaves vinculadas em paralelo...",
		});
		const alvosAnac = [deputadoBasico.nome];
		if (empresasRelacionadasCNPJs && empresasRelacionadasCNPJs.length > 0) {
			alvosAnac.push(...empresasRelacionadasCNPJs);
		}
		const investigacoesAnac = alvosAnac.map(async (alvoAnac) => {
			const aeronaves = await buscarAeronavesProprietario(alvoAnac);
			if (aeronaves.length > 0) {
				sendEvent("STATUS", {
					msg: `[ANAC] ${aeronaves.length} aeronave(s) localizada(s) vinculada(s) a "${alvoAnac}"!`,
				});
				for (const anv of aeronaves) {
					const anvPayload = {
						id: `anac-${anv.prefixo || Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
						type: "CONTRATO" as const,
						// Treat as asset/contract class visually
						_origemId: pessoaId,
						data: {
							label: `AERONAVE ${anv.prefixo || "N/I"}`,
							objeto: `Proprietário: ${anv.proprietario_nome || alvoAnac} | Modelo: ${anv.modelo || "N/I"} | Fabricante: ${anv.fabricante || "N/I"} | Status: ${anv.situacao || "N/I"}`,
							valor: 0,
							codigo: anv.prefixo || "ANAC",
							ano: "RAB/ANAC",
						},
					};
					malhaOsintBuffer.push(anvPayload);
					supabaseNodes.push(anvPayload);
				}
			}
		});
		await Promise.allSettled(investigacoesAnac);

		// E2. BNDES — Financiamentos subsidiados para empresas vinculadas ao político
		if (empresasRelacionadasCNPJs && empresasRelacionadasCNPJs.length > 0) {
			sendEvent("STATUS", {
				msg: "Consultando financiamentos do BNDES para empresas vinculadas ao político...",
			});
			try {
				const cnpjsParaBNDES = empresasRelacionadasCNPJs.slice(0, 5);
				const resultadosBNDES = await Promise.allSettled(
					cnpjsParaBNDES.map((cnpj) => buscarOperacoesBNDES(cnpj)),
				);
				for (let i = 0; i < resultadosBNDES.length; i++) {
					const res = resultadosBNDES[i];
					if (res.status === "fulfilled" && res.value && res.value.length > 0) {
						const cnpj = cnpjsParaBNDES[i];
						const ops = res.value;
						const totalBNDES = ops.reduce(
							(acc, op) => acc + (op.valor || 0),
							0,
						);
						sendEvent("STATUS", {
							msg: `[BNDES] ${ops.length} operação(ões) de financiamento para o CNPJ ${cnpj}. Total: R$ ${totalBNDES.toLocaleString("pt-BR")}`,
						});
						const bndesPayload = {
							id: `bndes-${cnpj}-${Date.now()}`,
							type: "CONTRATO" as const,
							_origemId: `empresa-${cnpj}`,
							data: {
								label: `Financiamento BNDES (${ops.length} op.)`,
								objeto: ops
									.slice(0, 3)
									.map((o) => `${o.produto || "N/I"} — ${o.situacao || "N/I"}`)
									.join(" | "),
								valor: totalBNDES,
								codigo: cnpj,
								ano: ops[0]?.data || "N/I",
								score_letalidade: 55,
								motivo_ia: `Empresa vinculada ao político recebeu financiamento subsidiado do BNDES.`,
							},
						};
						malhaOsintBuffer.push(bndesPayload);
						supabaseNodes.push(bndesPayload);
					}
				}
			} catch (errBNDES: any) {
				console.warn(
					"[BNDES] Erro ao consultar financiamentos:",
					errBNDES.message || errBNDES,
				);
			}
		}



		// E5. TCU — Certidões APF para empresas vinculadas
		if (empresasRelacionadasCNPJs.length > 0) {
			sendEvent("STATUS", {
				msg: "Consultando certidões unificadas no TCU para empresas...",
			});
			for (const cnpj of empresasRelacionadasCNPJs) {
				try {
					const certidao = await buscarCertidaoTCU(cnpj);
					if (certidao?.temInfracao) {
						const motivos = [];
						if (certidao.situacaoTcu !== "NADA_CONSTA")
							motivos.push(`TCU Inidôneos: ${certidao.situacaoTcu}`);
						if (certidao.situacaoCnj !== "NADA_CONSTA")
							motivos.push(`CNJ CNIA: ${certidao.situacaoCnj}`);
						if (certidao.situacaoCeis !== "NADA_CONSTA")
							motivos.push(`CGU CEIS: ${certidao.situacaoCeis}`);
						if (certidao.situacaoCnep !== "NADA_CONSTA")
							motivos.push(`CGU CNEP: ${certidao.situacaoCnep}`);
						const payload = {
							id: `tcu-certidao-${cnpj}-${Date.now()}`,
							type: "PROCESSO_JUDICIAL" as const,
							_origemId: pessoaId,
							data: {
								label: `Certidão Positiva APF: ${cnpj}`,
								tribunal: "TCU (Certidão Consolidada)",
								assunto: "Restrição em Base Federal",
								score_letalidade: 85,
								motivo_ia: `Empresa vinculada possui restrições ativas. Registros: ${motivos.join(" | ")}`,
							},
						};
						malhaOsintBuffer.push(payload);
						supabaseNodes.push(payload);
					}
				} catch (errCert: any) {
					console.warn(
						"[TCU] Erro ao buscar certidão para empresa:",
						errCert.message || errCert,
					);
				}
			}
		}

		// (Removido) TCE-RS para deputado federal: passava a URL da Câmara como município e virava
		// uma segunda consulta à CGU. TCE é fonte de alçada municipal (ver services/core/alcada.ts).

		// E3. SICONFI — Saúde fiscal do município alvo (LRF) — apenas para Prefeitos
		if (deputadoBasico.casa === "PREFEITURA" && deputadoBasico.uf) {
			sendEvent("STATUS", {
				msg: "Consultando indicadores fiscais LRF do município no SICONFI (Tesouro Nacional)...",
			});
			try {
				const nomeMunicipioAlvo =
					(deputadoBasico as any)._nomeMunicipio || deputadoBasico.nome;
				const enteSiconfi = await buscarEnteSiconfi(
					deputadoBasico.uf,
					nomeMunicipioAlvo,
				);
				if (enteSiconfi) {
					const anoAtual = new Date().getFullYear();
					const indicadores = await consultarIndicadoresLRF(
						enteSiconfi.cod_ibge,
						anoAtual,
					);
					if (indicadores) {
						const pctStr = indicadores.percentualDespesaPessoal.toFixed(1);
						const situMsg =
							indicadores.situacaoLimite === "EXCEDIDO"
								? `[ALERTA CRÍTICO LRF] Limite de gasto com pessoal EXCEDIDO: ${pctStr}% da RCL (limite: ${indicadores.limiteMaximoPercentual}%)`
								: indicadores.situacaoLimite === "PRUDENCIAL"
									? `[ALERTA LRF] Gasto com pessoal no limite prudencial: ${pctStr}% da RCL`
									: indicadores.situacaoLimite === "ALERTA"
										? `[AVISO LRF] Gasto com pessoal em nível de alerta: ${pctStr}% da RCL`
										: `[SICONFI] Gasto com pessoal dentro do limite LRF: ${pctStr}% da RCL`;
						sendEvent("STATUS", {
							msg: situMsg,
						});
						if (indicadores.situacaoLimite !== "NORMAL") {
							fichaPolitico.alertasPessoais.push(situMsg);
							const siconfiPayload = {
								id: `siconfi-${enteSiconfi.cod_ibge}-${Date.now()}`,
								type: "PROCESSO_JUDICIAL" as const,
								_origemId: pessoaId,
								data: {
									label: `Saúde Fiscal LRF: ${enteSiconfi.ente}`,
									tribunal: "Tesouro Nacional (SICONFI)",
									assunto: `Despesa com Pessoal ${pctStr}% — ${indicadores.situacaoLimite}`,
									score_letalidade:
										indicadores.situacaoLimite === "EXCEDIDO"
											? 85
											: indicadores.situacaoLimite === "PRUDENCIAL"
												? 65
												: 45,
									motivo_ia: `O município ${enteSiconfi.ente}/${enteSiconfi.uf} está com despesa de pessoal em ${pctStr}% da Receita Corrente Líquida (RCL: R$ ${indicadores.receitaCorrenteLiquidaAjustada.toLocaleString("pt-BR")}). Limite máximo LRF: ${indicadores.limiteMaximoPercentual}%.`,
								},
							};
							malhaOsintBuffer.push(siconfiPayload);
							supabaseNodes.push(siconfiPayload);
						}
					}
				}
			} catch (errSiconfi: any) {
				console.warn(
					"[SICONFI] Erro ao consultar indicadores LRF:",
					errSiconfi.message || errSiconfi,
				);
			}

			// E6. FNDE — Repasses Educacionais
			sendEvent("STATUS", {
				msg: "Consultando repasses educacionais do FNDE (PNAE/FUNDEB/PNATE)...",
			});
			try {
				const nomeMunicipioAlvo =
					(deputadoBasico as any)._nomeMunicipio || deputadoBasico.nome;
				const anoAtual = new Date().getFullYear();
				const [pnae, fundeb, pnate] = await Promise.all([
					consultarPNAE(nomeMunicipioAlvo, deputadoBasico.uf, anoAtual),
					consultarFUNDEB(nomeMunicipioAlvo, deputadoBasico.uf, anoAtual),
					consultarPNATE(deputadoBasico.uf, nomeMunicipioAlvo), // PNATE usa uf, municipio
				]);
				const labelFNDE = [];
				const infoPNAE =
					pnae.length > 0
						? `PNAE (Merenda): R$ ${(pnae[0].valorFnde || 0).toLocaleString("pt-BR")} para ${pnae[0].totalAlunos} alunos.`
						: "";
				if (infoPNAE) labelFNDE.push(infoPNAE);
				const infoFUNDEB =
					fundeb.length > 0
						? `FUNDEB: R$ ${(fundeb[0].valorRepasseEstimado || 0).toLocaleString("pt-BR")} (Est.) para ${fundeb[0].quantidadeMatriculas} matrículas.`
						: "";
				if (infoFUNDEB) labelFNDE.push(infoFUNDEB);
				const infoPNATE =
					pnate.length > 0
						? `PNATE (Transporte): Atende ${pnate[0].alunosAtendidos} alunos.`
						: "";
				if (infoPNATE) labelFNDE.push(infoPNATE);
				if (labelFNDE.length > 0) {
					const fndePayload = {
						id: `fnde-${deputadoBasico.uf}-${Date.now()}`,
						type: "CONTRATO" as const,
						_origemId: pessoaId,
						data: {
							label: `Repasses FNDE (${anoAtual})`,
							objeto: labelFNDE.join(" | "),
							valor:
								(pnae[0]?.valorFnde || 0) +
								(fundeb[0]?.valorRepasseEstimado || 0),
							codigo: "FNDE",
							ano: anoAtual.toString(),
							score_letalidade: 30,
							// Informativo contextual
							motivo_ia: `O município recebe repasses federais da educação (FNDE). Cruzamentos futuros podem verificar se há empresas financiadas desviando estes recursos.`,
						},
					};
					malhaOsintBuffer.push(fndePayload);
					supabaseNodes.push(fndePayload);
				}
			} catch (errFnde: any) {
				console.warn(
					"[FNDE] Erro ao consultar repasses:",
					errFnde.message || errFnde,
				);
			}
		}

		// E7. TransfereGov (Emendas PIX Diretas para Empresa)
		if (empresasRelacionadasCNPJs.length > 0) {
			sendEvent("STATUS", {
				msg: "Verificando se empresas vinculadas são beneficiárias diretas de Emendas PIX...",
			});
			for (const cnpj of empresasRelacionadasCNPJs) {
				try {
					const emendasDiretas = await buscarEmendasPorCNPJ(cnpj);
					if (emendasDiretas && emendasDiretas.length > 0) {
						const totalPix = emendasDiretas.reduce(
							(acc, curr) =>
								acc + (curr.valorCusteio || 0) + (curr.valorInvestimento || 0),
							0,
						);
						const fndePayload = {
							id: `emenda-pix-${cnpj}-${Date.now()}`,
							type: "CONTRATO" as const,
							_origemId: pessoaId,
							data: {
								label: `Recebedor de Emenda PIX: ${cnpj}`,
								objeto: `Foram localizadas ${emendasDiretas.length} emendas destinadas DIRETAMENTE para esta empresa.`,
								valor: totalPix,
								codigo: "TRANSFEREGOV",
								ano: emendasDiretas[0].ano || "N/I",
								score_letalidade: 95,
								// RED FLAG: Empresa ligada ao político recebendo emenda direta!
								motivo_ia: `ALERTA MÁXIMO: Uma empresa ligada diretamente ao político investigado está recebendo recursos públicos via Emendas PIX ou Transferências Especiais.`,
							},
						};
						malhaOsintBuffer.push(fndePayload);
						supabaseNodes.push(fndePayload);
					}
				} catch (errTg: any) {
					console.warn(
						"[TransfereGov] Erro ao buscar emendas para empresa:",
						errTg.message || errTg,
					);
				}
			}
		}

		// F. Siga o Dinheiro da Campanha (Follow the Money)
		sendEvent("STATUS", {
			msg: "Iniciando análise: 'Siga o Dinheiro da Campanha'...",
		});
		const tseDataFollow = (deputadoBasico as any)._tseResult;
		const cargoTse = perfilAlcada.cargoTse;
		const eleicaoIdTse = ["3", "5", "6", "7"].includes(cargoTse)
			? "2040602022"
			: "2045202024";

		// Se for municipal, precisa do código do município (idUe). Se for estadual, a UF basta.
		const localidadeCodigo =
			tseDataFollow?.idUe ||
			(deputadoBasico.casa === "GOVERNO_ESTADUAL"
				? deputadoBasico.uf
				: undefined);
		if (localidadeCodigo) {
			const doadoresCnpj = await buscarDoadoresTSE(
				deputadoBasico.nome,
				localidadeCodigo,
				cargoTse,
				eleicaoIdTse,
			);
			// Armazena para reutilização na segunda etapa (injeta no contexto da IA)
			(deputadoBasico as any)._doadoresTseCache = doadoresCnpj;
			const doadoresUnicosFornecedores = [
				...new Set(doadoresCnpj.filter((d: string) => d.length === 14)),
			].slice(0, 15);
			if (doadoresUnicosFornecedores.length > 0) {
				sendEvent("STATUS", {
					msg: `Identificados ${doadoresUnicosFornecedores.length} doadores CNPJ. Cruzando com contratos públicos (CGU e PNCP)...`,
				});
				const nosDoadores = await cruzarDoadoresComContratosPublicos(
					doadoresUnicosFornecedores,
					pessoaId,
					(msg) => sendEvent("STATUS", { msg }),
				);
				for (const noDoador of nosDoadores) {
					malhaOsintBuffer.push(noDoador);
					supabaseNodes.push(noDoador);
				}
			} else {
				sendEvent("STATUS", {
					msg: "Nenhum doador CNPJ identificado no TSE para este mandato.",
				});
			}
		}

		// BUSCA DOS DOADORES ANTES DA IA PARA INJETAR NO CONTEXTO
		sendEvent("STATUS", {
			msg: `Puxando financiadores de campanha no TSE...`,
		});
		const doadores = (deputadoBasico as any)._doadoresTseCache // Reutiliza resultado já buscado na etapa anterior
			? (deputadoBasico as any)._doadoresTseCache
			: await buscarDoadoresTSE(
					deputadoBasico.nome,
					deputadoBasico.uf,
					cargoTse,
					eleicaoIdTse,
				);

		// =====================================
		// EXPANSORES OSINT MASSIVOS (Projetos, PNCP, Processos, Gabinete)
		// =====================================
		sendEvent("STATUS", {
			msg: `Extraindo Projetos de Lei e Histórico Legislativo...`,
		});
		let proposicoesLegislativas: any[] = [];
		if (deputadoBasico.casa === "CAMARA") {
			proposicoesLegislativas = await buscarProjetosLeiCamara(
				deputadoBasico.id,
			);
		}
		sendEvent("STATUS", {
			msg: `Cruzando Financiadores no Portal Nacional de Contratações (PNCP)...`,
		});
		const contratosPNCPGlobais: any[] = [];
		const cnpjsPNCP: string[] = [];
		if (
			Array.isArray(doadores) &&
			doadores.length > 0 &&
			typeof doadores[0] === "string"
		) {
			// Doadores carregados do buscarDoadoresTSE no formato string de CNPJ/CPF (length === 14)
			cnpjsPNCP.push(
				...[...new Set(doadores as string[])]
					.filter((d) => d.length === 14)
					.slice(0, 5),
			);
		}
		if (cnpjsPNCP.length > 0) {
			const promessasPNCP = cnpjsPNCP.map((cnpj) =>
				buscarContratosPNCP(cnpj).then((ct) => {
					if (ct.length > 0)
						contratosPNCPGlobais.push({
							cnpj,
							contratos: ct,
						});
				}),
			);
			await Promise.allSettled(promessasPNCP);
		}

		// Injeta no malhaOsintBuffer como NÓS DE CONTEXTO TEXTUAL para a IA consumir
		if (proposicoesLegislativas.length > 0) {
			malhaOsintBuffer.push({
				_isContextOnly: true,
				tipoContexto: "PROJETOS_LEI_AUTORIA",
				projetos: proposicoesLegislativas,
			});
		}
		if (contratosPNCPGlobais.length > 0) {
			malhaOsintBuffer.push({
				_isContextOnly: true,
				tipoContexto: "CONTRATOS_MUNICIPAIS_DOADORES",
				contratosPNCP: contratosPNCPGlobais,
			});
			sendEvent("STATUS", {
				msg: `[OSINT] Localizados contratos municipais atrelados a financiadores recobrindo a malha na IA!`,
			});
		}

		// Cruzamento de Votos com Doadores de Campanha (Conflito de Interesse Legislativo)
		if (deputadoBasico.casa === "CAMARA" && Array.isArray(doadores) && doadores.length > 0) {
			const conflitosVotacoes = await analisarConflitoVotacoes(
				Number(deputadoBasico.id),
				doadores,
			);
			if (conflitosVotacoes.length > 0) {
				sendEvent("STATUS", {
					msg: `[CONFLITO LEGISLATIVO] Identificados ${conflitosVotacoes.length} voto(s) em matérias setoriais ligadas a financiadores de campanha!`,
				});
				malhaOsintBuffer.push({
					_isContextOnly: true,
					tipoContexto: "CONFLITOS_VOTACOES_DOADORES",
					conflitos: conflitosVotacoes,
				});
				for (const conf of conflitosVotacoes) {
					const conflitoNode = {
						id: `conflito-voto-${conf.idVotacao}-${Date.now()}`,
						type: "CONTRATO" as const,
						_origemId: pessoaId,
						data: {
							label: `VOTO EM PAUTA SETORIAL: ${conf.projetoTema}`,
							objeto: `${conf.motivoConflito} (Voto: ${conf.voto})`,
							valor: 0,
							codigo: conf.idVotacao,
							ano: conf.dataVotacao ? conf.dataVotacao.substring(0, 4) : "Legislatura",
							score_letalidade: 80,
							motivo_ia: conf.motivoConflito,
						},
					};
					supabaseNodes.push(conflitoNode);
					sendEvent("NODE_NOVO", conflitoNode);
				}
			}
		}

		// =====================================
		// DESPEJO DA MALHA OSINT NA INTELIGENCIA ARTIFICIAL
		// =====================================
		if (malhaOsintBuffer.length > 0) {
			sendEvent("STATUS", {
				msg: `[OSINT] Submetendo ${malhaOsintBuffer.length} achados para auditoria de fraude/lavagem (Global AI Triage)...`,
			});
			const malhaAvaliada = await analisarMalhaOsintComInteligencia(
				malhaOsintBuffer,
				deputadoBasico.uf || "N/I",
				esferaPolitico,
				deputadoBasico.casa,
			);
			malhaAvaliada.forEach((node: any) => {
				sendEvent("NODE_NOVO", node);
			});
		}
		if (despesasCruas.length === 0 && !teveTimeout) {
			sendEvent("STATUS", {
				msg: `Nenhuma despesa recente encontrada no portal da ${deputadoBasico.casa} para avaliação.`,
			});
		}
		if (despesasCruas.length > 0) {
			// PASSO 4: Triagem com IA passando a UF e os Doadores
			sendEvent("STATUS", {
				msg: "[POLÍGRAFO IA] Operando Triagem Documental e Cruzamento Geográfico...",
			});

			// ==========================================
			// HEARTBEAT SSE: Mantém a conexão viva enquanto a IA analisa silenciosamente
			// Evita Timeout do Vercel caso o modelo L2 (Gemini) demore 2+ minutos
			let aiSeconds = 0;
			const heartbeatInterval = setInterval(() => {
				aiSeconds += 15;
				sendEvent("STATUS", {
					msg: `[POLÍGRAFO IA] Triagem em progresso... (${aiSeconds}s) - Aguarde.`,
				});
			}, 15000);
			let despesasAvaliadas: any[] = [];
			try {
				despesasAvaliadas = await analisarLoteComInteligencia(
					// Formato único: a IA nunca mais recebe campos undefined de clientes com outros nomes.
					despesasCruas.map((d: any) => normalizarDespesa(d, { fonte: String(deputadoBasico.casa), natureza: "MANDATO" })),
					deputadoBasico.uf,
					doadores,
					esferaPolitico,
					deputadoBasico.casa,
				);
			} finally {
				clearInterval(heartbeatInterval);
			}

			// PASSO 5: Roteamento Baseado em Risco
			const frotaAnacCache = new Map<string, any[]>();
			const frotaAnacEmitida = new Set<string>();
			for (let i = 0; i < despesasAvaliadas.length; i++) {
				const d = despesasAvaliadas[i];
				let finalScore = d.score_letalidade || 50;
				let alertasFinais = [];
				let dadosSociais = {};

				// SE a IA achou muuuito suspeito, rodamos The Full OSINT nas bases de dados estatais
				if (finalScore >= 85) {
					sendEvent("STATUS", {
						msg: `[POLÍGRAFO] Aprofundando Dossiê no CNPJ: ${d.cnpjCpfFornecedor}...`,
					});
					const hardData = await investigarFornecedorNivelHard(
						d.cnpjCpfFornecedor,
					);
					finalScore += hardData.scorePenalidade; // Pode disparar pra 150
					if (finalScore > 100) finalScore = 100;
					alertasFinais = hardData.alertas;
					dadosSociais = {
						capitalSocial: hardData.capitalSocial,
						dataAbertura: hardData.dataAbertura,
						socios: hardData.socios,
					};

					// Consolidar alertas com a IA
					if (d.motivo_ia)
						alertasFinais.unshift(`[POLÍGRAFO IA]: ${d.motivo_ia}`);
				} else {
					// Gastos corriqueiros recebem apenas a resenha da IA e capital indisponível
					if (d.motivo_ia)
						alertasFinais.push(`[POLÍGRAFO IA INFO]: ${d.motivo_ia}`);
				}

				// -- LAZY LOADING OSINT: AERONAVES (ANAC) + FRETAMENTO DEEP --
				const textoBusca =
					`${d.tipoDespesa} ${d.nomeFornecedor} ${d.motivo_ia}`.toUpperCase();
				const isFretamento =
					/TÁXI AÉREO|AERONAVE|FRETAMENTO|CHARTER|VOO FRETADO|LOCAÇÃO.*AERONAVE/.test(
						textoBusca,
					);
				if (isFretamento || textoBusca.includes("LOCAÇÃO")) {
					// 1. Busca existente por prefixo de aeronave no texto da despesa
					const dadosAnac = await verificarAeronaveAnac(textoBusca);
					if (dadosAnac?.marca) {
						sendEvent("STATUS", {
							msg: `[OSINT LAZY] Aeronave suspeita detectada. Puxando Dossiê do prefixo ${dadosAnac.marca} na ANAC...`,
						});
						alertasFinais.push(
							`[ANAC/RAB] Aeronave Prefixo ${dadosAnac.marca} localizada. Proprietário: ${dadosAnac.proprietario_nome}. Status: ${dadosAnac.situacao_aeronavegabilidade}.`,
						);
						finalScore += 40;
					}

					// 2. NOVO: Se é fretamento e o fornecedor tem CNPJ, buscar frota da empresa de táxi aéreo
					if (isFretamento) {
						const cnpjForn = (d.cnpjCpfFornecedor || "").replace(/\D/g, "");
						if (cnpjForn.length === 14) {
							try {
								if (!frotaAnacCache.has(cnpjForn)) {
									sendEvent("STATUS", {
										msg: `[ANAC DEEP] Rastreando frota do fornecedor de táxi aéreo (CNPJ: ${cnpjForn})...`,
									});
									frotaAnacCache.set(
										cnpjForn,
										await buscarAeronavesProprietario(cnpjForn),
									);
								}
								const frotaFornecedor = frotaAnacCache.get(cnpjForn)!;
								if (
									frotaFornecedor.length > 0 &&
									!frotaAnacEmitida.has(cnpjForn)
								) {
									frotaAnacEmitida.add(cnpjForn);
									sendEvent("STATUS", {
										msg: `[ANAC] ${frotaFornecedor.length} aeronave(s) registrada(s) no CNPJ do fornecedor de fretamento!`,
									});
									for (const anv of frotaFornecedor) {
										const anvFrotaPayload = {
											id: `anac-forn-${cnpjForn}-${anv.prefixo || Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
											type: "CONTRATO" as const,
											_origemId: pessoaId,
											data: {
												label: `AERONAVE DO FORNECEDOR: ${anv.prefixo || "N/I"}`,
												objeto: `Empresa: ${cnpjForn} | Modelo: ${anv.modelo || "N/I"} | Fabricante: ${anv.fabricante || "N/I"} | Status: ${anv.situacao || "N/I"}`,
												valor: 0,
												codigo: anv.prefixo || "ANAC",
												ano: "RAB/ANAC",
											},
										};
										malhaOsintBuffer.push(anvFrotaPayload);
										supabaseNodes.push(anvFrotaPayload);
										alertasFinais.push(
											`[ANAC/RAB] Frota do fornecedor: ${anv.prefixo} (${anv.modelo || "N/I"})`,
										);
									}
								}
							} catch (e) {
								console.warn(
									"[ANAC DEEP] Erro ao buscar frota do fornecedor:",
									e,
								);
							}

							// 3. CONFLITO: fornecedor de táxi aéreo é empresa do político?
							if (empresasRelacionadasCNPJs.includes(cnpjForn)) {
								alertasFinais.push(
									"[CONFLITO GRAVÍSSIMO] A empresa de táxi aéreo/fretamento pertence ao próprio parlamentar ou a sócio direto!",
								);
								finalScore = 100;
								sendEvent("STATUS", {
									msg: `[RED FLAG] Conflito de interesses! Empresa de fretamento (${cnpjForn}) está vinculada ao patrimônio do político!`,
								});
							}

							// 4. CONFLITO: fornecedor de táxi aéreo é doador de campanha?
							if (doadores.includes(cnpjForn)) {
								alertasFinais.push(
									"[CONFLITO GRAVE] A empresa de táxi aéreo é doadora de campanha do parlamentar! Caracteriza toma-lá-dá-cá em fretamento.",
								);
								finalScore = 100;
								sendEvent("STATUS", {
									msg: `[RED FLAG] A empresa de fretamento (${cnpjForn}) financiou a campanha do parlamentar!`,
								});
							}

							// 5. QSA reverso: checar se o político é sócio da empresa de táxi aéreo
							try {
								// BrasilAPI com reserva no Minha Receita e fila (receita/cnpj.ts).
								const resFornQsa = await buscarDadosCnpj(cnpjForn);
								if (resFornQsa.ok) {
									const empForn: any = resFornQsa.dados;
									const qsaForn = empForn.qsa || [];
									const nomeNorm = normalizeString(deputadoBasico.nome);
									const nomeCivilNorm = normalizeString(
										detalhes?.nomeCivil || "",
									);
									for (const socio of qsaForn) {
										const socioNorm = normalizeString(socio.nome_socio || "");
										if (nomeNorm && socioNorm.includes(nomeNorm)) {
											alertasFinais.push(
												`[CONFLITO GRAVÍSSIMO] O político "${deputadoBasico.nome}" é SÓCIO da empresa de táxi aéreo (${empForn.razao_social || cnpjForn})!`,
											);
											finalScore = 100;
											break;
										}
										if (
											nomeCivilNorm &&
											nomeCivilNorm.length > 5 &&
											socioNorm.includes(nomeCivilNorm)
										) {
											alertasFinais.push(
												`[CONFLITO GRAVÍSSIMO] O nome civil do político "${detalhes?.nomeCivil}" consta como SÓCIO da empresa de táxi aéreo (${empForn.razao_social || cnpjForn})!`,
											);
											finalScore = 100;
											break;
										}
									}
								}
							} catch (e) {
								console.warn("[QSA REVERSO FRETAMENTO] Erro:", e);
							}
						}
					}
				}

				// -- LAZY LOADING OSINT TSE Doadores --
				if (doadores.includes(d.cnpjCpfFornecedor)) {
					alertasFinais.push(
						`[TSE ALERTA MÁXIMO] Conflito de Interesse! Este fornecedor consta entre os doadores de campanha do político (TSE).`,
					);
					finalScore = 100; // Força score máximo
				}
				if (finalScore > 100) finalScore = 100;

				// Calcular Cor/Nivel
				let nivelDisplay = "BAIXO";
				if (finalScore >= 70) nivelDisplay = "ALTO";
				else if (finalScore >= 50) nivelDisplay = "MEDIO";
				const nomeFornFinal = d.nomeFornecedor || d.fornecedor || d.favorecido || d.razaoSocial || d.contratado || "FORNECEDOR IDENTIFICADO";
				const valorFinal = Number(d.valorDocumento ?? d.valorLiquido ?? d.valor ?? 0);
				const docFornFinal = d.cnpjCpfFornecedor || d.cnpjFornecedor || d.cnpj || d.cpfCnpj || "";
				const tipoFinal = d.tipoDespesa || d.tipo || d.categoria_despesa || d.descricao || "DESPESA PÚBLICA";
				const dataDocFinal = d.dataDocumento || d.data || d.data_despesa || "";

				const despesaId = `despesa-${docFornFinal}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				const despesaPayload = {
					id: despesaId,
					type: "DESPESA",
					_origemId: pessoaId,
					data: {
						label: nomeFornFinal,
						tipo: tipoFinal,
						valor: valorFinal,
						dataDocumento: dataDocFinal,
						documento: docFornFinal,
						avaliado_por_ia: d.avaliado_por_ia,
						descricao: d.descricao || null,
						numeroDocumento: d.numeroDocumento || d.numero_documento || null,
						orgao: d.orgao || d.orgaoNome || d.orgaoSigla || null,
						modalidade: d.modalidade || d.categoria_despesa || null,
						urlDocumento: d.urlDocumento || d.fonte_url || null,
						score_letalidade: finalScore,
						motivo_ia: d.motivo_ia,
						risco: {
							nivel: nivelDisplay,
							motivo: d.motivo_ia || "Investigação Automatizada",
							alertas: alertasFinais,
							cnpjFornecedor: docFornFinal,
							classificacao: d.classificacao ?? "REGULAR_COM_RESSALVA",
							enquadramento_normativo: d.enquadramento_normativo ?? "-",
							fundamentacao_tecnica:
								d.fundamentacao_tecnica ??
								"Sem avaliação técnica específica associada.",
							...dadosSociais,
						},
					},
				};
				sendEvent("NODE_NOVO", despesaPayload);
				supabaseNodes.push(despesaPayload);

				// Partial Cache: Salva um snapshot a cada 5 faturas complexas processadas
				if (i > 0 && i % 5 === 0 && dbSearchId && !isDev) {
					try {
						await supabaseAdmin
							.from("pesquisas")
							.update({
								grafo_dados: {
									timestamp: new Date().toISOString(),
									nodes: supabaseNodes,
									escopo: deputadoBasico?.casa || "GLOBAL",
									partial: true,
								},
							})
							.eq("id", dbSearchId);
					} catch (_e) {}
				}
			}
		} else {
			sendEvent("STATUS", {
				msg: "O político não possui despesas recentes elegíveis para análise.",
			});
		}
		// Contratos do órgão ligado ao mandato (prefeitura / governo do estado) e da própria casa no PNCP: services/core/contratos-do-ente.ts
		const contratosDoEnte = emitirColetaDoMandato(await coletaEnte, pessoaId, sendEvent);
		// Motor de cruzamentos (regras fixas, sem IA, com fonte e link): services/cruzamentos, nota 31.
		await emitirCruzamentos(
			{
				pessoaId, casa: String(deputadoBasico.casa), doadores, empresasDoPolitico: empresasRelacionadasCNPJs, despesasMandato: despesasCruas, nos: supabaseNodes, contratosDoEnte,
				sqCandidato: identidade.sqCandidato,
				politico: { nomes: nomesDeReferencia([deputadoBasico.nome, detalhes?.nomeCivil, eleitoDaRef?.nm_candidato]), cpf: identidade.cpf },
				// Funcionários do gabinete (Câmara/CMRJ) × doadores, sócios de fornecedores e eleitos: cruzamentos/gabinete.ts
				gabinete: alvoDoGabinete(deputadoBasico),
			},
			sendEvent,
		);
		try {
			sendEvent("STATUS", {
				msg: "Sincronizando log final com a base de inteligência...",
			});
			if (!isDev) {
				if (dbSearchId) {
					const { error } = await supabaseAdmin
						.from("pesquisas")
						.update({
							grafo_dados: {
								timestamp: new Date().toISOString(),
								nodes: supabaseNodes,
								etapas: supabaseNodes.etapas,
								escopo: deputadoBasico?.casa || "GLOBAL",
								final: true,
							},
						})
						.eq("id", dbSearchId);
					if (error) console.error("[Supabase Update Error]", error);
				} else {
					const { error } = await supabaseAdmin.from("pesquisas").upsert(
						{
							termo_busca: chaveCacheDeSalvamento,
							cpf_raiz:
								supabaseNodes
									.find((n) => n.type === "PESSOA")
									?.data?.cpf?.replace(/\D/g, "") || null,
							grafo_dados: {
								timestamp: new Date().toISOString(),
								nodes: supabaseNodes,
								etapas: supabaseNodes.etapas,
								escopo: deputadoBasico?.casa || "GLOBAL",
								final: true,
							},
						},
						{
							onConflict: "termo_busca",
						},
					);
					if (error) console.error("[Supabase Error]", error);
				}
			} else {
				console.log(
					"[Supabase Skipping] Ambiente de desenvolvimento detectado. Sincronização com base de inteligência desativada.",
				);
			}
		} catch (e) {
			console.error("[Supabase Catch Error]", e);
		}

		try {
			sendEvent("STATUS", {
				msg: "Executando matemática avançada de grafos...",
			});
			const metrics = analyzeGraphNetwork(supabaseNodes);
			sendEvent("GRAPH_ANALYSIS_SCORES", metrics);
		} catch (e) {
			console.error(
				"[Graphology] Falha ao analisar e enviar scores do grafo:",
				e,
			);
		}

		sendEvent("DONE", {
			msg: "Dossiê finalizado e entregue.",
		});
		safeClose();
	}
}
