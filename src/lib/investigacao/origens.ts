/* ==========================================================================
   Origens — de qual site veio cada consulta, em linguagem de gente.

   Liga o endereço chamado pelo servidor (ou o nome da fonte no fonte-http) a
   uma das fontes da tela (etapas.ts) e a um nome que qualquer pessoa entende.
   Também traduz o motivo técnico de uma falha numa frase simples. Puro: roda
   no servidor (para montar o evento ETAPA) e no navegador.
   ========================================================================== */
import type { FonteId } from "./etapas";

export interface Origem {
	fonte: FonteId;
	/** Nome para pessoas: "PNCP (portal federal de contratos)". */
	nome: string;
	/** Frase própria quando falha (no lugar do motivo técnico traduzido). */
	quandoFalha?: string;
}

/** Estados que o servidor informa por fonte no evento ETAPA. */
export type EstadoEtapaEvento =
	/** Começou a consultar (informado pelo próprio módulo). */
	| "consultando"
	/** Terminou com resultado (detalhe: "61 contratos do Governo do DF"). */
	| "concluida"
	/** Terminou sem nenhum registro. */
	| "vazia"
	/** A fonte não vale para este cargo. */
	| "nao_se_aplica"
	/** Uma consulta demorou ou deu erro passageiro: nova tentativa. */
	| "lenta"
	/** Uma consulta falhou de vez (detalhe: o motivo em linguagem simples). */
	| "falhou"
	/** Uma consulta respondeu. */
	| "respondeu";

export interface EventoEtapa {
	fonte: FonteId;
	estado: EstadoEtapaEvento;
	/** Quem respondeu ou falhou, para pessoas ("PNCP (portal federal de contratos)"). */
	origem?: string;
	/** Frase curta para pessoas. */
	detalhe?: string;
}

type Regra = [RegExp, Origem];

/** Por endereço (host e, quando importa, caminho). A primeira que casar vence. */
const POR_ENDERECO: readonly Regra[] = [
	// Endereço simbólico do gateway de IA (services/ai/gateway/index.ts).
	[/^ia:\/\//, { fonte: "ia", nome: "Modelos de IA gratuitos", quandoFalha: "estavam ocupados ou fora do ar; as notas desta parte vieram das regras locais, sem IA" }],
	[/api\.portaldatransparencia\.gov\.br\/api-de-dados\/emendas/, { fonte: "emendas", nome: "Portal da Transparência (emendas)" }],
	[/portaldatransparencia\.gov\.br/, { fonte: "cgu", nome: "Portal da Transparência" }],
	[/transferegov/, { fonte: "emendas", nome: "Transferegov (repasses federais)" }],
	[/pncp\.gov\.br|compras\.dados\.gov\.br|dadosabertos\.compras\.gov\.br/, { fonte: "pncp", nome: "PNCP (portal federal de contratos)" }],
	[/\.tse\.jus\.br/, { fonte: "tse", nome: "TSE (Justiça Eleitoral)" }],
	[/camara\.leg\.br/, { fonte: "casa", nome: "Câmara dos Deputados" }],
	[/senado\.(leg|gov)\.br/, { fonte: "casa", nome: "Senado Federal" }],
	[/almg\.gov\.br/, { fonte: "casa", nome: "Assembleia de Minas Gerais" }],
	[/cl\.df\.gov\.br/, { fonte: "casa", nome: "Câmara Legislativa do DF" }],
	[/alepe\.pe\.gov\.br/, { fonte: "casa", nome: "Assembleia de Pernambuco" }],
	[/al\.sp\.gov\.br/, { fonte: "casa", nome: "Assembleia de São Paulo (ALESP)" }],
	[/alerj\.rj\.gov\.br/, { fonte: "casa", nome: "Assembleia do Rio (ALERJ)" }],
	[/camara\.rj\.gov\.br/, { fonte: "casa", nome: "Câmara Municipal do Rio" }],
	[/brasilapi\.com\.br|receitaws\.com\.br|minhareceita\.org/, { fonte: "receita", nome: "Receita Federal (dados de CNPJ)" }],
	[/tcu\.gov\.br/, { fonte: "tribunais", nome: "TCU (Tribunal de Contas da União)" }],
	[/datajud\.cnj\.jus\.br/, { fonte: "tribunais", nome: "DataJud (processos na Justiça)" }],
	[/\.tce\.|tcerj|\.tcm\.|tce\.[a-z]{2}\.gov\.br|transparencia\.se\.gov\.br|dados\.es\.gov\.br/, { fonte: "tribunais", nome: "Tribunal de Contas do estado" }],
	[/queridodiario/, { fonte: "diarios", nome: "Querido Diário (diários municipais)" }],
	[/in\.gov\.br/, { fonte: "diarios", nome: "Diário Oficial da União" }],
	[/tesouro\.gov\.br/, { fonte: "complementares", nome: "Tesouro Nacional (Siconfi)" }],
	[/bndes\.gov\.br/, { fonte: "complementares", nome: "BNDES" }],
	[/fnde\.gov\.br/, { fonte: "complementares", nome: "FNDE (educação)" }],
	[/anac\.gov\.br/, { fonte: "complementares", nome: "ANAC (aeronaves)" }],
];

/** Origem de uma consulta pelo endereço chamado; null = não é fonte da investigação (banco, IA, imagens). */
export function origemDoEndereco(url: string): Origem | null {
	const alvo = String(url ?? "").toLowerCase();
	for (const [re, origem] of POR_ENDERECO) if (re.test(alvo)) return origem;
	return null;
}

/** Motivo técnico (TipoErroFonte do fonte-http + status HTTP) → frase para pessoas. */
export function motivoAcessivel(erro: string | undefined, status?: number): string {
	if (status === 429) return "recusou por excesso de consultas";
	if (status === 401 || status === 403) return "recusou o acesso";
	const frases: Record<string, string> = {
		TIMEOUT: "demorou demais para responder",
		HTTP_5XX: "estava com erro no próprio site",
		REDE: "não foi possível conectar",
		FONTE_INDISPONIVEL: "foi pausada depois de falhas seguidas",
		PRAZO: "ficou sem tempo dentro da investigação",
		PARSE: "respondeu num formato inesperado",
	};
	return frases[String(erro)] ?? "não respondeu";
}
