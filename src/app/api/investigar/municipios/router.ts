/**
 * Despesas municipais por UF (tribunais de contas e bases próprias). Quem é o prefeito ou
 * vereador vem da base de eleitos (busca-candidatos.ts); a antiga varredura de municípios
 * no TSE ao vivo saiu em 12/10/2026 (o DivulgaCand recusa servidores de nuvem).
 */
import { buscarDespesasES } from "../estados/es/tce";
import { buscarDespesasPA } from "../estados/pa/tce";
import { buscarDespesasMunicipalPE } from "../estados/pe/tce";
import { buscarDespesasPI } from "../estados/pi/tce";
import { buscarDespesasVereadorRJ } from "../estados/rj/tce";
import { buscarDespesasRN } from "../estados/rn/tce";
import { buscarDespesasMunicipalRS } from "../estados/rs/tce";
import { buscarDespesasMunicipalSC } from "../estados/sc/tce";
import { buscarDespesasVereadorSP } from "../estados/sp/tce";
import { buscarDespesasAracaju } from "../estados/se/aracaju";
import { buscarDespesasSE } from "../estados/se/tce";
import { buscarDespesasTO } from "../estados/to/tce";
import { buscarProxyOsint } from "../proxy_osint";

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
