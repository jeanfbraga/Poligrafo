/**
 * F. Siga o Dinheiro da Campanha: doadores (contas de campanha no Banco de Perfil, pelo número
 * do candidato) e cruzamento dos doadores CNPJ com contratos públicos (CGU e PNCP).
 * Devolve a lista de doadores, que vai ao contexto da IA e aos cruzamentos.
 */
import { buscarDoadoresTSE } from "@/app/api/investigar/tse";
import { cruzarDoadoresComContratosPublicos } from "@/services/core/doadores-contratos";
import { type Investigacao, naMalha, status } from "./contexto";

const CARGOS_ELEICAO_GERAL = ["3", "5", "6", "7"];

function eleicaoDoCargo(cargoTse: string): string {
	return CARGOS_ELEICAO_GERAL.includes(cargoTse) ? "2040602022" : "2045202024";
}

/** Municipal precisa do código do município (idUe); estadual (governador), a UF basta. */
function localidade(inv: Investigacao): string | undefined {
	return inv.dep._tseResult?.idUe || (inv.dep.casa === "GOVERNO_ESTADUAL" ? inv.dep.uf : undefined);
}

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

export async function sigaODinheiro(inv: Investigacao): Promise<any[]> {
	status(inv, "Iniciando análise: 'Siga o Dinheiro da Campanha'...");
	const cargoTse = inv.perfil.cargoTse;
	const eleicao = eleicaoDoCargo(cargoTse);
	const codigo = localidade(inv);
	let doadores: any[] | null = null;
	if (codigo) {
		doadores = await buscarDoadoresTSE(inv.dep.nome, codigo, cargoTse, eleicao, inv.identidade.sqCandidato);
		await cruzarDoadoresCnpj(inv, doadores);
	}
	// BUSCA DOS DOADORES ANTES DA IA PARA INJETAR NO CONTEXTO (reutiliza a da etapa anterior)
	status(inv, `Puxando financiadores de campanha no TSE...`);
	return doadores ?? buscarDoadoresTSE(inv.dep.nome, inv.dep.uf, cargoTse, eleicao, inv.identidade.sqCandidato);
}
