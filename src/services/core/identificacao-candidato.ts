import congressoIndex from "@/services/integrations/data/congresso-index.json";
import { buscarDeputadoEstadualRJ } from "../../app/api/investigar/estados/rj/alerj";
import { buscarDeputadoEstadualSP } from "../../app/api/investigar/estados/sp/alesp";
import { buscarMunicipalMestre } from "../../app/api/investigar/municipios/router";
import {
	buscarPolitico,
	buscarPoliticosCamaraLista,
	buscarSenadoresLista,
} from "../../app/api/investigar/scrapers/legislativo";
import { buscarCpfNoTSE, normalizeString } from "../../app/api/investigar/tse";

export interface IdentificacaoParams {
	nomeParaBusca: string;
	nomeBruto: string | null;
	ufScope: string | null;
	cargoParam: string;
	ufParam: string | null;
	forceRef: string | null;
	correcoesNomes: Record<string, { nomeCorreto: string; autoRef?: string }>;
	sendEvent: (tipo: string, payload: any) => void;
}

export async function buscarCandidatosEmCascata(params: IdentificacaoParams) {
	const {
		nomeParaBusca,
		nomeBruto,
		ufScope,
		cargoParam,
		ufParam,
		forceRef,
		correcoesNomes,
		sendEvent,
	} = params;
	const candidatosGlobais: any[] = [];
	let hasApiError = false;

	if (cargoParam === "GOVERNADOR" || cargoParam === "PREFEITO") {
		sendEvent("STATUS", {
			msg: `Buscando ${cargoParam} diretamente na base eleitoral (TSE)...`,
		});
		const cTse = cargoParam === "GOVERNADOR" ? "3" : "11";
		const tseDados = await buscarCpfNoTSE(nomeParaBusca, ufScope || "BR", cTse);
		if (tseDados) {
			const docTse = tseDados.documentoPrincipal || tseDados.cpf;
			if (docTse) {
				candidatosGlobais.push({
					id: docTse.replace(/\D/g, ""),
					uri: "",
					nome: tseDados.nome || nomeParaBusca,
					uf: tseDados.municipio || ufScope || "BR",
					idLegislatura: tseDados.anoEleicao || 2024,
					casa: cargoParam === "GOVERNADOR" ? "GOVERNO_ESTADUAL" : "PREFEITURA",
					cargo:
						cargoParam === "GOVERNADOR"
							? "Governador de Estado"
							: "Prefeito Municipal",
					ref: `${cargoParam}:${tseDados.municipio || ufScope || "BR"}:${docTse.replace(/\D/g, "")}`,
				});
			}
		}
	} else {
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
			buscarSenadoresLista(nomeParaBusca, ufScope),
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
									(tseData as any).nomeUrna || tseData.nome || nomeParaBusca,
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
									(tseData as any).nomeUrna || tseData.nome || nomeParaBusca,
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

	const isOnlyFederal = ufParam === "FEDERAL";

	if (candidatosGlobais.length === 0 && !isOnlyFederal) {
		sendEvent("STATUS", {
			msg: "Não encontrado na esfera Federal. Buscando na esfera Estadual (ALESP e ALERJ)...",
		});
		const estaduaisPromises = [];
		if (!ufScope || ufScope === "SP")
			estaduaisPromises.push(buscarDeputadoEstadualSP(nomeParaBusca));
		if (!ufScope || ufScope === "RJ")
			estaduaisPromises.push(buscarDeputadoEstadualRJ(nomeParaBusca));

		if (ufScope && !["SP", "RJ"].includes(ufScope)) {
			estaduaisPromises.push(
				buscarCpfNoTSE(nomeParaBusca, ufScope, "7").then((tseData) => {
					if (tseData) {
						return [
							{
								id: tseData.documentoPrincipal || tseData.idTse?.toString(),
								uri: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${tseData.anoEleicao}/${tseData.idEleicao}/${ufScope}/${tseData.idTse}`,
								nome:
									(tseData as any).nomeUrna || tseData.nome || nomeParaBusca,
								uf: ufScope,
								casa: "ASSEMBLEIA_LEGISLATIVA",
								cargo: "Deputado Estadual",
								ref: `ESTADUAL:${ufScope}:${tseData.documentoPrincipal || tseData.idTse}`,
								cpfOuCnpj: tseData.documentoPrincipal,
								isCnpj: tseData.isCnpj,
								partido: tseData.partido,
								urlFoto: tseData.urlFoto,
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
				const items = Array.isArray(res.value) ? res.value : [res.value];
				candidatosGlobais.push(...items.map((m: any) => ({
					...m,
					casa: m.casa,
					cargo: m.cargo || "Deputado Estadual",
					ref: `ESTADUAL:${m.uf}:${m.id || m.nome}`,
					partido: m.partido,
					urlFoto: m.urlFoto || m.foto,
				})));
			} else if (res.status === "rejected") {
				hasApiError = true;
			}
		});
	}

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
				id: tseGov.documentoPrincipal || tseGov.idTse?.toString() || nomeGov,
				uri: "",
				nome: tseGov.nome || nomeGov,
				uf: ufGov,
				idLegislatura: tseGov.anoEleicao || 2023,
				casa: "GOVERNO_ESTADUAL",
				cargo: "Governador de Estado",
				ref: `GOVERNADOR:${ufGov}:${nomeGov}`,
				partido: tseGov.partido,
				urlFoto: tseGov.urlFoto,
			});
		}
	}

	if (candidatosGlobais.length === 0 && !isOnlyFederal) {
		sendEvent("STATUS", {
			msg: "Buscando na malha Municipal Master (Prefeitos e Vereadores)...",
		});
		const municipaisPromises = [];

		if (ufScope) {
			municipaisPromises.push(buscarMunicipalMestre(ufScope, nomeParaBusca));
		} else {
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

	return { candidatosGlobais, hasApiError };
}

export async function identificarCandidatoPorRef(
	forceRef: string,
	nomeParaBusca: string,
	nomeBruto: string | null,
	ufScope: string | null,
	sendEvent: (tipo: string, payload: any) => void,
) {
	let deputadoBasico: any = null;

	if (forceRef.startsWith("FEDERAL:CAMARA:")) {
		const idRef = forceRef.split(":")[2];
		deputadoBasico = await buscarPolitico(`id=${idRef}`);
		if (deputadoBasico) {
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
				nome: localMatch?.nome || (nomeBruto || nomeParaBusca).toUpperCase(),
				uf: localMatch?.uf || ufScope || "BR",
				idLegislatura: 57,
				casa: "CAMARA",
			};
		}
	} else if (forceRef.startsWith("FEDERAL:SENADO:")) {
		const idRef = forceRef.split(":")[2];
		const senadoresAll = await buscarSenadoresLista(nomeParaBusca);
		deputadoBasico = senadoresAll.find((s) => String(s.id) === idRef) || null;

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
					localMatchSenado?.nome || (nomeBruto || nomeParaBusca).toUpperCase(),
				uf: localMatchSenado?.uf || ufScope || "BR",
				idLegislatura: 57,
				casa: "SENADO",
			};
		}
	} else if (forceRef.startsWith("SP:")) {
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
	} else if (forceRef.startsWith("RJ:")) {
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
	} else if (forceRef.startsWith("ALERJ:")) {
		const partesAlerj = forceRef.split(":");
		let nomeAlerj =
			partesAlerj.length >= 3
				? decodeURIComponent(partesAlerj[2])
				: (nomeBruto || nomeParaBusca).toUpperCase();
		if (nomeAlerj.includes("%")) nomeAlerj = decodeURIComponent(nomeAlerj);
		const docAlerj = partesAlerj.length >= 4 ? partesAlerj[3] : "";
		deputadoBasico = {
			id: docAlerj || nomeAlerj,
			uri: "https://www.alerj.rj.gov.br/Deputados/QuemSao",
			nome: nomeAlerj,
			uf: "RJ",
			idLegislatura: 13,
			casa: "ALERJ",
		};
	} else if (forceRef.startsWith("ALESP:")) {
		const partesAlesp = forceRef.split(":");
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
	} else if (/^[A-Z]{2}:(PREFEITO|VEREADOR):/.test(forceRef)) {
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
				cargoGen === "PREFEITO" ? "PREFEITURA" : `CAMARA_MUNICIPAL_${ufGen}`,
		};
	} else if (
		forceRef.startsWith("GOVERNADOR:") ||
		forceRef.startsWith("PREFEITO:") ||
		forceRef.startsWith("PRESIDENTE:")
	) {
		const partesGov = forceRef.split(":");
		const cargoTipo = partesGov[0]; // GOVERNADOR, PREFEITO or PRESIDENTE
		const ufGov = partesGov.length >= 2 ? partesGov[1].toUpperCase() : "BR";
		const nomeGov = partesGov.length >= 3 ? partesGov[2] : nomeParaBusca;

		let cTse = "11";
		if (cargoTipo === "GOVERNADOR") cTse = "3";
		if (cargoTipo === "PRESIDENTE") cTse = "1";

		sendEvent("STATUS", {
			msg: `Buscando ${cargoTipo} "${nomeGov}" na base eleitoral TSE...`,
		});
		const tseDados = await buscarCpfNoTSE(nomeGov, ufGov, cTse);
		const docId = tseDados?.documentoPrincipal?.replace(/\D/g, "") || nomeGov;

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
		(deputadoBasico as any)._tseResult = tseDados;
	}

	return deputadoBasico;
}
