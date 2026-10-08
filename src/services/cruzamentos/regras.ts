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
import { dataIso, dentroDoPeriodo } from "./datas";
import type { Fato, Regra } from "./tipos";

/**
 * Sanção × contrato: só é ALTA se algum contrato foi assinado DURANTE a sanção.
 * Em 07/10/2026 os dois primeiros casos reais (Cuiabá e Goiás) eram contratos
 * assinados antes da punição — e por suspensão aplicada por outro órgão.
 */
export function contratoDuranteSancao(sancoes: Fato[], contratos: Fato[]): { severidade?: "MEDIA"; nota: string } | null {
	const datas = contratos.map((c) => dataIso(c.data)).filter((d): d is string => d !== null);
	if (datas.length === 0) return { severidade: "MEDIA", nota: "Sem data do contrato para conferir com o período da sanção." };
	const periodos = sancoes.map((s) => ({ inicio: s.periodo?.inicio ?? dataIso(s.data), fim: s.periodo?.fim ?? null }));
	const durante = datas.some((d) => periodos.some((p) => dentroDoPeriodo(d, p.inicio, p.fim)));
	if (durante) return null;
	return {
		severidade: "MEDIA",
		nota: "Os contratos foram assinados fora do período da sanção (antes da punição ou depois dela); suspensão e impedimento valem só para o órgão que puniu, a inidoneidade vale para todos.",
	};
}

/**
 * Doador com cargo de confiança: MÉDIA; ALTA se a função começou DEPOIS da
 * eleição em que ele doou (o fato DOADOR das contas de campanha traz o ano).
 */
export function nomeadoDepoisDaEleicao(doacoes: Fato[], funcoes: Fato[]): { severidade?: "ALTA"; nota: string } | null {
	const anos = doacoes.map((d) => Number(String(d.data ?? "").slice(0, 4))).filter((a) => a > 2000);
	if (anos.length === 0) return null;
	const eleicao = `${Math.min(...anos)}-10-01`;
	if (funcoes.some((f) => (f.data ?? "") >= eleicao)) {
		return { severidade: "ALTA", nota: "Nomeação depois da eleição em que doou: vale conferir se houve indicação política." };
	}
	return { nota: "A função começou antes da eleição em que doou." };
}

export const REGRAS: Regra[] = [
	{
		id: "doador-cargo-confianca",
		titulo: "Doador de campanha com cargo de confiança no governo federal",
		papeis: ["DOADOR", "SERVIDOR_COMISSIONADO"],
		severidade: "MEDIA",
		porque: "quem financiou a campanha ocupa função comissionada ou cargo de confiança no Executivo federal",
		ajustar: nomeadoDepoisDaEleicao,
	},
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
		id: "doador-socio-fornecedor",
		titulo: "Doador de campanha é sócio de empresa paga pelo mandato",
		papeis: ["DOADOR", "SOCIO_DE_FORNECEDOR"],
		severidade: "ALTA",
		porque: "quem financiou a campanha é sócio (nome e CPF conferidos no QSA) de empresa que recebe dinheiro ligado ao mandato",
	},
	{
		id: "fornecedor-campanha-ente",
		titulo: "Fornecedor da campanha contratado pelo órgão ligado ao mandato",
		papeis: ["FORNECEDOR_CAMPANHA", "CONTRATADO_ENTE"],
		severidade: "ALTA",
		porque: "a mesma empresa prestou serviço à campanha e tem contrato com o órgão que o político comanda ou fiscaliza",
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
		ajustar: contratoDuranteSancao,
	},
	{
		id: "sancionado-ente",
		titulo: "Empresa punida pelo governo contratada pelo órgão ligado ao mandato",
		papeis: ["SANCIONADO", "CONTRATADO_ENTE"],
		severidade: "ALTA",
		porque: "o órgão contratou empresa que consta nos cadastros de punidas (CEIS/CNEP/CEPIM)",
		ajustar: contratoDuranteSancao,
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
