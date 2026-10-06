/**
 * Regras de cruzamento numa tabela (funções puras no motor). Ver nota 31.
 *
 * Cada regra junta dois papéis no mesmo documento. Severidade:
 *  - ALTA: dinheiro público ligado diretamente ao mandato ou ao ente governado;
 *  - MEDIA: ligação existe, mas o contrato pode ser com qualquer órgão;
 *  - BAIXA: só a raiz do CNPJ coincide (rebaixamento automático no motor).
 *
 * Substitui o antigo "toma-lá-dá-cá" com score 100 fixo para todo doador que
 * tivesse qualquer contrato público em qualquer órgão.
 */
import type { Regra } from "./tipos";

export const REGRAS: Regra[] = [
	{
		id: "doador-fornecedor-cota",
		titulo: "Doador de campanha pago com a cota do mandato",
		papeis: ["DOADOR", "FORNECEDOR_COTA"],
		severidade: "ALTA",
		porque: "quem financiou a campanha recebeu dinheiro da verba do gabinete",
	},
	{
		id: "empresa-politico-cota",
		titulo: "Empresa do político paga com a cota do mandato",
		papeis: ["EMPRESA_DO_POLITICO", "FORNECEDOR_COTA"],
		severidade: "ALTA",
		porque: "a verba do gabinete foi para empresa da qual o político é sócio",
	},
	{
		id: "doador-contratado-ente",
		titulo: "Doador de campanha contratado pelo órgão ligado ao mandato",
		papeis: ["DOADOR", "CONTRATADO_ENTE"],
		severidade: "ALTA",
		porque: "quem financiou a campanha tem contrato com o órgão que o político comanda ou fiscaliza",
	},
	{
		id: "empresa-politico-ente",
		titulo: "Empresa do político contratada pelo órgão ligado ao mandato",
		papeis: ["EMPRESA_DO_POLITICO", "CONTRATADO_ENTE"],
		severidade: "ALTA",
		porque: "empresa da qual o político é sócio tem contrato com o órgão que ele comanda ou fiscaliza",
	},
	{
		id: "doador-beneficiario-emenda",
		titulo: "Doador de campanha beneficiado por emenda do político",
		papeis: ["DOADOR", "BENEFICIARIO_EMENDA"],
		severidade: "ALTA",
		porque: "quem financiou a campanha recebeu recurso de emenda indicada pelo político",
	},
	{
		id: "empresa-politico-emenda",
		titulo: "Empresa do político beneficiada por emenda",
		papeis: ["EMPRESA_DO_POLITICO", "BENEFICIARIO_EMENDA"],
		severidade: "ALTA",
		porque: "empresa da qual o político é sócio recebeu recurso de emenda indicada por ele",
	},
	{
		id: "fornecedor-campanha-cota",
		titulo: "Fornecedor da campanha pago com a cota do mandato",
		papeis: ["FORNECEDOR_CAMPANHA", "FORNECEDOR_COTA"],
		severidade: "MEDIA",
		porque: "a mesma empresa prestou serviço à campanha e recebe da verba do gabinete",
	},
	{
		id: "doador-contratado-publico",
		titulo: "Doador de campanha também é fornecedor do poder público",
		papeis: ["DOADOR", "CONTRATADO_PUBLICO"],
		severidade: "MEDIA",
		porque: "quem financiou a campanha tem contratos públicos (o órgão contratante pode não ter ligação com o político)",
	},
	{
		id: "empresa-politico-contratada",
		titulo: "Empresa do político com contrato público",
		papeis: ["EMPRESA_DO_POLITICO", "CONTRATADO_PUBLICO"],
		severidade: "MEDIA",
		porque: "empresa da qual o político é sócio é fornecedora do poder público",
	},
	{
		id: "sancionado-cota",
		titulo: "Empresa punida pelo governo paga com a cota do mandato",
		papeis: ["SANCIONADO", "FORNECEDOR_COTA"],
		severidade: "ALTA",
		porque: "a verba do gabinete foi para empresa que consta nos cadastros de punidas (CEIS/CNEP/CEPIM)",
	},
	{
		id: "sancionado-ente",
		titulo: "Empresa punida pelo governo contratada pelo órgão ligado ao mandato",
		papeis: ["SANCIONADO", "CONTRATADO_ENTE"],
		severidade: "ALTA",
		porque: "o órgão contratou empresa que consta nos cadastros de punidas (CEIS/CNEP/CEPIM)",
	},
	{
		id: "sancionado-doador",
		titulo: "Doador de campanha consta como empresa punida",
		papeis: ["SANCIONADO", "DOADOR"],
		severidade: "MEDIA",
		porque: "quem financiou a campanha consta nos cadastros de punidas (CEIS/CNEP/CEPIM)",
	},
	{
		id: "sancionado-empresa-politico",
		titulo: "Empresa do político consta como punida",
		papeis: ["SANCIONADO", "EMPRESA_DO_POLITICO"],
		severidade: "ALTA",
		porque: "empresa da qual o político é sócio consta nos cadastros de punidas (CEIS/CNEP/CEPIM)",
	},
];
