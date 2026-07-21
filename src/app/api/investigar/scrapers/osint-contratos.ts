import { fetchWithTimeout } from "../tse";

export async function buscarContratosPNCP(cnpj: string) {
	try {
		const agora = new Date();
		const dataFinal = agora.toISOString().slice(0, 10).replace(/-/g, "");
		const umAnoAtras = new Date(
			agora.getFullYear() - 1,
			agora.getMonth(),
			agora.getDate(),
		);
		const dataInicial = umAnoAtras.toISOString().slice(0, 10).replace(/-/g, "");
		const url = `https://pncp.gov.br/api/consulta/v1/contratos?dataInicial=${dataInicial}&dataFinal=${dataFinal}&cnpjOrgao=${cnpj}&pagina=1&tamanhoPagina=5`;
		const res = await fetchWithTimeout(url, { timeout: 6000 });
		if (!res.ok) return [];
		const json = await res.json();
		const items = json.data || json.content || json || [];
		if (!Array.isArray(items)) return [];
		return items
			.map((c: any) => ({
				orgao: c.orgaoEntidade?.razaoSocial || c.nomeOrgao || "N/I",
				objeto: c.objetoContrato || c.objeto || "N/I",
				valor: c.valorInicial || c.valorGlobal || 0,
				data: c.dataAssinatura || c.dataPublicacao || "",
			}))
			.slice(0, 5);
	} catch {
		return [];
	}
}

export async function buscarConveniosTransferegov(cnpjLimpo: string) {
	try {
		const url = `https://api.transferegov.gestao.gov.br/convenios?cnpj_convenente=${cnpjLimpo}`;
		const res = await fetchWithTimeout(url, { timeout: 12000 });
		if (!res.ok) return null;
		const data = await res.json();
		if (Array.isArray(data) && data.length > 0) {
			const valorTotal = data.reduce(
				(acc, curr) => acc + (Number(curr.valor_global) || 0),
				0,
			);
			return { quantidade: data.length, valorTotal };
		}
		return null;
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
