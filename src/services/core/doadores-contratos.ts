/**
 * Doador de campanha que também tem contrato público ("toma-lá-dá-cá").
 *
 * Antes: consulta em série a `compras.dados.gov.br` (endpoint que não existe
 * mais — nunca achava nada) com pausa de 400 ms por doador. Agora usa os
 * contratos do FORNECEDOR conferidos (CGU + PNCP), 3 doadores por vez, e o
 * nó carrega os contratos que provam o achado (órgão, valor, link).
 *
 * Na Fase 3 do plano isto vira uma regra do motor de cruzamentos (nota 31).
 */
import {
	buscarContratosPorFornecedor,
	type ContratoFornecedor,
} from "@/services/integrations/contratos/fornecedor";

const POR_VEZ = 3;

type BuscarContratos = (cnpj: string) => Promise<ContratoFornecedor[]>;

const buscarPadrao: BuscarContratos = (cnpj) =>
	buscarContratosPorFornecedor(cnpj, { paginasCgu: 1, paginasPncp: 1 });

export function montarNoDoadorComContrato(cnpj: string, contratos: ContratoFornecedor[], pessoaId: string) {
	const valorTotal = contratos.reduce((acc, c) => acc + c.valorGlobal, 0);
	return {
		id: `toma-la-da-ca-${cnpj}`,
		type: "DESPESA" as const,
		_origemId: pessoaId,
		data: {
			label: "DOADOR COM CONTRATO PÚBLICO",
			valor: valorTotal,
			tipo: "CONFLITO DE INTERESSE (TOMA-LÁ-DÁ-CÁ)",
			documento: cnpj,
			score_letalidade: 100,
			motivo_ia: `ALERTA TOMA-LÁ-DÁ-CÁ: empresa doadora da campanha tem ${contratos.length} contrato(s) público(s) como fornecedora (CNPJ: ${cnpj}).`,
			// Procedência: os contratos que sustentam o alerta.
			contratos: contratos.slice(0, 5).map((c) => ({
				id: c.id, fonte: c.fonte, orgao: c.orgaoEntidade.razaoSocial, objeto: c.objetoContrato.slice(0, 160),
				valor: c.valorGlobal, data: c.dataAssinatura, url: c.url,
			})),
		},
	};
}

/** Cruza os doadores (CNPJ) com contratos públicos em que eles são fornecedores. */
export async function cruzarDoadoresComContratosPublicos(
	doadores: string[],
	pessoaId: string,
	avisar: (msg: string) => void,
	buscar: BuscarContratos = buscarPadrao,
) {
	const nos: ReturnType<typeof montarNoDoadorComContrato>[] = [];
	for (let i = 0; i < doadores.length; i += POR_VEZ) {
		const grupo = doadores.slice(i, i + POR_VEZ);
		const resultados = await Promise.allSettled(grupo.map((cnpj) => buscar(cnpj)));
		resultados.forEach((r, k) => {
			if (r.status !== "fulfilled" || r.value.length === 0) return;
			const no = montarNoDoadorComContrato(grupo[k], r.value, pessoaId);
			nos.push(no);
			avisar(`[RED FLAG] Doador ${grupo[k]} tem R$ ${no.data.valor.toLocaleString("pt-BR")} em contratos públicos como fornecedor.`);
		});
	}
	return nos;
}
