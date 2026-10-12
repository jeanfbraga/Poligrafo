/**
 * F. Siga o Dinheiro da Campanha: doadores (contas de campanha no Banco de Perfil, pelo número
 * do candidato) e cruzamento dos doadores CNPJ com contratos públicos (CGU e PNCP).
 * Devolve a lista de doadores, que vai ao contexto da IA e aos cruzamentos.
 * Sem o TSE ao vivo desde 12/10/2026 (recusa servidores de nuvem).
 */
import { cruzarDoadoresComContratosPublicos } from "@/services/core/doadores-contratos";
import { doadoresDaCampanha } from "@/services/integrations/tse/campanha";
import { type Investigacao, naMalha, status } from "./contexto";

async function cruzarDoadoresCnpj(inv: Investigacao, doadores: string[]): Promise<void> {
	const cnpjs = [...new Set(doadores.filter((d: string) => d.length === 14))].slice(0, 15);
	if (cnpjs.length === 0) {
		status(inv, "Nenhum doador CNPJ identificado no TSE para este mandato.");
		return;
	}
	status(inv, `Identificados ${cnpjs.length} doadores CNPJ. Cruzando com contratos públicos (CGU e PNCP)...`);
	const nos = await cruzarDoadoresComContratosPublicos(cnpjs, inv.pessoaId, (msg) => status(inv, msg));
	for (const no of nos) naMalha(inv, no);
}

export async function sigaODinheiro(inv: Investigacao): Promise<string[]> {
	status(inv, "Iniciando análise: 'Siga o Dinheiro da Campanha'...");
	const doadores = await doadoresDaCampanha(inv.identidade.sqCandidato);
	await cruzarDoadoresCnpj(inv, doadores);
	return doadores;
}
