/* ==========================================================================
   Etapas por fonte — derivadas dos STATUS do servidor (sem mudar a API).

   O pipeline não informa "fonte X concluída"; apenas emite mensagens de texto.
   Classificamos cada mensagem em uma fonte e inferimos o estado:
   - fonte vista agora            → "run"  (ou "slow" se a mensagem indica lentidão)
   - fonte vista antes, não é a atual → "ok"
   - fonte nunca vista quando a IA já começou → "na" (não se aplica à alçada)
   - fonte nunca vista, job rodando → "wait"
   - job interrompido             → "cut" para o que não concluiu
   O progresso nunca regride e chega a 100% apenas com o DONE.
   ========================================================================== */

export type FonteId =
	| "casa"
	| "tse"
	| "cgu"
	| "receita"
	| "emendas"
	| "pncp"
	| "tribunais"
	| "diarios"
	| "complementares"
	| "ia";

export interface Fonte {
	id: FonteId;
	nome: string;
	detalhe: string;
}

/** Ordem de exibição (e ordem aproximada em que o pipeline passa por elas). */
export const FONTES: readonly Fonte[] = [
	{ id: "casa", nome: "Casa legislativa", detalhe: "perfil, cota e votações" },
	{ id: "tse", nome: "TSE", detalhe: "CPF, patrimônio e doadores" },
	{ id: "cgu", nome: "Portal da Transparência", detalhe: "sanções, cartão e viagens" },
	{ id: "receita", nome: "Receita Federal", detalhe: "CNPJ e quadro societário" },
	{ id: "emendas", nome: "Emendas e Transferegov", detalhe: "execução e emendas Pix" },
	{ id: "pncp", nome: "PNCP e contratos", detalhe: "contratos e licitações" },
	{ id: "tribunais", nome: "Tribunais e controle", detalhe: "TCU, TCEs e processos" },
	{ id: "diarios", nome: "Diários oficiais", detalhe: "nomeações e atos" },
	{ id: "complementares", nome: "Bases complementares", detalhe: "ANAC, BNDES, Siconfi, SPU" },
	{ id: "ia", nome: "Análise de IA", detalhe: "triagem de risco e grafo" },
];

/** Prioridade de classificação: o primeiro padrão que casar vence. */
const PADROES: readonly [FonteId, RegExp][] = [
	["ia", /polígrafo ia|groq|gemini|triagem|matemática avançada|auditando proposi/i],
	["diarios", /diário|querido|\bdou\b/i],
	["tribunais", /\btce\b|\btcu\b|\btcm\b|tce-|acórd|datajud|jurisprud|processos de contas/i],
	["pncp", /pncp|compras\.gov|contratos? federa|contratações|licita|contratos municipais/i],
	["emendas", /emendas?|transferegov|convênios/i],
	["complementares", /anac|bndes|siconfi|fnde|\bspu\b|aeron|patrimônio da união/i],
	["tse", /\btse\b|eleitoral|financiadores|doador|patrimônio/i],
	["receita", /receita|brasilapi|societári|\bqsa\b|busca reversa|cnpj|empresas? vinculada/i],
	["cgu", /\bcgu\b|cpgf|viagens|sancion|inidôneos|transparência/i],
	["casa", /câmara|senado|casa legislativa|assembleia|alesp|alerj|cmrj|cotas?\b|despesas|dossiê completo|proposições|projetos de lei/i],
];

const PADRAO_LENTO = /lenta|tentativa final|ainda aguardando|offline|forçando a conexão/i;

/** Classifica uma mensagem de STATUS em uma fonte (ou null se não houver). */
export function fonteDaMensagem(msg: string): FonteId | null {
	for (const [id, re] of PADROES) {
		if (re.test(msg)) return id;
	}
	return null;
}

export type EtapaStatus = "wait" | "run" | "ok" | "slow" | "na" | "cut";

export interface EtapasState {
	/** Ordem de chegada da última menção a cada fonte (maior = mais recente). */
	vistas: Partial<Record<FonteId, number>>;
	lentas: Partial<Record<FonteId, boolean>>;
	atual: FonteId | null;
	contador: number;
	concluida: boolean;
	/** Maior progresso já exibido: garante que a barra nunca regride. */
	pico: number;
}

export const ETAPAS_INICIAIS: EtapasState = {
	vistas: {},
	lentas: {},
	atual: null,
	contador: 0,
	concluida: false,
	pico: 0,
};

/** Registra uma mensagem de STATUS. Mensagens sem fonte conhecida não alteram nada. */
export function registrarStatus(prev: EtapasState, msg: string): EtapasState {
	const fonte = fonteDaMensagem(msg);
	if (!fonte) return prev;
	const contador = prev.contador + 1;
	const proximo: EtapasState = {
		...prev,
		vistas: { ...prev.vistas, [fonte]: contador },
		lentas: { ...prev.lentas, [fonte]: PADRAO_LENTO.test(msg) },
		atual: fonte,
		contador,
	};
	return { ...proximo, pico: Math.max(prev.pico, progressoBruto(proximo, true)) };
}

export function marcarConcluida(prev: EtapasState): EtapasState {
	return { ...prev, concluida: true, atual: null };
}

function iaComecou(s: EtapasState): boolean {
	return s.vistas.ia !== undefined;
}

function statusDaFonteAtiva(s: EtapasState, id: FonteId): EtapaStatus {
	if (s.atual === id) return s.lentas[id] ? "slow" : "run";
	return "ok";
}

/** Estado de uma fonte para a UI. `rodando` = job em andamento (false = interrompido). */
export function statusDaFonte(s: EtapasState, id: FonteId, rodando: boolean): EtapaStatus {
	if (s.concluida) return s.vistas[id] === undefined ? "na" : "ok";
	if (s.vistas[id] === undefined) {
		if (!rodando) return "cut";
		return iaComecou(s) ? "na" : "wait";
	}
	if (!rodando) return s.atual === id ? "cut" : "ok";
	return statusDaFonteAtiva(s, id);
}

function pesoDoStatus(st: EtapaStatus): number {
	if (st === "ok" || st === "na") return 1;
	if (st === "run" || st === "slow") return 0.5;
	return 0;
}

function progressoBruto(s: EtapasState, rodando: boolean): number {
	const total = FONTES.length;
	const soma = FONTES.reduce((acc, f) => acc + pesoDoStatus(statusDaFonte(s, f.id, rodando)), 0);
	return Math.min(97, Math.round((soma / total) * 100));
}

/** Progresso 0–100. Só chega a 100 com o DONE; antes disso fica no máximo em 97 e não regride. */
export function calcularProgresso(s: EtapasState, rodando: boolean): number {
	if (s.concluida) return 100;
	return Math.max(s.pico, progressoBruto(s, rodando));
}

export interface ResumoEtapas {
	concluidas: number;
	total: number;
	/** Fontes que respondem (exclui as marcadas como "não se aplica"). */
	aplicaveis: number;
}

export function resumirEtapas(s: EtapasState, rodando: boolean): ResumoEtapas {
	const estados = FONTES.map((f) => statusDaFonte(s, f.id, rodando));
	const na = estados.filter((e) => e === "na").length;
	const concluidas = estados.filter((e) => e === "ok").length;
	return { concluidas, total: FONTES.length, aplicaveis: FONTES.length - na };
}

/** Texto curto de cada estado (copy da UI). */
export const TEXTO_ETAPA: Record<EtapaStatus, string> = {
	wait: "aguardando",
	run: "consultando",
	ok: "ok",
	slow: "lento · nova tentativa",
	na: "não se aplica",
	cut: "interrompida",
};

/** Formata segundos como mm:ss. */
export function formatarRelogio(segundos: number): string {
	const s = Math.max(0, Math.floor(segundos));
	const mm = String(Math.floor(s / 60)).padStart(2, "0");
	const ss = String(s % 60).padStart(2, "0");
	return `${mm}:${ss}`;
}
