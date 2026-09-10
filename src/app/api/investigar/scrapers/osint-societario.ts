import { checkNepotismoCMRJ } from "@/services/integrations/cmrj/nepotismo-client";
import { buscarNomeacoesDOU } from "@/services/integrations/dou/client";
import { buscarDiariosMunicipais } from "@/services/integrations/dou/queridodiario";
import { fetchWithTimeout } from "../tse";
import { buscarConveniosTransferegov } from "./osint-contratos";

async function avaliarSancoes(
	resSancoes: PromiseSettledResult<any>,
): Promise<{ alerta?: string; penalidade: number }> {
	if (resSancoes.status !== "fulfilled" || !resSancoes.value.ok) {
		return { penalidade: 0 };
	}
	try {
		const sancoes = await resSancoes.value.json();
		if (Array.isArray(sancoes) && sancoes.length > 0) {
			return { alerta: "[CGU/CEIS] Empresa Sancionada/Inidônea.", penalidade: 50 };
		}
	} catch {}
	return { penalidade: 0 };
}

async function avaliarContratos(
	resCompras: PromiseSettledResult<any>,
): Promise<{ alerta?: string; penalidade: number }> {
	if (resCompras.status !== "fulfilled" || !resCompras.value.ok) {
		return { penalidade: 0 };
	}
	try {
		const comprasData = await resCompras.value.json();
		const contratos = comprasData?._embedded?.contratos || [];
		if (contratos.length > 0) {
			return {
				alerta: `[COMPRAS.GOV] ${contratos.length} Contratos Federais Ativos.`,
				penalidade: 10,
			};
		}
	} catch {}
	return { penalidade: 0 };
}

async function avaliarConvenios(
	cnpjLimpo: string,
): Promise<{ alerta?: string; penalidade: number }> {
	try {
		const convenios = await buscarConveniosTransferegov(cnpjLimpo);
		if (convenios && convenios.valorTotal > 0) {
			return {
				alerta: `[TRANSFEREGOV] Recebedor de ${convenios.quantidade} Convênio(s) Federal(is). Total: R$ ${convenios.valorTotal.toLocaleString("pt-BR")}`,
				penalidade: 30,
			};
		}
	} catch {}
	return { penalidade: 0 };
}

export async function investigarFornecedorNivelHard(cnpj: string) {
	const cnpjLimpo = cnpj ? cnpj.replace(/[^\d]+/g, "") : "";
	const alertas: string[] = [];
	const capitalSocial: any = "Dado Indisponível";
	const dataAbertura = "Dado Indisponível";
	const socios: string[] = [];

	if (cnpjLimpo.length !== 14 || cnpjLimpo === "00000000000000") {
		return { scorePenalidade: 0, alertas, capitalSocial, dataAbertura, socios };
	}

	const apiKey = process.env.TRANSPARENCIA_API_KEY || "";
	const promessaSancoes = apiKey
		? fetchWithTimeout(
				`https://api.portaldatransparencia.gov.br/api-de-dados/sancoes?cnpjSancionado=${cnpjLimpo}&pagina=1`,
				{ headers: { "chave-api-dados": apiKey } },
		  )
		: Promise.reject("No API Key");

	const [resSancoes, resCompras] = await Promise.allSettled([
		promessaSancoes,
		fetchWithTimeout(
			`https://compras.dados.gov.br/contratos/v1/contratos.json?cnpj_contratada=${cnpjLimpo}`,
		),
	]);

	const checagens = await Promise.all([
		avaliarSancoes(resSancoes),
		avaliarContratos(resCompras),
		avaliarConvenios(cnpjLimpo),
	]);

	let penality = 0;
	for (const check of checagens) {
		if (check.alerta) alertas.push(check.alerta);
		penality += check.penalidade;
	}

	return {
		scorePenalidade: penality,
		alertas,
		capitalSocial,
		dataAbertura,
		socios,
	};
}

function isPublicacaoNomeacao(tipo: string, titulo: string): boolean {
	return /nomea[çc]|nomear|portaria/i.test(`${tipo} ${titulo}`);
}

function formatarMotivoDou(
	pub: any,
	ehNomeacao: boolean,
): { motivo: string; score: number } {
	const orgao = pub.orgao || "Órgão Federal";
	if (ehNomeacao) {
		const assinante = pub.assinante || "autoridade";
		return {
			motivo: `[DOU] NOMEAÇÃO EM CARGO COMISSIONADO: ${orgao.toUpperCase()} (Nepotismo/Laranja detectado nas proximidades de ${assinante})`,
			score: 90,
		};
	}
	const pubTipo = pub.tipoPublicacao || "PUBLICAÇÃO";
	return {
		motivo: `[DOU] ATO DE PESSOAL: ${pubTipo.toUpperCase()} NO DIÁRIO OFICIAL DA UNIÃO (${orgao})`,
		score: 60,
	};
}

async function checarDouSocio(
	nomeSocio: string,
): Promise<{ motivo: string; score: number }> {
	try {
		const douRes = await buscarNomeacoesDOU(nomeSocio, "ANO");
		const pub = douRes?.publicacoes?.[0];
		if (!pub) return { motivo: "", score: 0 };

		const ehNomeacao = isPublicacaoNomeacao(
			pub.tipoPublicacao || "",
			pub.titulo || "",
		);
		return formatarMotivoDou(pub, ehNomeacao);
	} catch {
		return { motivo: "", score: 0 };
	}
}

function isTrechoNomeacaoOuContrato(trecho: string): boolean {
	return /nomea[çc]|contrat|portaria/i.test(trecho);
}

function extrairTrechoGazette(gazette: any): string {
	const primeiro = gazette.excerpts?.[0];
	return typeof primeiro === "string" ? primeiro.substring(0, 150) : "";
}

function formatarResultadoDiario(
	gazette: any,
	trecho: string,
	isNomeacao: boolean,
	scoreAtual: number,
	motivoAtual: string,
): { motivo: string; score: number } {
	const cidade = gazette.territory_name || "Município";
	if (isNomeacao) {
		return {
			motivo: `[QUERIDO DIÁRIO] CITAÇÃO MUNICIPAL (${cidade}): Possível nomeação ou contrato nas proximidades de autoridade. Excerto: "${trecho}..."`,
			score: Math.max(scoreAtual, 85),
		};
	}
	if (!motivoAtual) {
		return {
			motivo: `[QUERIDO DIÁRIO] CITAÇÃO MUNICIPAL (${cidade}. Excerto: "${trecho}..."`,
			score: 40,
		};
	}
	return { motivo: motivoAtual, score: scoreAtual };
}

async function checarDiariosMunicipaisSocio(
	nomeSocio: string,
	scoreAtual: number,
	motivoAtual: string,
): Promise<{ motivo: string; score: number }> {
	try {
		const qdRes = await buscarDiariosMunicipais({
			termo: nomeSocio,
			size: 3,
			timeout: 6000,
		});
		const gazette = qdRes?.gazettes?.[0];
		if (!gazette) return { motivo: motivoAtual, score: scoreAtual };

		const trecho = extrairTrechoGazette(gazette);
		const isNomeacao = isTrechoNomeacaoOuContrato(trecho);
		return formatarResultadoDiario(
			gazette,
			trecho,
			isNomeacao,
			scoreAtual,
			motivoAtual,
		);
	} catch {
		return { motivo: motivoAtual, score: scoreAtual };
	}
}

async function checarNepotismoCmrjSocio(
	nomeSocio: string,
): Promise<{ motivo: string; score: number } | null> {
	try {
		const nepoMatch = await checkNepotismoCMRJ(nomeSocio);
		if (nepoMatch) {
			const lotacaoStr = nepoMatch.lotacao || "Lotação N/I";
			const cargoStr = nepoMatch.cargo || nepoMatch.vinculo || "Cargo N/I";
			return {
				motivo: `🚨 [ALERTA DE NEPOTISMO] O sócio da empresa do investigado (${nomeSocio}) está na Folha de Pagamento da Câmara Municipal do Rio (CMRJ)! Lotação: ${lotacaoStr} - Cargo: ${cargoStr}.`,
				score: 100,
			};
		}
	} catch {}
	return null;
}

async function analisarSocio(
	nomeSocio: string,
): Promise<{ motivo?: string; score: number }> {
	const dou = await checarDouSocio(nomeSocio);
	const qd = await checarDiariosMunicipaisSocio(nomeSocio, dou.score, dou.motivo);
	const nepo = await checarNepotismoCmrjSocio(nomeSocio);
	if (nepo) {
		return nepo;
	}
	return {
		motivo: qd.motivo || undefined,
		score: qd.score,
	};
}

function emitirNodeEmpresa(
	empresa: any,
	docLimpo: string,
	pessoaId: string,
	sendEvent: any,
): void {
	sendEvent("NODE_NOVO", {
		id: `empresa-${docLimpo}`,
		type: "EMPRESA",
		_origemId: pessoaId,
		data: {
			label: empresa.razao_social || "Empresa Localizada",
			cnpj: docLimpo,
			capitalSocial: empresa.capital_social || 0,
			cnae: empresa.cnae_fiscal_descricao || "",
			situacao: empresa.descricao_situacao_cadastral || "Ativa",
		},
	});
}

async function processarListaSocios(
	qsa: any[],
	docLimpo: string,
	pessoaId: string,
	sendEvent: any,
): Promise<void> {
	const limitados = qsa.slice(0, 5);
	for (let i = 0; i < limitados.length; i++) {
		const socio = limitados[i];
		const analise = await analisarSocio(socio.nome_socio || "");

		sendEvent("NODE_NOVO", {
			id: `socio-${docLimpo}-${i}`,
			type: "SOCIO",
			_origemId: pessoaId,
			data: {
				label: socio.nome_socio || "Sócio",
				cargo: socio.qualificacao_socio || "Sócio",
				motivo_ia: analise.motivo,
				score_letalidade: analise.score,
			},
		});
	}
}

export async function expandirMalhaSocietaria(
	docLimpo: string,
	pessoaId: string,
	sendEvent: any,
): Promise<string[]> {
	if (docLimpo.length !== 14) return [];

	try {
		const res = await fetchWithTimeout(
			`https://brasilapi.com.br/api/cnpj/v1/${docLimpo}`,
			{ timeout: 6000 },
		);
		if (!res.ok) return [];

		const empresa = await res.json();
		emitirNodeEmpresa(empresa, docLimpo, pessoaId, sendEvent);
		await processarListaSocios(empresa.qsa || [], docLimpo, pessoaId, sendEvent);
		return [docLimpo];
	} catch {
		return [];
	}
}
