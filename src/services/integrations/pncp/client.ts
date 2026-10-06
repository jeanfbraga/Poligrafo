// pncp/client.ts
// Contratos de um fornecedor para /api/investigar/licitacoes e /contratos-beneficiario.
//
// A versão anterior consultava `/v1/contratos?cnpjFornecedor=` — parâmetro que o
// PNCP IGNORA (canário de 06/10/2026: 20 de 20 contratos de outras empresas) — e
// mandava contratos aleatórios para a IA. Agora delega ao cliente que junta a CGU
// (federal) e a busca textual do PNCP, sempre conferindo o CNPJ do fornecedor.
import {
	buscarContratosPorFornecedor,
	type ContratoFornecedor,
} from "@/services/integrations/contratos/fornecedor";

export interface PNCPOrgaoEntidade {
	cnpj: string;
	razaoSocial: string;
	poderId: string;
	esferaId: string;
}

export interface PNCPContract {
	numeroControlePNCP: string;
	dataAssinatura?: string;
	dataVigenciaInicio?: string;
	dataVigenciaFim?: string;
	orgaoEntidade: PNCPOrgaoEntidade;
	nomeRazaoSocialFornecedor: string;
	niFornecedor: string;
	numeroContratoEmpenho?: string;
	objetoContrato?: string;
	valorInicial?: number;
	valorGlobal?: number;
	urlCipi?: string;
	/** De onde veio (CGU = contrato federal no Portal da Transparência; PNCP = busca textual). */
	fonte?: "CGU" | "PNCP";
	/** Link do registro na fonte (procedência). */
	url?: string;
}

function paraPNCPContract(c: ContratoFornecedor): PNCPContract {
	return {
		numeroControlePNCP: c.numeroControlePNCP ?? c.id,
		dataAssinatura: c.dataAssinatura,
		orgaoEntidade: {
			cnpj: c.orgaoEntidade.cnpj,
			razaoSocial: c.orgaoEntidade.razaoSocial,
			poderId: "",
			esferaId: c.orgaoEntidade.esferaId ?? "",
		},
		nomeRazaoSocialFornecedor: c.nomeFornecedor,
		niFornecedor: c.niFornecedor,
		objetoContrato: c.objetoContrato,
		valorInicial: c.valorGlobal,
		valorGlobal: c.valorGlobal,
		fonte: c.fonte,
		url: c.url,
	};
}

/**
 * Contratos do fornecedor (só os dele), do MAIOR valor para o menor — regra da
 * nota 14 do Obsidian: ordenar antes de cortar o lote enviado à IA.
 * `_anos` fica por compatibilidade: as fontes atuais não pedem janela por ano.
 */
export async function fetchContratosByCNPJ(cnpj: string, _anos = 8): Promise<PNCPContract[]> {
	const contratos = await buscarContratosPorFornecedor(cnpj, { paginasCgu: 3, paginasPncp: 2 });
	return contratos.map(paraPNCPContract);
}
