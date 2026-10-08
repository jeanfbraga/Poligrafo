import { buscarMunicipalCE } from "../estados/ce/tce";
import { buscarDespesasES } from "../estados/es/tce";
import { buscarDespesasPA } from "../estados/pa/tce";
import {
	buscarDespesasMunicipalPE,
	buscarMunicipalPE,
} from "../estados/pe/tce";
import { buscarDespesasPI } from "../estados/pi/tce";
import { buscarDespesasVereadorRJ, buscarMunicipalRJ } from "../estados/rj/tce";
import { buscarDespesasRN } from "../estados/rn/tce";
import {
	buscarDespesasMunicipalRS,
	buscarMunicipalRS,
} from "../estados/rs/tce";
import {
	buscarDespesasMunicipalSC,
	buscarMunicipalSC,
} from "../estados/sc/tce";
import { buscarDespesasVereadorSP, buscarMunicipalSP } from "../estados/sp/tce";
import {
	buscarDespesasAracaju,
	buscarMunicipalSE,
} from "../estados/se/aracaju";
import { buscarDespesasSE } from "../estados/se/tce";
import { buscarDespesasTO } from "../estados/to/tce";
import { buscarProxyOsint } from "../proxy_osint";
import { buscarCpfNoTSE } from "../tse";

type HandlerMunicipal = (nome: string) => Promise<any[]>;

const HANDLERS_MUNICIPAIS: Record<string, HandlerMunicipal> = {
	SP: (nome) => buscarMunicipalSP(nome),
	RJ: (nome) => buscarMunicipalRJ(nome),
	PE: (nome) => buscarMunicipalPE(nome),
	CE: (nome) => buscarMunicipalCE(nome),
	RS: (nome) => buscarMunicipalRS(nome),
	SC: (nome) => buscarMunicipalSC(nome),
	SE: (nome) => buscarMunicipalSE(nome),
};

// UFs sem extrator próprio: prefeitos e vereadores pelo TSE. Antes AC, AL, AM, AP, GO, MA, MS, MT,
// RO e RR ficavam de fora e o prefeito/vereador nem era encontrado. O DF não tem municípios.
const UFS_GENERICAS_TSE = new Set([
	"MG", "BA", "PR", "PB", "PI", "PA", "RN", "ES", "TO",
	"AC", "AL", "AM", "AP", "GO", "MA", "MS", "MT", "RO", "RR",
]);

/**
 * Orquestrador Geográfico: Decide para qual Tribunal de Contas (TCE)
 * enviar a varredura do político baseado no ufScope ("sp", "pe", "ce").
 */
export async function buscarMunicipalMestre(uf: string, nomeBuscado: string) {
	const estado = uf.toUpperCase();
	console.log(
		`[>> MUNICIPAL MASTER ROUTER] Direcionando busca para a malha municipal do Estado: ${estado}`,
	);

	const handler = HANDLERS_MUNICIPAIS[estado];
	if (handler) return handler(nomeBuscado);
	if (UFS_GENERICAS_TSE.has(estado)) return buscarMunicipalGenericoTSE(estado, nomeBuscado);

	console.warn(`[!] TCE do estado ${estado} não reconhecido no Polígrafo OSINT.`);
	return [];
}

/**
 * Motor Genérico TSE
 * Puxa Prefeitos e Vereadores para os estados sem extrator específico construído.
 */
async function buscarMunicipalGenericoTSE(uf: string, nomeBuscado: string) {
	const termo = nomeBuscado.toLowerCase().trim();
	const resultados: any[] = [];

	let tseResult = await buscarCpfNoTSE(termo, uf, "13"); // Vereador
	let tipoCargo: "CAMARA_MUNICIPAL" | "PREFEITURA" = "CAMARA_MUNICIPAL";
	let tituloCargo = "Vereador";

	if (!tseResult) {
		tseResult = await buscarCpfNoTSE(termo, uf, "11"); // Prefeito
		if (tseResult) {
			tipoCargo = "PREFEITURA";
			tituloCargo = "Prefeito";
		}
	}

	if (tseResult) {
		const nomeCompleto =
			tseResult.nome?.toUpperCase() || nomeBuscado.toUpperCase();
		const nomeUrna = (tseResult as any).nomeUrna?.toUpperCase() || null;
		const nomeExibicao =
			nomeUrna && nomeUrna !== nomeCompleto
				? `${nomeCompleto} (${nomeUrna})`
				: nomeCompleto;
		resultados.push({
			ref: `${uf}:${tituloCargo.toUpperCase()}:${tseResult.municipio}:${tseResult.documentoPrincipal}`,
			id: tseResult.documentoPrincipal,
			nome: nomeExibicao,
			cargo: `${tituloCargo} em ${tseResult.municipio.replace(/-/g, " ").toUpperCase()}`,
			uf: uf,
			isCnpj: tseResult.isCnpj,
			casa: tipoCargo,
			uri: tseResult.municipio,
		});
	}

	return resultados;
}

type ContextoDespesa = {
	identificador: string;
	nomeParaBusca?: string;
	municipioUri?: string;
	casa?: string;
};

async function fallbackProxyFederal(ctx: ContextoDespesa): Promise<any[]> {
	const res = await buscarProxyOsint(ctx.identificador, ctx.nomeParaBusca);
	return res.despesasFederais || [];
}

/** TCM-SP (capital) saiu: a API respondia 404 (canário de 07/10/2026). */
async function rotearDespesasSP(ctx: ContextoDespesa): Promise<any[]> {
	return buscarDespesasVereadorSP(ctx.identificador, ctx.nomeParaBusca || "");
}

/**
 * TCEs com fonte morta no canário de 07/10/2026: o pipe não chama mais endereço
 * que não existe. Os contratos da prefeitura vêm do PNCP (services/core/contratos-do-ente.ts).
 * Os clientes continuam em estados/{uf}/tce.ts para voltar fácil se a fonte voltar.
 */
export const TCES_APOSENTADOS: Record<string, string> = {
	MG: "TCE-MG: CKAN sem resource_id, falha de rede",
	BA: "TCM-BA: endpoint inexistente (404)",
	PR: "TCE-PR: endpoint inexistente (404)",
	CE: "TCE-CE: os dois endereços fora do ar",
	PB: "TCE-PB (Sagres): acesso negado (403)",
};

async function fonteAposentada(uf: string): Promise<any[]> {
	console.warn(`[TCE-${uf}] Fonte aposentada (${TCES_APOSENTADOS[uf]}); despesas do município por TCE não consultadas. Os contratos da prefeitura vêm do PNCP.`);
	return [];
}

async function rotearDespesasUri(
	ctx: ContextoDespesa,
	consultarNativo: (uri: string, casa: string) => Promise<any[]>,
): Promise<any[]> {
	if (ctx.municipioUri) return consultarNativo(ctx.municipioUri, ctx.casa || "PREFEITURA");
	return fallbackProxyFederal(ctx);
}

/** A base de Aracaju vale só para Aracaju (antes era usada para qualquer município de SE). */
async function rotearDespesasSE(ctx: ContextoDespesa): Promise<any[]> {
	const municipio = (ctx.municipioUri || "").toLowerCase();
	if (municipio === "aracaju") {
		return buscarDespesasAracaju(ctx.identificador, ctx.nomeParaBusca, ctx.municipioUri, ctx.casa);
	}
	return fallbackProxyFederal(ctx);
}

async function rotearDespesasTO(ctx: ContextoDespesa): Promise<any[]> {
	const despesasTO = await buscarDespesasTO(ctx.identificador, ctx.nomeParaBusca);
	if (despesasTO.length > 0) return despesasTO;
	console.log(`[TCE-TO] Sem despesas nativas, fallback para Proxy OSINT Federal.`);
	return fallbackProxyFederal(ctx);
}

const ROTEADORES_DESPESA: Record<string, (ctx: ContextoDespesa) => Promise<any[]>> = {
	SP: rotearDespesasSP,
	MG: () => fonteAposentada("MG"),
	BA: () => fonteAposentada("BA"),
	PR: () => fonteAposentada("PR"),
	ES: (ctx) => rotearDespesasUri(ctx, buscarDespesasES),
	PI: (ctx) => rotearDespesasUri(ctx, buscarDespesasPI),
	RN: (ctx) => rotearDespesasUri(ctx, buscarDespesasRN),
	PA: (ctx) => (ctx.municipioUri ? buscarDespesasPA(ctx.identificador, ctx.municipioUri, ctx.nomeParaBusca) : fallbackProxyFederal(ctx)),
	RJ: (ctx) => buscarDespesasVereadorRJ(ctx.identificador, ctx.nomeParaBusca, ctx.municipioUri, ctx.casa),
	PE: (ctx) => buscarDespesasMunicipalPE(ctx.identificador, ctx.nomeParaBusca, ctx.municipioUri, ctx.casa),
	CE: () => fonteAposentada("CE"),
	RS: (ctx) => buscarDespesasMunicipalRS(ctx.identificador, ctx.nomeParaBusca, ctx.municipioUri, ctx.casa),
	SC: (ctx) => buscarDespesasMunicipalSC(ctx.identificador, ctx.nomeParaBusca, ctx.municipioUri, ctx.casa),
	PB: () => fonteAposentada("PB"),
	SE: rotearDespesasSE,
	TO: rotearDespesasTO,
};

/**
 * Orquestrador Geográfico: Despesas.
 * Re-roteia despesas para o respectivo estado caso a casa legislativa exija parse nativo do TCE.
 */
export async function buscarDespesasMunicipalMestre(
	uf: string,
	identificador: string,
	nomeParaBusca?: string,
	municipioUri?: string,
	casa?: string,
) {
	const estado = uf.toUpperCase();
	const roteador = ROTEADORES_DESPESA[estado];
	if (roteador) {
		return roteador({ identificador, nomeParaBusca, municipioUri, casa });
	}
	console.warn(`[!] Motor de Despesas do TCE-${estado} não está mapeado.`);
	return [];
}
