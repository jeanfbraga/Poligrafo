import { cnpjValido } from "@/lib/documento";
import { buscarContratosPorFornecedor } from "@/services/integrations/contratos/fornecedor";
import { buscarSancoesEmpresa } from "@/services/integrations/transparencia/sancoes-empresa";
import { buscarNomeacoesDOU } from "@/services/integrations/dou/client";
import { buscarDiariosMunicipais } from "@/services/integrations/dou/queridodiario";
import { buscarDadosCnpj } from "@/services/integrations/receita/cnpj";
import { buscarConveniosTransferegov } from "./osint-contratos";

/** Sanções da empresa em CEIS/CNEP/CEPIM (o antigo /sancoes não existe). */
async function avaliarSancoes(cnpjLimpo: string): Promise<{ alerta?: string; penalidade: number }> {
	try {
		const sancoes = await buscarSancoesEmpresa(cnpjLimpo);
		if (sancoes.length > 0) {
			const bases = [...new Set(sancoes.map((s) => s.base.toUpperCase()))].join("/");
			return { alerta: `[CGU/${bases}] Empresa Sancionada/Inidônea.`, penalidade: 50 };
		}
	} catch {}
	return { penalidade: 0 };
}

/** Contratos federais em que a empresa é fornecedora (CGU; compras.dados legado não existe mais). */
async function avaliarContratos(cnpjLimpo: string): Promise<{ alerta?: string; penalidade: number }> {
	try {
		const contratos = await buscarContratosPorFornecedor(cnpjLimpo, { paginasCgu: 1, paginasPncp: 0 });
		if (contratos.length > 0) {
			return { alerta: `[CGU] ${contratos.length} contrato(s) federal(is) como fornecedora.`, penalidade: 10 };
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

	if (!cnpjValido(cnpjLimpo)) {
		return { scorePenalidade: 0, alertas, capitalSocial, dataAbertura, socios };
	}

	const checagens = await Promise.all([
		avaliarSancoes(cnpjLimpo),
		avaliarContratos(cnpjLimpo),
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

/**
 * Citação do sócio no DOU ou num diário municipal: só CONTEXTO, sem nota. A busca é
 * pelo nome, em todo o país: pode ser homônimo. Antes, qualquer portaria com o mesmo
 * nome virava "Nepotismo/Laranja detectado" (nota 90) e o nome igual a um servidor da
 * CMRJ virava "alerta de nepotismo" (nota 100). Parentesco e vínculo só com prova:
 * services/cruzamentos (gabinete.ts, socios.ts).
 */
export const AVISO_HOMONIMO = "busca pelo nome; pode ser homônimo";

export function citacaoNoDou(pub: any): string {
	const tipo = pub?.tipoPublicacao || pub?.titulo || "publicação";
	const orgao = pub?.orgao || "órgão federal";
	return `[DOU] Publicação com o mesmo nome (${AVISO_HOMONIMO}): ${tipo} — ${orgao}.`;
}

export function citacaoNoDiarioMunicipal(gazette: any): string {
	const cidade = gazette?.territory_name || "município";
	const primeiro = gazette?.excerpts?.[0];
	const trecho = typeof primeiro === "string" ? ` Trecho: "${primeiro.substring(0, 150)}..."` : "";
	return `[QUERIDO DIÁRIO] Citação com o mesmo nome em ${cidade} (${AVISO_HOMONIMO}).${trecho}`;
}

async function checarDouSocio(nomeSocio: string): Promise<string> {
	try {
		const pub = (await buscarNomeacoesDOU(nomeSocio, "ANO"))?.publicacoes?.[0];
		return pub ? citacaoNoDou(pub) : "";
	} catch {
		return "";
	}
}

async function checarDiariosMunicipaisSocio(nomeSocio: string): Promise<string> {
	try {
		const gazette = (await buscarDiariosMunicipais({ termo: nomeSocio, size: 3, timeout: 6000 }))?.gazettes?.[0];
		return gazette ? citacaoNoDiarioMunicipal(gazette) : "";
	} catch {
		return "";
	}
}

async function analisarSocio(nomeSocio: string): Promise<{ motivo?: string }> {
	const [dou, diario] = await Promise.all([checarDouSocio(nomeSocio), checarDiariosMunicipaisSocio(nomeSocio)]);
	return { motivo: [dou, diario].filter(Boolean).join(" ") || undefined };
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
			// Sem nota: a citação por nome é contexto (pode ser homônimo).
			data: {
				label: socio.nome_socio || "Sócio",
				cargo: socio.qualificacao_socio || "Sócio",
				motivo_ia: analise.motivo,
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
		// BrasilAPI com reserva no Minha Receita e fila (receita/cnpj.ts).
		const res = await buscarDadosCnpj(docLimpo);
		if (!res.ok) return [];

		const empresa: any = res.dados;
		emitirNodeEmpresa(empresa, docLimpo, pessoaId, sendEvent);
		await processarListaSocios(empresa.qsa || [], docLimpo, pessoaId, sendEvent);
		return [docLimpo];
	} catch {
		return [];
	}
}
