/**
 * Sanções de uma EMPRESA (CNPJ) no Portal da Transparência.
 *
 * O código consultava `/api-de-dados/sancoes?cnpjSancionado=` — endpoint que
 * não existe (o canário de 06/10/2026 recebeu 403), então nenhuma empresa
 * aparecia como sancionada. Os parâmetros certos (mcp-brasil,
 * data/transparencia/constants.py, SANCOES_DATABASES):
 *   /ceis e /cnep  → codigoSancionado
 *   /cepim         → cnpjSancionado
 */
import { buscarJson } from "@/lib/fonte-http";
import { soDigitos } from "@/lib/documento";
import { transparenciaLimiter } from "@/services/core/rate-limiter";

const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

export const BASES_SANCOES_EMPRESA = [
	{ base: "ceis", parametro: "codigoSancionado", nome: "CEIS (Inidôneas e Suspensas)" },
	{ base: "cnep", parametro: "codigoSancionado", nome: "CNEP (Empresas Punidas)" },
	{ base: "cepim", parametro: "cnpjSancionado", nome: "CEPIM (Impedidas de convênio)" },
] as const;

export interface SancaoEmpresa {
	base: string;
	nomeBase: string;
	registro: any;
}

export async function buscarSancoesEmpresa(
	cnpj: string,
	apiKey: string | undefined = process.env.TRANSPARENCIA_API_KEY,
	fetchFn?: typeof fetch,
): Promise<SancaoEmpresa[]> {
	const doc = soDigitos(cnpj);
	if (!apiKey || doc.length !== 14) return [];
	const consultas = BASES_SANCOES_EMPRESA.map(async (b) => {
		await transparenciaLimiter.acquire();
		const r = await buscarJson<any[]>(`${BASE}/${b.base}?${b.parametro}=${doc}&pagina=1`, {
			fonte: `cgu-${b.base}`, headers: { "chave-api-dados": apiKey }, timeoutMs: 8_000, fetchFn,
		});
		const registros = r.ok && Array.isArray(r.dados) ? r.dados : [];
		return registros.map((registro) => ({ base: b.base, nomeBase: b.nome, registro }));
	});
	return (await Promise.all(consultas)).flat();
}
