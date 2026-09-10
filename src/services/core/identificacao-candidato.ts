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

// ============================================================================
// HELPERS DE BUSCA EM CASCATA
// ============================================================================

const DADOS_CARGO_EXECUTIVO: Record<
	string,
	{ cTse: string; casa: string; cargo: string }
> = {
	GOVERNADOR: {
		cTse: "3",
		casa: "GOVERNO_ESTADUAL",
		cargo: "Governador de Estado",
	},
	PREFEITO: { cTse: "11", casa: "PREFEITURA", cargo: "Prefeito Municipal" },
};

async function buscarCandidatosExecutivoDireto(
	cargoParam: string,
	nomeParaBusca: string,
	ufScope: string | null,
	sendEvent: (tipo: string, payload: any) => void,
): Promise<any[]> {
	sendEvent("STATUS", {
		msg: `Buscando ${cargoParam} diretamente na base eleitoral (TSE)...`,
	});
	const meta =
		DADOS_CARGO_EXECUTIVO[cargoParam] ?? DADOS_CARGO_EXECUTIVO.PREFEITO;
	const ufAlvo = ufScope ?? "BR";
	const tseDados = await buscarCpfNoTSE(nomeParaBusca, ufAlvo, meta.cTse);
	if (!tseDados) return [];

	const docTse = tseDados.documentoPrincipal ?? tseDados.cpf;
	if (!docTse) return [];

	const docLimpo = docTse.replace(/\D/g, "");
	const ufFinal = tseDados.municipio ?? ufAlvo;
	const nomeFinal = tseDados.nome ?? nomeParaBusca;
	const anoFinal = tseDados.anoEleicao ?? 2024;

	return [
		{
			id: docLimpo,
			uri: "",
			nome: nomeFinal,
			uf: ufFinal,
			idLegislatura: anoFinal,
			casa: meta.casa,
			cargo: meta.cargo,
			ref: `${cargoParam}:${ufFinal}:${docLimpo}`,
		},
	];
}

function ordenarCandidatosPorNome(candidatos: any[], nomeParaBusca: string) {
	if (candidatos.length <= 1) return;
	const termoNorm = normalizeString(nomeParaBusca);
	candidatos.sort((a: any, b: any) => {
		const nomeA = normalizeString(a.nome);
		const nomeB = normalizeString(b.nome);
		if (nomeA === termoNorm && nomeB !== termoNorm) return -1;
		if (nomeB === termoNorm && nomeA !== termoNorm) return 1;
		return 0;
	});
}

async function consultarCamaraESenado(
	nomeParaBusca: string,
	ufScope: string | null,
	sendEvent: (tipo: string, payload: any) => void,
): Promise<{ candidatos: any[]; hasApiError: boolean }> {
	sendEvent("STATUS", {
		msg: `Buscando na esfera Federal${ufScope && ufScope !== "FEDERAL" ? ` (filtrando por ${ufScope})` : ""}...`,
	});

	let secondsElapsed = 0;
	const delayInterval = setInterval(() => {
		secondsElapsed += 5;
		if (secondsElapsed === 5) {
			sendEvent("STATUS", {
				msg: "Aguardando resposta dos servidores da Câmara dos Deputados...",
			});
		} else if (secondsElapsed === 15) {
			sendEvent("STATUS", {
				msg: "A API oficial da Câmara está lenta hoje, forçando a conexão...",
			});
		} else if (secondsElapsed === 25) {
			sendEvent("STATUS", {
				msg: "Ainda aguardando resposta governamental (tentativa final)...",
			});
		}
	}, 5000);

	const [camaraRes, senadoRes] = await Promise.allSettled([
		buscarPoliticosCamaraLista(nomeParaBusca, ufScope),
		buscarSenadoresLista(nomeParaBusca, ufScope),
	]);
	clearInterval(delayInterval);

	let hasApiError = false;
	const candidatos: any[] = [];

	if (camaraRes.status === "fulfilled" && camaraRes.value) {
		candidatos.push(
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
		candidatos.push(
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

	ordenarCandidatosPorNome(candidatos, nomeParaBusca);
	return { candidatos, hasApiError };
}

async function buscarFallbackFederaisTSE(
	nomeParaBusca: string,
	ufScope: string,
	sendEvent: (tipo: string, payload: any) => void,
): Promise<any[]> {
	sendEvent("STATUS", {
		msg: `Buscando fallback na base TSE para cargos Federais em ${ufScope}...`,
	});
	const cargos = [
		{ cod: "6", cargo: "Deputado Federal (TSE)", prefix: "FEDERAL:CAMARA" },
		{ cod: "5", cargo: "Senador (TSE)", prefix: "FEDERAL:SENADO" },
	];

	const promises = cargos.map(({ cod, cargo, prefix }) =>
		buscarCpfNoTSE(nomeParaBusca, ufScope, cod).then((tseData) => {
			if (!tseData) return [];
			const idFinal = tseData.documentoPrincipal || tseData.idTse?.toString();
			return [
				{
					id: idFinal,
					uri: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${tseData.anoEleicao}/${tseData.idEleicao}/${ufScope}/${tseData.idTse}`,
					nome: (tseData as any).nomeUrna || tseData.nome || nomeParaBusca,
					uf: ufScope,
					casa: "CANDIDATO_TSE",
					cargo,
					ref: `${prefix}:${idFinal}`,
					cpfOuCnpj: tseData.documentoPrincipal,
					isCnpj: tseData.isCnpj,
				},
			];
		}),
	);

	const results = await Promise.allSettled(promises);
	const lista: any[] = [];
	results.forEach((res) => {
		if (res.status === "fulfilled" && res.value) lista.push(...res.value);
	});
	return lista;
}

async function buscarCandidatosEstaduais(
	nomeParaBusca: string,
	ufScope: string | null,
	sendEvent: (tipo: string, payload: any) => void,
): Promise<{ candidatos: any[]; hasApiError: boolean }> {
	sendEvent("STATUS", {
		msg: "Não encontrado na esfera Federal. Buscando na esfera Estadual (ALESP e ALERJ)...",
	});
	const promises = [];
	if (!ufScope || ufScope === "SP")
		promises.push(buscarDeputadoEstadualSP(nomeParaBusca));
	if (!ufScope || ufScope === "RJ")
		promises.push(buscarDeputadoEstadualRJ(nomeParaBusca));

	if (ufScope && !["SP", "RJ"].includes(ufScope)) {
		promises.push(
			buscarCpfNoTSE(nomeParaBusca, ufScope, "7").then((tseData) => {
				if (!tseData) return [];
				const idFinal =
					tseData.documentoPrincipal || tseData.idTse?.toString();
				return [
					{
						id: idFinal,
						uri: `https://divulgacandcontas.tse.jus.br/divulga/#/candidato/${tseData.anoEleicao}/${tseData.idEleicao}/${ufScope}/${tseData.idTse}`,
						nome:
							(tseData as any).nomeUrna || tseData.nome || nomeParaBusca,
						uf: ufScope,
						casa: "ASSEMBLEIA_LEGISLATIVA",
						cargo: "Deputado Estadual",
						ref: `ESTADUAL:${ufScope}:${idFinal}`,
						cpfOuCnpj: tseData.documentoPrincipal,
						isCnpj: tseData.isCnpj,
						partido: tseData.partido,
						urlFoto: tseData.urlFoto,
					},
				];
			}),
		);
	}

	const estaduaisRes = await Promise.allSettled(promises);
	let hasApiError = false;
	const candidatos: any[] = [];

	estaduaisRes.forEach((res) => {
		if (res.status === "fulfilled" && res.value) {
			const items = Array.isArray(res.value) ? res.value : [res.value];
			candidatos.push(
				...items.map((m: any) => ({
					...m,
					casa: m.casa,
					cargo: m.cargo || "Deputado Estadual",
					ref: `ESTADUAL:${m.uf}:${m.id || m.nome}`,
					partido: m.partido,
					urlFoto: m.urlFoto || m.foto,
				})),
			);
		} else if (res.status === "rejected") {
			hasApiError = true;
		}
	});

	return { candidatos, hasApiError };
}

function extrairInfoGovernador(
	nomeBruto: string | null,
	nomeParaBusca: string,
	forceRef: string | null,
	ufScope: string | null,
	correcoesNomes: Record<string, { nomeCorreto: string; autoRef?: string }>,
): { ufGov: string; nomeGov: string } | null {
	const checkNome = (nomeBruto ?? "").toLowerCase().trim();
	const autoRefGov = correcoesNomes[checkNome]?.autoRef;
	const refGov = forceRef ?? autoRefGov ?? "";
	if (!refGov.startsWith("GOVERNADOR:")) return null;

	const partesRef = refGov.split(":");
	const ufGov = partesRef[1] ?? ufScope ?? "BR";
	const nomeGov = partesRef[2] ?? nomeParaBusca;
	return { ufGov, nomeGov };
}

async function buscarGovernadorAutoRef(
	nomeBruto: string | null,
	nomeParaBusca: string,
	forceRef: string | null,
	ufScope: string | null,
	correcoesNomes: Record<string, { nomeCorreto: string; autoRef?: string }>,
	sendEvent: (tipo: string, payload: any) => void,
): Promise<any[]> {
	const info = extrairInfoGovernador(
		nomeBruto,
		nomeParaBusca,
		forceRef,
		ufScope,
		correcoesNomes,
	);
	if (!info) return [];

	sendEvent("STATUS", {
		msg: `Buscando Governador "${info.nomeGov}" na base eleitoral TSE (${info.ufGov})...`,
	});
	const tseGov = await buscarCpfNoTSE(info.nomeGov, info.ufGov, "3");
	if (!tseGov) return [];

	const docId =
		tseGov.documentoPrincipal ?? tseGov.idTse?.toString() ?? info.nomeGov;
	return [
		{
			id: docId,
			uri: "",
			nome: tseGov.nome ?? info.nomeGov,
			uf: info.ufGov,
			idLegislatura: tseGov.anoEleicao ?? 2023,
			casa: "GOVERNO_ESTADUAL",
			cargo: "Governador de Estado",
			ref: `GOVERNADOR:${info.ufGov}:${info.nomeGov}`,
			partido: tseGov.partido,
			urlFoto: tseGov.urlFoto,
		},
	];
}

async function buscarCandidatosMunicipais(
	nomeParaBusca: string,
	ufScope: string | null,
	sendEvent: (tipo: string, payload: any) => void,
): Promise<{ candidatos: any[]; hasApiError: boolean }> {
	sendEvent("STATUS", {
		msg: "Buscando na malha Municipal Master (Prefeitos e Vereadores)...",
	});
	const ufs = ufScope ? [ufScope] : ["SP", "RJ", "PE", "CE", "PB", "SE"];
	const promises = ufs.map((uf) => buscarMunicipalMestre(uf, nomeParaBusca));

	const municipaisRes = await Promise.allSettled(promises);
	let hasApiError = false;
	const candidatos: any[] = [];

	municipaisRes.forEach((res) => {
		if (res.status === "fulfilled" && res.value) {
			candidatos.push(...res.value);
		} else if (res.status === "rejected") {
			hasApiError = true;
		}
	});

	return { candidatos, hasApiError };
}

async function cascataNaoFederal(
	params: IdentificacaoParams,
	candidatosGlobais: any[],
): Promise<boolean> {
	let hasError = false;
	const isOnlyFederal = params.ufParam === "FEDERAL";

	if (candidatosGlobais.length === 0 && !isOnlyFederal) {
		const est = await buscarCandidatosEstaduais(
			params.nomeParaBusca,
			params.ufScope,
			params.sendEvent,
		);
		candidatosGlobais.push(...est.candidatos);
		if (est.hasApiError) hasError = true;
	}

	if (candidatosGlobais.length === 0) {
		const gov = await buscarGovernadorAutoRef(
			params.nomeBruto,
			params.nomeParaBusca,
			params.forceRef,
			params.ufScope,
			params.correcoesNomes,
			params.sendEvent,
		);
		candidatosGlobais.push(...gov);
	}

	if (candidatosGlobais.length === 0 && !isOnlyFederal) {
		const mun = await buscarCandidatosMunicipais(
			params.nomeParaBusca,
			params.ufScope,
			params.sendEvent,
		);
		candidatosGlobais.push(...mun.candidatos);
		if (mun.hasApiError) hasError = true;
	}

	return hasError;
}

export async function buscarCandidatosEmCascata(params: IdentificacaoParams) {
	const { nomeParaBusca, ufScope, cargoParam, sendEvent } = params;
	const candidatosGlobais: any[] = [];
	let hasApiError = false;

	if (cargoParam === "GOVERNADOR" || cargoParam === "PREFEITO") {
		const exec = await buscarCandidatosExecutivoDireto(
			cargoParam,
			nomeParaBusca,
			ufScope,
			sendEvent,
		);
		candidatosGlobais.push(...exec);
		return { candidatosGlobais, hasApiError };
	}

	const fed = await consultarCamaraESenado(nomeParaBusca, ufScope, sendEvent);
	candidatosGlobais.push(...fed.candidatos);
	if (fed.hasApiError) hasApiError = true;

	const podeBuscarTseFed =
		candidatosGlobais.length === 0 &&
		ufScope &&
		ufScope !== "FEDERAL" &&
		ufScope !== "BR";
	if (podeBuscarTseFed) {
		const tseFed = await buscarFallbackFederaisTSE(
			nomeParaBusca,
			ufScope,
			sendEvent,
		);
		candidatosGlobais.push(...tseFed);
	}

	const subHasError = await cascataNaoFederal(params, candidatosGlobais);
	if (subHasError) hasApiError = true;

	return { candidatosGlobais, hasApiError };
}

// ============================================================================
// HELPERS DE IDENTIFICAÇÃO POR REF
// ============================================================================

async function identificarRefCamara(
	idRef: string,
	nomeParaBusca: string,
	nomeBruto: string | null,
	ufScope: string | null,
) {
	const deputadoBasico = await buscarPolitico(`id=${idRef}`);
	if (deputadoBasico) {
		deputadoBasico.casa = "CAMARA";
		return deputadoBasico;
	}

	console.warn(
		`[CÂMARA] buscarPolitico falhou (timeout/erro) para id=${idRef}. Buscando no índice local...`,
	);
	const localMatch = (congressoIndex as any[]).find(
		(p: any) => String(p.id) === String(idRef),
	);
	return {
		id: idRef,
		uri: `https://dadosabertos.camara.leg.br/api/v2/deputados/${idRef}`,
		nome: localMatch?.nome || (nomeBruto || nomeParaBusca).toUpperCase(),
		uf: localMatch?.uf || ufScope || "BR",
		idLegislatura: 57,
		casa: "CAMARA",
	};
}

async function identificarRefSenado(
	idRef: string,
	nomeParaBusca: string,
	nomeBruto: string | null,
	ufScope: string | null,
) {
	const senadoresAll = await buscarSenadoresLista(nomeParaBusca);
	const encontrado = senadoresAll.find((s) => String(s.id) === idRef);
	if (encontrado) return encontrado;

	console.warn(
		`[SENADO] buscarSenadoresLista falhou ou ID não achado para id=${idRef}. Buscando no índice local...`,
	);
	const localMatchSenado = (congressoIndex as any[]).find(
		(p: any) => String(p.id) === String(idRef),
	);
	return {
		id: idRef,
		uri: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${idRef}`,
		nome: localMatchSenado?.nome || (nomeBruto || nomeParaBusca).toUpperCase(),
		uf: localMatchSenado?.uf || ufScope || "BR",
		idLegislatura: 57,
		casa: "SENADO",
	};
}

function identificarRefMunicipalSP(partesSP: string[], nomeFallback: string) {
	const municipioRef = partesSP.length >= 4 ? partesSP[2] : "sao-paulo";
	const idSP = partesSP.length >= 4 ? partesSP[3] : partesSP[2];
	return {
		id: idSP,
		uri: municipioRef,
		nome: nomeFallback.toUpperCase(),
		uf: "SP",
		idLegislatura: 18,
		casa: "CAMARA_MUNICIPAL_SP",
	};
}

function identificarRefMunicipalRJ(partesRJ: string[], nomeFallback: string) {
	const municipioRefRJ =
		partesRJ.length >= 4 ? partesRJ[2] : "rio-de-janeiro";
	const idRJ = partesRJ.length >= 4 ? partesRJ[3] : partesRJ[2];
	return {
		id: idRJ,
		uri: municipioRefRJ,
		nome: nomeFallback.toUpperCase(),
		uf: "RJ",
		idLegislatura: 11,
		casa: "CAMARA_MUNICIPAL_RJ",
	};
}

function parseAssembleiaNome(partes: string[], fallback: string): string {
	let nome =
		partes.length >= 3 ? decodeURIComponent(partes[2]) : fallback.toUpperCase();
	if (nome.includes("%")) nome = decodeURIComponent(nome);
	return nome;
}

function identificarRefAlerj(partesAlerj: string[], nomeFallback: string) {
	const nomeAlerj = parseAssembleiaNome(partesAlerj, nomeFallback);
	const docAlerj = partesAlerj.length >= 4 ? partesAlerj[3] : "";
	return {
		id: docAlerj || nomeAlerj,
		uri: "https://www.alerj.rj.gov.br/Deputados/QuemSao",
		nome: nomeAlerj,
		uf: "RJ",
		idLegislatura: 13,
		casa: "ALERJ",
	};
}

function identificarRefAlesp(partesAlesp: string[], nomeFallback: string) {
	const nomeAlesp = parseAssembleiaNome(partesAlesp, nomeFallback);
	const docAlesp = partesAlesp.length >= 4 ? partesAlesp[3] : "";
	return {
		id: docAlesp || nomeAlesp,
		uri: "https://www.al.sp.gov.br/alesp/deputados",
		nome: nomeAlesp,
		uf: "SP",
		idLegislatura: 20,
		casa: "ALESP",
	};
}

function identificarRefMunicipalGenerico(
	partesGen: string[],
	nomeFallback: string,
) {
	const ufGen = partesGen[0];
	const cargoGen = partesGen[1];
	const municGen = partesGen.length >= 3 ? partesGen[2] : "";
	const docGen = partesGen.length >= 4 ? partesGen[3] : "";

	return {
		id: docGen || nomeFallback,
		uri: municGen,
		nome: nomeFallback.toUpperCase(),
		uf: ufGen,
		idLegislatura: 2024,
		casa:
			cargoGen === "PREFEITO" ? "PREFEITURA" : `CAMARA_MUNICIPAL_${ufGen}`,
	};
}

const CODIGO_TSE_CARGO: Record<string, string> = {
	GOVERNADOR: "3",
	PRESIDENTE: "1",
	PREFEITO: "11",
};

const CASA_EXECUTIVO: Record<string, string> = {
	PRESIDENTE: "PRESIDENCIA_DA_REPUBLICA",
	GOVERNADOR: "GOVERNO_ESTADUAL",
	PREFEITO: "PREFEITURA",
};

async function identificarRefExecutivo(
	forceRef: string,
	nomeParaBusca: string,
	sendEvent: (tipo: string, payload: any) => void,
) {
	const partesGov = forceRef.split(":");
	const cargoTipo = partesGov[0];
	const ufGov = partesGov.length >= 2 ? partesGov[1].toUpperCase() : "BR";
	const nomeGov = partesGov.length >= 3 ? partesGov[2] : nomeParaBusca;
	const cTse = CODIGO_TSE_CARGO[cargoTipo] || "11";

	sendEvent("STATUS", {
		msg: `Buscando ${cargoTipo} "${nomeGov}" na base eleitoral TSE...`,
	});
	const tseDados = await buscarCpfNoTSE(nomeGov, ufGov, cTse);
	const docId = tseDados?.documentoPrincipal?.replace(/\D/g, "") || nomeGov;

	const deputadoBasico = {
		id: docId,
		uri: "",
		nome: tseDados?.nome || nomeGov,
		uf: ufGov,
		idLegislatura: tseDados?.anoEleicao || 2023,
		casa: CASA_EXECUTIVO[cargoTipo] || "PREFEITURA",
		_tseResult: tseDados,
	};
	return deputadoBasico;
}

function identificarRefLegislativoFederal(
	forceRef: string,
	nomeParaBusca: string,
	nomeBruto: string | null,
	ufScope: string | null,
) {
	const partes = forceRef.split(":");
	const casa = partes[1];
	const idRef = partes[2];
	return casa === "CAMARA"
		? identificarRefCamara(idRef, nomeParaBusca, nomeBruto, ufScope)
		: identificarRefSenado(idRef, nomeParaBusca, nomeBruto, ufScope);
}

function identificarRefEstadualLocal(
	forceRef: string,
	partes: string[],
	nomeFallback: string,
) {
	if (forceRef.startsWith("ALERJ:"))
		return identificarRefAlerj(partes, nomeFallback);
	if (forceRef.startsWith("ALESP:"))
		return identificarRefAlesp(partes, nomeFallback);
	return null;
}

function identificarRefMunicipalLocal(
	forceRef: string,
	partes: string[],
	nomeFallback: string,
) {
	if (forceRef.startsWith("SP:"))
		return identificarRefMunicipalSP(partes, nomeFallback);
	if (forceRef.startsWith("RJ:"))
		return identificarRefMunicipalRJ(partes, nomeFallback);
	if (/^[A-Z]{2}:(PREFEITO|VEREADOR):/.test(forceRef)) {
		return identificarRefMunicipalGenerico(partes, nomeFallback);
	}
	return null;
}

export async function identificarCandidatoPorRef(
	forceRef: string,
	nomeParaBusca: string,
	nomeBruto: string | null,
	ufScope: string | null,
	sendEvent: (tipo: string, payload: any) => void,
) {
	if (forceRef.startsWith("FEDERAL:")) {
		return identificarRefLegislativoFederal(
			forceRef,
			nomeParaBusca,
			nomeBruto,
			ufScope,
		);
	}

	const nomeFallback = nomeBruto || nomeParaBusca;
	const partes = forceRef.split(":");

	const estadual = identificarRefEstadualLocal(forceRef, partes, nomeFallback);
	if (estadual) return estadual;

	const municipal = identificarRefMunicipalLocal(
		forceRef,
		partes,
		nomeFallback,
	);
	if (municipal) return municipal;

	const ehExecutivo =
		forceRef.startsWith("GOVERNADOR:") ||
		forceRef.startsWith("PREFEITO:") ||
		forceRef.startsWith("PRESIDENTE:");
	if (ehExecutivo) {
		return identificarRefExecutivo(forceRef, nomeParaBusca, sendEvent);
	}

	return null;
}
