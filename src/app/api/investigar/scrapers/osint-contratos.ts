import { buscarContratosPorFornecedor } from "@/services/integrations/contratos/fornecedor";
import { buscarConveniosEntidade } from "@/services/integrations/transparencia/convenios-client";
import { fetchWithTimeout } from "../tse";

/**
 * Contratos públicos em que o CNPJ (doador) é o FORNECEDOR.
 * Antes consultava o PNCP com `cnpjOrgao` = CNPJ do doador, ou seja, contratos
 * em que o doador seria o órgão contratante — o oposto do que se queria.
 */
export async function buscarContratosPNCP(cnpj: string) {
	try {
		const contratos = await buscarContratosPorFornecedor(cnpj, { paginasCgu: 1, paginasPncp: 1 });
		return contratos.slice(0, 5).map((c) => ({
			id: c.id,
			fonte: c.fonte,
			orgao: c.orgaoEntidade.razaoSocial || "N/I",
			objeto: c.objetoContrato || "N/I",
			valor: c.valorGlobal,
			data: c.dataAssinatura || "",
			url: c.url,
		}));
	} catch {
		return [];
	}
}

/**
 * Convênios federais em que o CNPJ é o convenente (Portal da Transparência).
 * Antes usava o TransfereGov `/convenios?cnpj_convenente=`, que responde 404.
 */
export async function buscarConveniosTransferegov(cnpjLimpo: string) {
	try {
		const convenios = await buscarConveniosEntidade(cnpjLimpo);
		if (convenios.length === 0) return null;
		const valorTotal = convenios.reduce((acc, c) => acc + (Number(c.valorGlobal) || 0), 0);
		return { quantidade: convenios.length, valorTotal };
	} catch (_e) {
		return null;
	}
}

export async function verificarAeronaveAnac(textoBusca: string) {
	const regexPrefixo = /\b(PR|PP|PT|PS)[-\s]?([A-Z]{3}|[0-9]{3})\b/gi;
	const match = regexPrefixo.exec(textoBusca);
	if (!match) return null;

	const prefixo = `${match[1]}-${match[2]}`.toUpperCase();
	try {
		const url = `https://rab.api.aero/v1/aeronaves/${prefixo}`;
		const res = await fetchWithTimeout(url, { timeout: 3500 });
		if (!res.ok) return null;
		return await res.json();
	} catch (_e) {
		return null;
	}
}
