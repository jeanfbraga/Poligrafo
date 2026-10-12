/**
 * Contexto compartilhado pelas etapas da investigação principal (investigador-principal.ts).
 *
 * Até 12/10/2026 tudo isto era uma função de ~2.000 linhas com exceção de complexidade.
 * Agora cada etapa é um módulo desta pasta e recebe o contexto: o emissor (que também
 * guarda o nó no cache, colecao-nos.ts), a coleção de nós, a malha que vai à triagem da
 * IA e, depois de identificado o alvo, quem é o político.
 */
import type { PerfilAlcada } from "@/services/core/alcada";
import type { ColecaoNos, EmissorSse } from "@/services/core/colecao-nos";
import type { ColetaMandato } from "@/services/core/contratos-do-ente";
import type { IdentidadeVerificada } from "@/services/core/identidade";
import type { EleitoDoAlvo } from "@/services/integrations/tse/eleitos";

export type Emissor = EmissorSse;

/** Parâmetros da rota /api/investigar (request-parser.ts) mais o emissor e o fechamento do stream. */
export interface ParamsInvestigacao {
	nomeParaBusca: string;
	ufScope: string | null;
	cargoParam: string;
	ufParam: string | null;
	forceRef: string | null;
	refParam: string | null;
	correcoesNomes: Record<string, { autoRef?: string }>;
	nomeBruto: string | null;
	sendEvent: Emissor;
	safeClose: () => void;
}

/** O que toda etapa usa. `sendEvent` já guarda NODE_NOVO e ETAPA na coleção. */
export interface Execucao {
	p: ParamsInvestigacao;
	sendEvent: Emissor;
	nos: ColecaoNos;
	/** Nós que vão à triagem da IA no fim (emitidos depois dela). */
	malha: any[];
}

/** Depois de identificado o alvo. */
export interface Investigacao extends Execucao {
	/** O antigo `deputadoBasico`: id, nome, uf, casa, uri e, se for a mesma pessoa, `_tseResult`. */
	dep: any;
	/** Detalhes da Câmara (CPF e nome civil); o nome civil do TSE entra aqui quando confere. */
	detalhes: any;
	perfil: PerfilAlcada;
	identidade: IdentidadeVerificada;
	/** CPF (ou CNPJ de campanha) confirmado; null sem documento. */
	cpf: string | null;
	documentoIsCnpj: boolean;
	pessoaId: string;
	/** Dados do TSE, só quando são da mesma pessoa (= dep._tseResult). */
	tse: any;
	eleito: EleitoDoAlvo | null;
	/** Ficha (sanções, patrimônio, alertas). O nó PESSOA aponta para o mesmo array de alertas. */
	ficha: any;
	coletaEnte: Promise<ColetaMandato>;
	chaveCache: string;
	dbSearchId: string | null;
	isDev: boolean;
}

/** Vai para a triagem da IA (que emite depois) e para o cache. */
export function naMalha(e: Execucao, no: any): void {
	e.malha.push(no);
	e.nos.push(no);
}

/** Vai para a tela agora e para o cache. */
export function naTela(e: Execucao, no: any): void {
	e.sendEvent("NODE_NOVO", no);
	e.nos.push(no);
}

export function status(e: Pick<Execucao, "sendEvent">, msg: string): void {
	e.sendEvent("STATUS", { msg });
}
