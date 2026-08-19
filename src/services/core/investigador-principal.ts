import { analyzeGraphNetwork } from "@/lib/graph-analysis";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkNepotismoCamara } from "@/services/integrations/camara/nepotismo-client";
import { analisarConflitoVotacoes } from "@/services/integrations/camara/conflito-legislativo";
import { checkNepotismoCMRJ } from "@/services/integrations/cmrj/nepotismo-client";
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
		sendEvent,
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
		const supabaseNodes: any[] = [];
		const malhaOsintBuffer: any[] = [];
		let hasApiError = false;
		if (!forceRef) {
			// MODO BUSCA EM CASCATA
			const candidatosGlobais: any[] = [];
			if (cargoParam === "GOVERNADOR" || cargoParam === "PREFEITO") {
				sendEvent("STATUS", {
					msg: `Buscando ${cargoParam} diretamente na base eleitoral (TSE)...`,
				});
				const cTse = cargoParam === "GOVERNADOR" ? "3" : "11";
				const tseDados = await buscarCpfNoTSE(
					nomeParaBusca,
					ufScope || "BR",
					cTse,
				);
				if (tseDados) {
					const docTse = tseDados.documentoPrincipal || tseDados.cpf;
					if (docTse) {
						const ufEstado = ufScope || "BR";
						const municipioSlug = tseDados.municipio || "";
						// Ref no formato genérico consumido na seleção direta:
						// GOVERNADOR:{UF}:{nome} | {UF}:PREFEITO:{municipio}:{doc}
						const refGerada =
							cargoParam === "GOVERNADOR"
								? `GOVERNADOR:${ufEstado}:${tseDados.nome || nomeParaBusca}`
								: `${ufEstado}:PREFEITO:${municipioSlug}:${docTse.replace(/\D/g, "")}`;
						candidatosGlobais.push({
							id: docTse.replace(/\D/g, ""),
							uri: municipioSlug,
							nome: tseDados.nome || nomeParaBusca,
							uf: ufEstado,
							idLegislatura: tseDados.anoEleicao || 2024,
							casa:
								cargoParam === "GOVERNADOR" ? "GOVERNO_ESTADUAL" : "PREFEITURA",
							cargo:
								cargoParam === "GOVERNADOR"
									? "Governador de Estado"
									: "Prefeito Municipal",
							ref: refGerada,
						});
					}
				}
			} else {
				// Sempre busca na esfera Federal primeiro (a menos que seja Governador/Prefeito)
				// Injeta o ufScope nas APIs para filtrar por estado se existir
				sendEvent("STATUS", {
					msg: `Buscando na esfera Federal${ufScope && ufScope !== "FEDERAL" ? ` (filtrando por ${ufScope})` : ""}...`,
				});
				let secondsElapsed = 0;
				const delayInterval = setInterval(() => {
					secondsElapsed += 5;
					if (secondsElapsed === 5) {
						sendEvent("STATUS", {
							msg: `Aguardando resposta dos servidores da Câmara dos Deputados...`,
						});
					} else if (secondsElapsed === 15) {
						sendEvent("STATUS", {
							msg: `A API oficial da Câmara está lenta hoje, forçando a conexão...`,
						});
					} else if (secondsElapsed === 25) {
						sendEvent("STATUS", {
							msg: `Ainda aguardando resposta governamental (tentativa final)...`,
						});
					}
				}, 5000);
				const [camaraRes, senadoRes] = await Promise.allSettled([
					buscarPoliticosCamaraLista(nomeParaBusca, ufScope),
					buscarSenadoresLista(nomeParaBusca),
				]);
				clearInterval(delayInterval);
				if (camaraRes.status === "fulfilled" && camaraRes.value) {
					candidatosGlobais.push(
						...camaraRes.value.map((c: any) => ({
							...c,
							ref: `FEDERAL:CAMARA:${c.id}`,
							cargo: "Deputado Federal",
						})),
					);
				} else if (camaraRes.status === "rejected") {
					hasApiError = true;
					console.warn(`[CÂMARA] Timeout/Erro na API:`, camaraRes.reason);
				}
				if (senadoRes.status === "fulfilled" && senadoRes.value) {
					candidatosGlobais.push(
						...senadoRes.value.map((c: any) => ({
							...c,
							ref: `FEDERAL:SENADO:${c.id}`,
							cargo: "Senador da República",
						})),
					);
				} else if (senadoRes.status === "rejected") {
					hasApiError = true;
					console.warn(`[SENADO] Timeout/Erro na API:`, senadoRes.reason);
				}

				// Re-ordenação local pós-coleta Federal para garantir que se houver correspondência exata, ela suba
				if (candidatosGlobais.length > 1) {
					const termoNorm = normalizeString(nomeParaBusca);
					candidatosGlobais.sort((a: any, b: any) => {
						const nomeA = normalizeString(a.nome);
						const nomeB = normalizeString(b.nome);
						if (nomeA === termoNorm && nomeB !== termoNorm) return -1;
						if (nomeB === termoNorm && nomeA !== termoNorm) return 1;
						return 0;
					});
				}

				// =====================================
				// FALLBACK TSE PARA FEDERAL (Para candidatos não eleitos ou se a API da Câmara/Senado falhar)
				// =====================================
				if (
					candidatosGlobais.length === 0 &&
					ufScope &&
					ufScope !== "FEDERAL" &&
					ufScope !== "BR"
				) {
					sendEvent("STATUS", {
						msg: `Buscando fallback na base TSE para cargos Federais em ${ufScope}...`,
					});
					const federaisTsePromises = [
						buscarCpfNoTSE(nomeParaBusca, ufScope, "6").then((tseData) => {
							if (tseData) {
								return [
									{
										id: tseData.documentoPrincipal || tseData.idTse?.toString(),
										uri: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${tseData.anoEleicao}/${tseData.idEleicao}/${ufScope}/${tseData.idTse}`,
										nome:
											(tseData as any).nomeUrna ||
											tseData.nome ||
											nomeParaBusca,
										uf: ufScope,
										casa: "CANDIDATO_TSE",
										cargo: "Deputado Federal (TSE)",
										ref: `FEDERAL:CAMARA:${tseData.documentoPrincipal || tseData.idTse}`,
										cpfOuCnpj: tseData.documentoPrincipal,
										isCnpj: tseData.isCnpj,
									},
								];
							}
							return [];
						}),
						buscarCpfNoTSE(nomeParaBusca, ufScope, "5").then((tseData) => {
							if (tseData) {
								return [
									{
										id: tseData.documentoPrincipal || tseData.idTse?.toString(),
										uri: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${tseData.anoEleicao}/${tseData.idEleicao}/${ufScope}/${tseData.idTse}`,
										nome:
											(tseData as any).nomeUrna ||
											tseData.nome ||
											nomeParaBusca,
										uf: ufScope,
										casa: "CANDIDATO_TSE",
										cargo: "Senador (TSE)",
										ref: `FEDERAL:SENADO:${tseData.documentoPrincipal || tseData.idTse}`,
										cpfOuCnpj: tseData.documentoPrincipal,
										isCnpj: tseData.isCnpj,
									},
								];
							}
							return [];
						}),
					];
					const federaisTseRes = await Promise.allSettled(federaisTsePromises);
					federaisTseRes.forEach((res) => {
						if (res.status === "fulfilled" && res.value) {
							candidatosGlobais.push(...res.value);
						}
					});
				}
			}

			// Flag para saber se o usuário EXPLICITAMENTE escolheu 'FEDERAL' na busca.
			// Nesse caso, NÃO fazemos fallback para estadual e municipal.
			const isOnlyFederal = ufParam === "FEDERAL";

			// SÓ VAI PARA ESTADUAL SE NÃO ACHOU FEDERAL (E NEM ACHOU GOVERNADOR)
			if (candidatosGlobais.length === 0 && !isOnlyFederal) {
				sendEvent("STATUS", {
					msg: "Não encontrado na esfera Federal. Buscando na esfera Estadual (ALESP e ALERJ)...",
				});
				const estaduaisPromises = [];
				if (!ufScope || ufScope === "SP")
					estaduaisPromises.push(buscarDeputadoEstadualSP(nomeParaBusca));
				if (!ufScope || ufScope === "RJ")
					estaduaisPromises.push(buscarDeputadoEstadualRJ(nomeParaBusca));

				// INTEGRAÇÃO TSE NACIONAL: Fallback para Deputado Estadual (Cargo 7) em UFs fora do eixo SP/RJ
				if (ufScope && !["SP", "RJ"].includes(ufScope)) {
					estaduaisPromises.push(
						buscarCpfNoTSE(nomeParaBusca, ufScope, "7").then((tseData) => {
							if (tseData) {
								return [
									{
										id: tseData.documentoPrincipal || tseData.idTse?.toString(),
										uri: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${tseData.anoEleicao}/${tseData.idEleicao}/${ufScope}/${tseData.idTse}`,
										nome:
											(tseData as any).nomeUrna ||
											tseData.nome ||
											nomeParaBusca,
										uf: ufScope,
										casa: "ASSEMBLEIA_LEGISLATIVA",
										cargo: "Deputado Estadual",
										ref: `ESTADUAL:${ufScope}:${tseData.documentoPrincipal || tseData.idTse}`,
										cpfOuCnpj: tseData.documentoPrincipal,
										isCnpj: tseData.isCnpj,
									},
								];
							}
							return [];
						}),
					);
				}
				const estaduaisRes = await Promise.allSettled(estaduaisPromises);
				estaduaisRes.forEach((res) => {
					if (res.status === "fulfilled" && res.value) {
						candidatosGlobais.push(...res.value);
					} else if (res.status === "rejected") {
						hasApiError = true;
					}
				});
			}

			// TRATAMENTO DINÂMICO PARA GOVERNADORES (busca via TSE):
			const checkNome = (nomeBruto || "").toLowerCase().trim();
			if (
				candidatosGlobais.length === 0 &&
				(forceRef?.startsWith("GOVERNADOR:") ||
					correcoesNomes[checkNome]?.autoRef?.startsWith("GOVERNADOR:"))
			) {
				const refGov = forceRef || correcoesNomes[checkNome]?.autoRef || "";
				const partesRef = refGov.split(":");
				const ufGov = partesRef[1] || ufScope || "BR";
				const nomeGov = partesRef[2] || nomeParaBusca;
				sendEvent("STATUS", {
					msg: `Buscando Governador "${nomeGov}" na base eleitoral TSE (${ufGov})...`,
				});
				const tseGov = await buscarCpfNoTSE(nomeGov, ufGov, "3");
				if (tseGov) {
					candidatosGlobais.push({
						id:
							tseGov.documentoPrincipal || tseGov.idTse?.toString() || nomeGov,
						uri: "",
						nome: tseGov.nome || nomeGov,
						uf: ufGov,
						idLegislatura: tseGov.anoEleicao || 2023,
						casa: "GOVERNO_ESTADUAL",
						cargo: "Governador de Estado",
						ref: `GOVERNADOR:${ufGov}:${nomeGov}`,
					});
				}
			}

			// SÓ VAI PARA MUNICIPAL SE NÃO ACHOU ESTADUAL E FEDERAL (E NEM GOVERNADOR MANUAL)
			if (candidatosGlobais.length === 0 && !isOnlyFederal) {
				sendEvent("STATUS", {
					msg: "Buscando na malha Municipal Master (Prefeitos e Vereadores)...",
				});
				const municipaisPromises = [];
				if (ufScope) {
					municipaisPromises.push(
						buscarMunicipalMestre(ufScope, nomeParaBusca),
					);
				} else {
					// Carga Inicial CEga (apenas eixos principais ativados p/ evitar starvation da Vercel Edge)
					municipaisPromises.push(buscarMunicipalMestre("SP", nomeParaBusca));
					municipaisPromises.push(buscarMunicipalMestre("RJ", nomeParaBusca));
					municipaisPromises.push(buscarMunicipalMestre("PE", nomeParaBusca));
					municipaisPromises.push(buscarMunicipalMestre("CE", nomeParaBusca));
					municipaisPromises.push(buscarMunicipalMestre("PB", nomeParaBusca));
				}
				const municipaisRes = await Promise.allSettled(municipaisPromises);
				municipaisRes.forEach((res) => {
					if (res.status === "fulfilled" && res.value) {
						candidatosGlobais.push(...res.value);
					} else if (res.status === "rejected") {
						hasApiError = true;
					}
				});
			}
			if (candidatosGlobais.length === 0) {
				if (hasApiError) {
					sendEvent("ERROR", {
						mensagem: `A busca falhou devido a Timeout/Falha de conexão com as APIs do Governo (Câmara/Senado/TSE). Tente novamente em alguns minutos.`,
					});
				} else {
					sendEvent("ERROR", {
						mensagem: `Nenhum político encontrado para "${nomeParaBusca}".`,
					});
				}
				safeClose();
				return;
			}

			// Remove duplicatas exatas geradas por sobreposição de legislaturas
			const candidatosUnicos = Array.from(
				new Map(candidatosGlobais.map((c) => [c.ref, c])).values(),
			);
			// Envia para o painel de desambiguação e encerra
			sendEvent("STATUS", {
				msg: `${candidatosUnicos.length} perfis encontrados. Aguardando seleção do operador...`,
			});
			sendEvent("CANDIDATOS_ENCONTRADOS", {
				termo: nomeParaBusca,
				candidatos: candidatosUnicos,
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
				if (!isDev) {
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
							const label = String(node.data?.label || "");
							const codigo = String(node.data?.codigo || "");
							const id = String(node.id || "");
							const objeto = String(node.data?.objeto || "");
							if (
								label.startsWith("BEM DECLARADO:") ||
								codigo === "TSE-BENS" ||
								label === "Patrimônio Declarado (TSE)" ||
								objeto.startsWith("Total de Bens") ||
								id.startsWith("bens-") ||
								id.startsWith("bem-")
							) {
								nodesLegadosIgnorados.add(node.id);
								return false;
							}
							return true;
						});

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
			if (forceRef?.startsWith("FEDERAL:CAMARA:")) {
				const idRef = forceRef.split(":")[2];
				deputadoBasico = await buscarPolitico(`id=${idRef}`);
				if (deputadoBasico) {
					(deputadoBasico as any).id = idRef;
					deputadoBasico.casa = "CAMARA";
				} else {
					console.warn(
						`[CÂMARA] buscarPolitico falhou (timeout/erro) para id=${idRef}. Buscando no índice local...`,
					);
					const localMatch = congressoIndex.find(
						(p: any) => String(p.id) === String(idRef),
					);
					deputadoBasico = {
						id: idRef,
						uri: `https://dadosabertos.camara.leg.br/api/v2/deputados/${idRef}`,
						nome:
							localMatch?.nome || (nomeBruto || nomeParaBusca).toUpperCase(),
						uf: localMatch?.uf || ufScope || "BR",
						idLegislatura: 57,
						casa: "CAMARA",
					};
				}
			} else if (forceRef?.startsWith("FEDERAL:SENADO:")) {
				const idRef = forceRef.split(":")[2];
				const senadoresAll = await buscarSenadoresLista(nomeParaBusca);
				deputadoBasico =
					senadoresAll.find((s) => String(s.id) === idRef) || null;
				if (!deputadoBasico) {
					console.warn(
						`[SENADO] buscarSenadoresLista falhou ou ID não achado para id=${idRef}. Buscando no índice local...`,
					);
					const localMatchSenado = congressoIndex.find(
						(p: any) => String(p.id) === String(idRef),
					);
					deputadoBasico = {
						id: idRef,
						uri: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${idRef}`,
						nome:
							localMatchSenado?.nome ||
							(nomeBruto || nomeParaBusca).toUpperCase(),
						uf: localMatchSenado?.uf || ufScope || "BR",
						idLegislatura: 57,
						casa: "SENADO",
					};
				}
			} else if (forceRef?.startsWith("SP:")) {
				const partesSP = forceRef.split(":");
				const municipioRef = partesSP.length >= 4 ? partesSP[2] : "sao-paulo";
				const idSP = partesSP.length >= 4 ? partesSP[3] : partesSP[2];
				deputadoBasico = {
					id: idSP,
					uri: municipioRef,
					nome: (nomeBruto || nomeParaBusca).toUpperCase(),
					uf: "SP",
					idLegislatura: 18,
					casa: "CAMARA_MUNICIPAL_SP",
				};
			} else if (forceRef?.startsWith("RJ:")) {
				const partesRJ = forceRef.split(":");
				const municipioRefRJ =
					partesRJ.length >= 4 ? partesRJ[2] : "rio-de-janeiro";
				const idRJ = partesRJ.length >= 4 ? partesRJ[3] : partesRJ[2];
				deputadoBasico = {
					id: idRJ,
					uri: municipioRefRJ,
					nome: (nomeBruto || nomeParaBusca).toUpperCase(),
					uf: "RJ",
					idLegislatura: 11,
					casa: "CAMARA_MUNICIPAL_RJ",
				};
			} else if (forceRef?.startsWith("ALERJ:")) {
				const partesAlerj = forceRef.split(":");
				// Formato novo: ALERJ:DEPUTADO_ESTADUAL:{nomeEncoded}:{documento}
				let nomeAlerj =
					partesAlerj.length >= 3
						? decodeURIComponent(partesAlerj[2])
						: (nomeBruto || nomeParaBusca).toUpperCase();
				if (nomeAlerj.includes("%")) nomeAlerj = decodeURIComponent(nomeAlerj);
				const docAlerj = partesAlerj.length >= 4 ? partesAlerj[3] : "";
				deputadoBasico = {
					id: docAlerj || nomeAlerj,
					// Se tem documento, usa como ID para herança de CPF/CNPJ; senão, usa nome
					uri: "https://www.alerj.rj.gov.br/Deputados/QuemSao",
					nome: nomeAlerj,
					uf: "RJ",
					idLegislatura: 13,
					casa: "ALERJ",
				};
			} else if (forceRef?.startsWith("ALESP:")) {
				const partesAlesp = forceRef.split(":");
				// Formato novo: ALESP:DEPUTADO_ESTADUAL:{nomeEncoded}:{documento}
				let nomeAlesp =
					partesAlesp.length >= 3
						? decodeURIComponent(partesAlesp[2])
						: (nomeBruto || nomeParaBusca).toUpperCase();
				if (nomeAlesp.includes("%")) nomeAlesp = decodeURIComponent(nomeAlesp);
				const docAlesp = partesAlesp.length >= 4 ? partesAlesp[3] : "";
				deputadoBasico = {
					id: docAlesp || nomeAlesp,
					uri: "https://www.al.sp.gov.br/alesp/deputados",
					nome: nomeAlesp,
					uf: "SP",
					idLegislatura: 20,
					casa: "ALESP",
				};
			} else if (forceRef && /^[A-Z]{2}:(PREFEITO|VEREADOR):/.test(forceRef)) {
				const partesGen = forceRef.split(":");
				const ufGen = partesGen[0];
				const cargoGen = partesGen[1];
				const municGen = partesGen.length >= 3 ? partesGen[2] : "";
				const docGen = partesGen.length >= 4 ? partesGen[3] : "";
				deputadoBasico = {
					id: docGen || nomeParaBusca,
					uri: municGen,
					nome: (nomeBruto || nomeParaBusca).toUpperCase(),
					uf: ufGen,
					idLegislatura: 2024,
					casa:
						cargoGen === "PREFEITO"
							? "PREFEITURA"
							: `CAMARA_MUNICIPAL_${ufGen}`,
				};
				// Município de atuação (slug) — usado por SICONFI/FNDE/TransfereGov
				(deputadoBasico as any)._nomeMunicipio = municGen
					? municGen.replace(/-/g, " ")
					: undefined;
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
		let cpfLimpo = detalhes?.cpf ? detalhes.cpf.replace(/\D/g, "") : null;
		let documentoIsCnpj = false; // Flag para saber se o documento é CNPJ de campanha

		// NOVIDADE: Se o ID informado pelo frontend/refParam já for um documento estruturado (CPF ou CNPJ), apropria-se dele
		const possivelDoc = String(deputadoBasico.id).replace(/\D/g, "");
		if (!cpfLimpo && (possivelDoc.length === 11 || possivelDoc.length === 14)) {
			cpfLimpo = possivelDoc;
			documentoIsCnpj = possivelDoc.length === 14;
			sendEvent("STATUS", {
				msg: `Documento de ${cpfLimpo.length} dígitos herdado da busca estruturada: ${cpfLimpo}`,
			});
		}

		// SEMPRE bate no TSE para resgatar o Patrimônio e Nome Civil (mesmo se o documento vier da ref)
		sendEvent("STATUS", {
			msg: "Extraindo dados complementares e patrimônio na base eleitoral do TSE...",
		});
		// Cargo 3 = Governador, 5 = Senador, 6 = Dep. Federal, 7 = Dep. Estadual, 11 = Prefeito, 13 = Vereador
		let codigoCargoTse = "6";
		if (deputadoBasico.casa === "SENADO") codigoCargoTse = "5";
		else if (["ALERJ", "ALESP"].includes(deputadoBasico.casa))
			codigoCargoTse = "7";
		else if (String(deputadoBasico.casa).startsWith("CAMARA_MUNICIPAL"))
			codigoCargoTse = "13";
		else if (deputadoBasico.casa === "GOVERNO_ESTADUAL") codigoCargoTse = "3";
		else if (deputadoBasico.casa === "PREFEITURA") codigoCargoTse = "11";
		else if (deputadoBasico.casa === "PRESIDENCIA_DA_REPUBLICA")
			codigoCargoTse = "1";
		const nomeParaTSE = deputadoBasico.nome
			.replace(/\s*\(.*?\)\s*/g, "")
			.trim();
		const tseResult = await buscarCpfNoTSE(
			nomeParaTSE,
			deputadoBasico.uf,
			codigoCargoTse,
		);

		// Se não tínhamos o documento, ou se herdamos um CNPJ e queremos tentar extrair o CPF real:
		if (tseResult && (tseResult.documentoPrincipal || tseResult.cpf)) {
			if (!cpfLimpo || cpfLimpo === "00000000000") {
				cpfLimpo = (tseResult.documentoPrincipal || tseResult.cpf!).replace(
					/\D/g,
					"",
				);
				documentoIsCnpj = tseResult.isCnpj || false;
			}
		}
		if (tseResult?.nome) {
			detalhes = detalhes || ({} as any);
			detalhes!.nomeCivil = tseResult.nome;
		}
		if (documentoIsCnpj) {
			sendEvent("STATUS", {
				msg: `[LGPD] Apenas CNPJ de Campanha disponível nativamente. Buscas de patrimônio pessoal limitadas.`,
			});
		}

		// Armazena o resultado do TSE para uso posterior (patrimônio)
		(deputadoBasico as any)._tseResult = tseResult;

		// NOVA LÓGICA: Fallback de CPF usando o cache Supabase
		if (documentoIsCnpj || !cpfLimpo) {
			try {
				const { supabaseAdmin } = await import("@/lib/supabase-admin");
				const { data, error } = await supabaseAdmin
					.from("tse_bens_historico")
					.select("cpf_candidato")
					.ilike("nome_candidato", `%${deputadoBasico.nome}%`)
					.limit(1);
				if (!error && data && data.length > 0 && data[0].cpf_candidato) {
					cpfLimpo = data[0].cpf_candidato;
					documentoIsCnpj = false;
					sendEvent("STATUS", {
						msg: `[OSINT] CPF real resgatado do histórico do TSE (${cpfLimpo}). Malha societária desbloqueada!`,
					});
				}
			} catch (err) {
				console.error("[TSE] Erro ao buscar CPF no tse_bens_historico", err);
			}
		}

		// Fallback final se nem o TSE achar (político muito antigo, etc)
		if (!cpfLimpo) cpfLimpo = "00000000000";
		const pessoaId = `pessoa-${cpfLimpo !== "00000000000" ? cpfLimpo : deputadoBasico.id}`;

		// Se o documento é um CNPJ de campanha, pula a investigação de patrimônio pessoal profunda (mas mantém o que veio do TSE)
		sendEvent("STATUS", {
			msg: documentoIsCnpj
				? `CNPJ de Campanha capturado (${cpfLimpo}). Usando dados declarados ao TSE...`
				: `CPF capturado (${cpfLimpo}). Investigando Ficha Limpa, TCU e Processos Judiciais...`,
		});
		const tseData = (deputadoBasico as any)._tseResult;
		const fichaPolitico = await investigarPolitico(
			cpfLimpo,
			deputadoBasico.nome,
			deputadoBasico.uf,
			pessoaId,
			sendEvent,
		);

		// Prioriza o patrimônio que veio da busca estruturada do TSE se for maior que zero ou igual a zero (declarado 0)
		if (tseData?.patrimonioTotal !== undefined) {
			fichaPolitico.patrimonioTotal = tseData.patrimonioTotal;
			fichaPolitico.anoPatrimonio = tseData.anoEleicao || 2026;
			fichaPolitico.bensDeclarados = tseData.bensDeclarados || fichaPolitico.bensDeclarados;
			fichaPolitico.historicoPatrimonio = tseData.historicoPatrimonio || [];
			fichaPolitico.patrimonioAnterior = tseData.patrimonioAnterior;
			fichaPolitico.anoPatrimonioAnterior = tseData.anoPatrimonioAnterior;
			fichaPolitico.variacaoPatrimonio = tseData.variacaoPatrimonio;
			fichaPolitico.variacaoPatrimonioPercentual = tseData.variacaoPatrimonioPercentual;

			const ptFmt = tseData.patrimonioTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
			if (
				!fichaPolitico.alertasPessoais.some((a: string) =>
					a.includes("[TSE] Patrimônio"),
				)
			) {
				fichaPolitico.alertasPessoais.push(
					`[TSE] Patrimônio Declarado (${tseData.anoEleicao || "2026"}): R$ ${ptFmt}`,
				);
			}

			if (
				tseData.variacaoPatrimonioPercentual !== undefined &&
				tseData.anoPatrimonioAnterior !== undefined &&
				tseData.patrimonioAnterior !== undefined
			) {
				const antFmt = tseData.patrimonioAnterior.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
				const pctSign = tseData.variacaoPatrimonioPercentual > 0 ? "+" : "";
				const pctFmt = tseData.variacaoPatrimonioPercentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
				if (
					Math.abs(tseData.variacaoPatrimonioPercentual) > 50 ||
					Math.abs(tseData.variacaoPatrimonio || 0) >= 500000
				) {
					fichaPolitico.alertasPessoais.push(
						`[TSE] Evolução Patrimonial: R$ ${antFmt} (${tseData.anoPatrimonioAnterior}) ➔ R$ ${ptFmt} (${tseData.anoEleicao || "2026"}) [${pctSign}${pctFmt}%]`,
					);
				}
			}
		}
		if (documentoIsCnpj && fichaPolitico.patrimonioTotal === 0) {
			fichaPolitico.alertasPessoais.push(
				"[LGPD] Patrimônio pessoal oculto no TSE (Apenas CNPJ de Campanha disponível).",
			);
		}
		let cargoDisplay = "Político";
		if (deputadoBasico.casa === "ALERJ" || deputadoBasico.casa === "ALESP")
			cargoDisplay = "Deputado Estadual";
		else if (String(deputadoBasico.casa).startsWith("CAMARA_MUNICIPAL"))
			cargoDisplay = "Vereador Municipal";
		else if (deputadoBasico.casa === "CAMARA")
			cargoDisplay = "Deputado Federal";
		else if (deputadoBasico.casa === "SENADO")
			cargoDisplay = "Senador da República";
		else if (deputadoBasico.casa === "GOVERNO_ESTADUAL")
			cargoDisplay = "Governador";
		else if (deputadoBasico.casa === "PREFEITURA") cargoDisplay = "Prefeito";
		const pessoaNodePayload = {
			id: pessoaId,
			type: "PESSOA",
			data: {
				label: deputadoBasico.nome,
				nomeCivil: detalhes?.nomeCivil || deputadoBasico.nome,
				// Envia o cpfLimpo validado. O frontend formata com regex de acordo with isCnpj.
				cpf: cpfLimpo && cpfLimpo !== "00000000000" ? cpfLimpo : undefined,
				documentoPrincipal:
					cpfLimpo && cpfLimpo !== "00000000000" ? cpfLimpo : undefined,
				isCnpj: documentoIsCnpj,
				uf: deputadoBasico.uf,
				cargo: cargoDisplay,
				idLegislatura: deputadoBasico.idLegislatura,
				casa: deputadoBasico.casa,
				patrimonio: fichaPolitico.patrimonioTotal,
				anoPatrimonio: tseData?.anoEleicao || fichaPolitico.anoPatrimonio || 2026,
				patrimonioAnterior: tseData?.patrimonioAnterior || fichaPolitico.patrimonioAnterior,
				anoPatrimonioAnterior: tseData?.anoPatrimonioAnterior || fichaPolitico.anoPatrimonioAnterior,
				variacaoPatrimonio: tseData?.variacaoPatrimonio || fichaPolitico.variacaoPatrimonio,
				variacaoPatrimonioPercentual: tseData?.variacaoPatrimonioPercentual || fichaPolitico.variacaoPatrimonioPercentual,
				historicoPatrimonio: tseData?.historicoPatrimonio || fichaPolitico.historicoPatrimonio || [],
				bensDeclarados: tseData?.bensDeclarados || fichaPolitico.bensDeclarados || [],
				alertasPessoais: fichaPolitico.alertasPessoais,
				afastamento: deputadoBasico.afastamento,
				urlFoto: deputadoBasico.urlFoto || (deputadoBasico as any)._tseResult?.urlFoto,
				partido: (deputadoBasico as any).partido || (deputadoBasico as any)._tseResult?.partido,
				idPoliticoOriginal: deputadoBasico.id,
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
							cpf_raiz: cpfLimpo && cpfLimpo !== "00000000000" ? cpfLimpo : null,
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
		const isExecutivo =
			deputadoBasico.casa === "GOVERNO_ESTADUAL" ||
			deputadoBasico.casa === "PREFEITURA";
		if (cpfLimpo && cpfLimpo !== "00000000000" && !isExecutivo) {
			sendEvent("STATUS", {
				msg: `Cruzando documento ${cpfLimpo} nas bases da CGU e Receita Federal...`,
			});
			if (typeof buscarReceitasFederais === "function") {
				await buscarReceitasFederais(cpfLimpo, pessoaId, sendEvent);
			}

			// Só expande malha se não for CNPJ (pessoas físicas)
			if (!documentoIsCnpj && typeof expandirMalhaSocietaria === "function") {
				await expandirMalhaSocietaria(cpfLimpo, pessoaId, sendEvent);
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
			);
		}

		// Prepara contexto normativo comum
		let esferaPolitico = "FEDERAL";
		if (deputadoBasico.casa === "ALERJ" || deputadoBasico.casa === "ALESP")
			esferaPolitico = "ESTADUAL";
		else if (
			deputadoBasico.casa === "CAMARA_MUNICIPAL_SP" ||
			deputadoBasico.casa === "CAMARA_MUNICIPAL_RJ" ||
			String(deputadoBasico.casa).startsWith("CAMARA_MUNICIPAL") ||
			deputadoBasico.casa === "PREFEITURA"
		)
			esferaPolitico = "MUNICIPAL";

		// PASSO 2: Emendas Parlamentares (Extração Completa)
		sendEvent("STATUS", {
			msg: "Rastreando emendas parlamentares em todas as legislaturas disponíveis...",
		});
		const { emendas, resumo: resumoEmendas } = await buscarEmendas(
			deputadoBasico.nome,
		);
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
					const isDev = process.env.NODE_ENV === "development";
					if (!isDev) {
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
			sendEvent("STATUS", {
				msg: `Falha na conexão com o TransfereGov (API Offline). Emitindo alerta no Canvas.`,
			});
			const errorPayload = {
				id: `transferegov-error-${pessoaId}`,
				type: "EMENDA_RESUMO",
				_origemId: pessoaId,
				data: {
					label: "⚠️ TRANSFEREGOV OFFLINE (ERRO 502)",
					descricao:
						"O sistema governamental do Transferegov.br está instável ou fora do ar no momento.",
					score_letalidade: 86, // >85 pinta o node de vermelho (alerta IA) na UI
				},
			};
			malhaOsintBuffer.push(errorPayload);
			supabaseNodes.push(errorPayload);
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
			const docTce = cpfLimpo || String(deputadoBasico.id);
			sendEvent("STATUS", {
				msg: `Roteando varredura TCE/ProxyOSINT para a alçada municipal (${deputadoBasico.uf})...`,
			});
			despesasCruas = await buscarDespesasMunicipalMestre(
				deputadoBasico.uf,
				docTce,
				deputadoBasico.nome,
				deputadoBasico.uri,
				deputadoBasico.casa,
			);
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

			// Em vez de raspar as despesas agora (que é muito demorado via Playwright),
			// emitimos o nó do Órgão (ALERJ) para que o usuário faça o deep dive manual.
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
			// despesasCruas permanece vazio para não passar pra IA central
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
			cpfLimpo || String(deputadoBasico.id),
			pessoaId,
			sendEvent,
		);

		// B2. Buscar Gastos com Cartão Corporativo (CPGF)
		sendEvent("STATUS", {
			msg: "Analisando faturas de Cartão de Pagamento do Governo Federal (CPGF)...",
		});
		await buscarCartaoCorporativo(
			cpfLimpo || String(deputadoBasico.id),
			pessoaId,
			sendEvent,
			deputadoBasico.casa,
		);

		// B3. Buscar Viagens a Serviço (Voos FAB / Diárias)
		sendEvent("STATUS", {
			msg: "Rastreando Viagens a Serviço e Voos da FAB financiados com recursos públicos...",
		});
		await buscarViagensFAB(
			cpfLimpo || String(deputadoBasico.id),
			pessoaId,
			sendEvent,
			deputadoBasico.casa,
		);

		// C. Expandir Malha Societária
		sendEvent("STATUS", {
			msg: "Expandindo malha societária via BrasilAPI para rastrear blindagem patrimonial...",
		});
		const empresasRelacionadasCNPJs = await expandirMalhaSocietaria(
			cpfLimpo || String(deputadoBasico.id),
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
				// ANTI-FALSO-POSITIVO: a busca reversa por nome é fraca (homônimos).
				// Cada empresa candidata só entra na malha se o QSA (BrasilAPI) tiver
				// um sócio cujo nome bata EXATAMENTE com o nome civil/urna do político.
				const nomesDeReferencia = [
					detalhes?.nomeCivil,
					(deputadoBasico as any)._tseResult?.nome,
					(deputadoBasico as any)._tseResult?.nomeUrna,
					deputadoBasico.nome,
				]
					.filter(Boolean)
					.map((n: string) => normalizeString(n).trim())
					.filter((n: string) => n.length > 5);
				const nomesEquivalentes = (nomeSocio: string) => {
					const ns = normalizeString(nomeSocio || "").trim();
					return nomesDeReferencia.some((ref: string) => ns === ref);
				};
				let confirmadas = 0;
				for (const emp of empresasPorNome) {
					const cnpjEmp = (emp.cnpj || "").replace(/\D/g, "");
					if (!cnpjEmp || empresasRelacionadasCNPJs.includes(cnpjEmp))
						continue;

					let verificada = false;
					try {
						const resQsa = await fetchWithTimeout(
							`https://brasilapi.com.br/api/cnpj/v1/${cnpjEmp}`,
							{ timeout: 5000 },
						);
						if (resQsa.ok) {
							const empData = await resQsa.json();
							const qsa = empData.qsa || [];
							verificada = qsa.some((s: any) =>
								nomesEquivalentes(s.nome_socio || ""),
							);

							// MEI e Empresa Individual geralmente não possuem quadro societário no BrasilAPI
							if (!verificada && qsa.length === 0) {
								const razaoNormalizada = normalizeString(empData.razao_social || "");
								verificada = nomesDeReferencia.some((ref: string) =>
									razaoNormalizada.includes(ref)
								);
							}
						}
					} catch (_e) {
						// Sem verificação possível — trata como não verificada
					}

					if (!verificada) {
						sendEvent("STATUS", {
							msg: `[OSINT] "${emp.razao_social || cnpjEmp}" descartada: nome no QSA não confere com o político (proteção anti-homônimo).`,
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
							motivo_ia:
								"Vínculo societário confirmado via QSA (nome do sócio idêntico ao nome civil/urna do político).",
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

		// E6. Integração TCE-RS para Federais (compliance fiscal/saúde/educação de origem)
		if (
			deputadoBasico.casa === "CAMARA" &&
			deputadoBasico.uf === "RS" &&
			deputadoBasico.uri
		) {
			sendEvent("STATUS", {
				msg: "Alvo Federal do Rio Grande do Sul. Resgatando histórico de Compliance Fiscal no TCE-RS...",
			});
			try {
				const { buscarDespesasMunicipalRS } = await import(
					"@/app/api/investigar/estados/rs/tce"
				);
				const docTce = cpfLimpo || String(deputadoBasico.id);
				const tceDespesas = await buscarDespesasMunicipalRS(
					docTce,
					deputadoBasico.nome,
					deputadoBasico.uri,
					deputadoBasico.casa,
				);
				if (tceDespesas && tceDespesas.length > 0) {
					tceDespesas.forEach((d, i) => {
						const tcePayload = {
							id: `tcers-${Date.now()}-${i}`,
							type: "DESPESA_PUBLICA",
							_origemId: pessoaId,
							data: {
								label: d.tipoDespesa || "TCE-RS",
								valor: d.valorDocumento,
								fornecedor:
									d.nomeFornecedor || d.descricao || "Informação do TCE-RS",
								data: d.dataDocumento,
								url: d.urlDocumento || "https://dados.tce.rs.gov.br",
							},
						};
						malhaOsintBuffer.push(tcePayload);
						supabaseNodes.push(tcePayload);
					});
				}
			} catch (e) {
				console.warn("[TCE-RS] Falha na integração federal:", e);
			}
		}

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
		let cargoTse = "6"; // Padrão: Federal
		if (deputadoBasico.casa === "SENADO") cargoTse = "5";
		else if (["ALERJ", "ALESP"].includes(deputadoBasico.casa)) cargoTse = "7";
		else if (String(deputadoBasico.casa).startsWith("CAMARA_MUNICIPAL"))
			cargoTse = "13";
		else if (deputadoBasico.casa === "GOVERNO_ESTADUAL") cargoTse = "3";
		else if (deputadoBasico.casa === "PREFEITURA") cargoTse = "11";
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
					msg: `Identificados ${doadoresUnicosFornecedores.length} doadores CNPJ. Cruzando com contratos da União...`,
				});
				for (const cnpjDoador of doadoresUnicosFornecedores) {
					sendEvent("STATUS", {
						msg: `Investigando doador CNPJ ${cnpjDoador} no Compras.gov...`,
					});
					try {
						const resComp = await fetch(
							`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${cnpjDoador}`,
						);
						if (resComp.ok) {
							const compJson = await resComp.json();
							const contratos = compJson?._embedded?.contratos || [];
							if (contratos.length > 0) {
								const valorTotal = contratos.reduce(
									(acc: number, c: any) => acc + (Number(c.valor_inicial) || 0),
									0,
								);
								const nodeDoador = {
									id: `toma-la-da-ca-${cnpjDoador}-${Date.now()}`,
									type: "DESPESA" as const,
									// Força cor de letalidade máxima
									_origemId: pessoaId,
									data: {
										label: "DOADOR COM CONTRATO PÚBLICO",
										valor: valorTotal,
										tipo: "CONFLITO DE INTERESSE (TOMA-LÁ-DÁ-CÁ)",
										dataDocumento: String(new Date().getFullYear()),
										score_letalidade: 100,
										motivo_ia: `ALERTA TOMA-LÁ-DÁ-CÁ: Empresa financiou a campanha e possui contratos milionários ativos com o governo (CNPJ: ${cnpjDoador}).`,
									},
								};
								malhaOsintBuffer.push(nodeDoador);
								supabaseNodes.push(nodeDoador);
								sendEvent("STATUS", {
									msg: `[RED FLAG] Doador ${cnpjDoador} possui R$ ${valorTotal.toLocaleString("pt-BR")} em contratos federais!`,
								});
							}
						}
						// Delay de 400ms para evitar Rate Limit
						await new Promise((r) => setTimeout(r, 400));
					} catch (_e) {}
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
					despesasCruas,
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

					// ==========================================
					// [NOVO] DETECÇÃO DE NEPOTISMO (CMRJ)
					// ==========================================
					if (
						deputadoBasico.casa === "CAMARA_MUNICIPAL_RJ" &&
						hardData.socios &&
						Array.isArray(hardData.socios)
					) {
						sendEvent("STATUS", {
							msg: `[OSINT] Cruzando Malha Societária de ${d.cnpjCpfFornecedor} com a folha de pagamento da CMRJ...`,
						});
						for (const socio of hardData.socios) {
							const nomeSocio =
								typeof socio === "string"
									? socio
									: (socio as any).nome || (socio as any).nome_socio;
							if (nomeSocio) {
								const nepotismoMatch = await checkNepotismoCMRJ(nomeSocio);
								if (nepotismoMatch) {
									const lotacaoStr =
										nepotismoMatch.lotacao || "Local Desconhecido";
									const cargoStr =
										nepotismoMatch.cargo ||
										nepotismoMatch.vinculo ||
										"Cargo Desconhecido";

									// Adiciona o Alerta Crítico
									alertasFinais.unshift(
										`🚨 [ALERTA DE NEPOTISMO]: O sócio '${nomeSocio}' atua na CMRJ! Lotação: ${lotacaoStr} | Cargo: ${cargoStr}`,
									);
									finalScore = 100; // Letalidade Máxima

									// Gera um Nodo exclusivo no Canvas para materializar a fraude
									const nepotismoNode = {
										id: `nepotismo-${nomeSocio.replace(/\s+/g, "-")}-${Date.now()}`,
										type: "EMPRESA" as const,
										_origemId: pessoaId,
										data: {
											label: "NOMEAÇÃO EM GABINETE PARLAMENTAR",
											valor: 0,
											tipo: "CONFLITO DE INTERESSE (POSSÍVEL NEPOTISMO)",
											dataDocumento:
												nepotismoMatch.data_ingresso ||
												String(new Date().getFullYear()),
											score_letalidade: 100,
											motivo_ia: `O sócio '${nomeSocio}' da empresa fornecedora (${d.cnpjCpfFornecedor}) possui vínculo empregatício na Câmara Municipal do Rio de Janeiro. Lotação atual: ${lotacaoStr}.`,
										},
									};
									malhaOsintBuffer.push(nepotismoNode);
									supabaseNodes.push(nepotismoNode);
									sendEvent("NODE_NOVO", nepotismoNode);
								}
							}
						}
					}

					// Auditoria de Nepotismo Federal (Câmara dos Deputados)
					if (
						deputadoBasico.casa === "CAMARA" &&
						hardData.socios &&
						Array.isArray(hardData.socios)
					) {
						for (const socio of hardData.socios) {
							const nomeSocio =
								typeof socio === "string"
									? socio
									: (socio as any).nome || (socio as any).nome_socio;
							if (nomeSocio) {
								const nepotismoCamaraMatch = await checkNepotismoCamara(
									nomeSocio,
									Number(deputadoBasico.id) || undefined,
								);
								if (nepotismoCamaraMatch) {
									const vinculoTexto =
										nepotismoCamaraMatch.tipoVinculo === "GABINETE_DIRETO"
											? "GABINETE DIRETO DO PARLAMENTAR"
											: "CÂMARA DOS DEPUTADOS";

									alertasFinais.unshift(
										`🚨 [ALERTA DE NEPOTISMO FEDERAL]: O sócio '${nomeSocio}' atua como ${nepotismoCamaraMatch.cargo} (${vinculoTexto})!`,
									);
									finalScore = 100; // Letalidade Máxima

									const nepotismoNode = {
										id: `nepotismo-camara-${nomeSocio.replace(/\s+/g, "-")}-${Date.now()}`,
										type: "EMPRESA" as const,
										_origemId: pessoaId,
										data: {
											label: "ASSESSOR DE GABINETE / SÓCIO DE FORNECEDOR",
											valor: 0,
											tipo: "CONFLITO DE INTERESSE / NEPOTISMO FEDERAL",
											dataDocumento: String(new Date().getFullYear()),
											score_letalidade: 100,
											motivo_ia: `O sócio '${nomeSocio}' da empresa fornecedora (${d.cnpjCpfFornecedor}) consta na folha de pagamento da Câmara dos Deputados como '${nepotismoCamaraMatch.cargo}' (${vinculoTexto}).`,
										},
									};
									malhaOsintBuffer.push(nepotismoNode);
									supabaseNodes.push(nepotismoNode);
									sendEvent("NODE_NOVO", nepotismoNode);
								}
							}
						}
					}
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
								const resFornQsa = await fetchWithTimeout(
									`https://brasilapi.com.br/api/cnpj/v1/${cnpjForn}`,
									{
										timeout: 4000,
									},
								);
								if (resFornQsa.ok) {
									const empForn = await resFornQsa.json();
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
						`[TSE ALERTA MÁXIMO] Conflito de Interesse! Este fornecedor financiou a campanha do político em 2022.`,
					);
					finalScore = 100; // Força score máximo
				}
				if (finalScore > 100) finalScore = 100;

				// Calcular Cor/Nivel
				let nivelDisplay = "BAIXO";
				if (finalScore >= 70) nivelDisplay = "ALTO";
				else if (finalScore >= 50) nivelDisplay = "MEDIO";
				const despesaId = `despesa-${d.cnpjCpfFornecedor}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				const despesaPayload = {
					id: despesaId,
					type: "DESPESA",
					_origemId: pessoaId,
					data: {
						label: d.nomeFornecedor || "N/A",
						tipo: d.tipoDespesa,
						valor: d.valorDocumento,
						dataDocumento: d.dataDocumento,
						documento: d.cnpjCpfFornecedor,
						urlDocumento: d.urlDocumento || null,
						score_letalidade: finalScore,
						motivo_ia: d.motivo_ia,
						risco: {
							nivel: nivelDisplay,
							motivo: d.motivo_ia || "Investigação Automatizada",
							alertas: alertasFinais,
							cnpjFornecedor: d.cnpjCpfFornecedor,
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
						supabaseAdmin
							.from("pesquisas")
							.update({
								grafo_dados: {
									timestamp: new Date().toISOString(),
									nodes: supabaseNodes,
									escopo: deputadoBasico?.casa || "GLOBAL",
									partial: true,
								},
							})
							.eq("id", dbSearchId)
							.then(); // Pass through assíncrono para não travar o loop
					} catch (_e) {}
				}
			}
		} else {
			sendEvent("STATUS", {
				msg: "O político não possui despesas recentes elegíveis para análise.",
			});
		}
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
