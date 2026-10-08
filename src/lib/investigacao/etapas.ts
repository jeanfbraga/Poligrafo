/* ==========================================================================
   Etapas por fonte — o que está sendo investigado e o que deu problema.

   Duas entradas:
   1. Evento ETAPA do servidor (services/core/etapas-ao-vivo.ts): cada site
      avisa se respondeu, está lento ou falhou, e os módulos avisam o resultado
      ("61 contratos", "nenhum registro", "não se aplica"). Quando existe, manda.
   2. Reserva para fontes que ainda não mandam ETAPA: a fonte é deduzida do
      texto do STATUS (regex) e o estado, da ordem das mensagens:
      - fonte vista agora → "run" (ou "slow" se a mensagem indica lentidão)
      - vista antes → "ok"; nunca vista quando a IA já começou → "na"
      - nunca vista, job rodando → "wait"; job interrompido → "cut"
   O progresso nunca regride e chega a 100% apenas com o DONE.
   ========================================================================== */
import type { EventoEtapa } from "./origens";

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
	| "cruzamentos"
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
	{ id: "cruzamentos", nome: "Cruzamento de dados", detalhe: "doadores, empresas, contratos e gabinete" },
	{ id: "ia", nome: "Análise de IA", detalhe: "triagem de risco e grafo" },
];

/** Prioridade de classificação: o primeiro padrão que casar vence. */
const PADROES: readonly [FonteId, RegExp][] = [
	["ia", /polígrafo ia|groq|gemini|triagem|matemática avançada|auditando proposi/i],
	["cruzamentos", /cruzamento|cruzando doadores|\[gabinete\]/i],
	["diarios", /diário|querido|\bdou\b/i],
	["tribunais", /\btce\b|\btcu\b|\btcm\b|tce-|acórd|datajud|jurisprud|processos de contas/i],
	["pncp", /pncp|compras\.gov|contratos? federa|contratações|licita|contratos municipais/i],
	["emendas", /emendas?|transferegov|convênios/i],
	["complementares", /anac|bndes|siconfi|fnde|\bspu\b|aeron|patrimônio da união/i],
	["tse", /\btse\b|eleitoral|financiadores|doador|patrimônio/i],
	["receita", /receita|brasilapi|societári|\bqsa\b|busca reversa|cnpj|empresas? vinculada/i],
	["cgu", /\bcgu\b|cpgf|viagens|sancion|inidôneos|transparência/i],
	["casa", /câmara|senado|casa legislativa|assembleia|alesp|alerj|cmrj|almg|cldf|cotas?\b|despesas|dossiê completo|proposições|projetos de lei/i],
];

const PADRAO_LENTO = /lenta|tentativa final|ainda aguardando|offline|forçando a conexão/i;

/** Classifica uma mensagem de STATUS em uma fonte (ou null se não houver). */
export function fonteDaMensagem(msg: string): FonteId | null {
	for (const [id, re] of PADROES) {
		if (re.test(msg)) return id;
	}
	return null;
}

/**
 * Estados de uma fonte na tela. Novos (ETAPA): "vazio" (respondeu, nada encontrado),
 * "parcial" (parte dos sites não respondeu) e "fora" (nenhum respondeu).
 */
export type EtapaStatus = "wait" | "run" | "ok" | "slow" | "na" | "cut" | "vazio" | "parcial" | "fora";

/** O que o servidor contou sobre a fonte (evento ETAPA). */
export interface SinaisFonte {
	/** Resultado informado pelo módulo (o mais forte vence: concluída > vazia > não se aplica > consultando). */
	resultado?: "consultando" | "concluida" | "vazia" | "nao_se_aplica";
	detalhe?: string;
	/** Sites que responderam. */
	respondeu: string[];
	/** Sites que falharam de vez, com o motivo em linguagem simples. */
	falhou: { origem: string; motivo: string }[];
	/** Sites em nova tentativa (sai daqui quando responde ou falha). */
	lenta: { origem: string; motivo: string }[];
}

export interface EtapasState {
	/** Ordem de chegada da última menção a cada fonte (maior = mais recente). */
	vistas: Partial<Record<FonteId, number>>;
	lentas: Partial<Record<FonteId, boolean>>;
	/** Sinais do evento ETAPA, por fonte. */
	sinais: Partial<Record<FonteId, SinaisFonte>>;
	atual: FonteId | null;
	contador: number;
	concluida: boolean;
	/** Maior progresso já exibido: garante que a barra nunca regride. */
	pico: number;
}

export const ETAPAS_INICIAIS: EtapasState = {
	vistas: {},
	lentas: {},
	sinais: {},
	atual: null,
	contador: 0,
	concluida: false,
	pico: 0,
};

function comPico(prev: EtapasState, proximo: EtapasState): EtapasState {
	return { ...proximo, pico: Math.max(prev.pico, progressoBruto(proximo, true)) };
}

/** Registra uma mensagem de STATUS. Mensagens sem fonte conhecida não alteram nada. */
export function registrarStatus(prev: EtapasState, msg: string): EtapasState {
	const fonte = fonteDaMensagem(msg);
	if (!fonte) return prev;
	const contador = prev.contador + 1;
	return comPico(prev, {
		...prev,
		vistas: { ...prev.vistas, [fonte]: contador },
		lentas: { ...prev.lentas, [fonte]: PADRAO_LENTO.test(msg) },
		atual: fonte,
		contador,
	});
}

const FORCA_RESULTADO: Record<NonNullable<SinaisFonte["resultado"]>, number> = { consultando: 0, nao_se_aplica: 1, vazia: 2, concluida: 3 };

/** Dois "concluída" na mesma fonte (ex.: prefeitura e câmara) somam os detalhes. */
function juntarResultado(atual: SinaisFonte, estado: NonNullable<SinaisFonte["resultado"]>, detalhe?: string): SinaisFonte {
	if (atual.resultado && FORCA_RESULTADO[estado] < FORCA_RESULTADO[atual.resultado]) return atual;
	const somar = estado === "concluida" && atual.resultado === "concluida" && atual.detalhe && detalhe && !atual.detalhe.includes(detalhe);
	return { ...atual, resultado: estado, detalhe: somar ? `${atual.detalhe} · ${detalhe}` : (detalhe ?? atual.detalhe) };
}

function semOrigem<T extends { origem: string }>(lista: T[], origem: string): T[] {
	return lista.filter((x) => x.origem !== origem);
}

function aplicarSinal(atual: SinaisFonte, ev: EventoEtapa): SinaisFonte {
	const origem = ev.origem ?? "";
	const motivo = ev.detalhe ?? "não respondeu";
	if (ev.estado === "respondeu") return { ...atual, respondeu: [...new Set([...atual.respondeu, origem])], lenta: semOrigem(atual.lenta, origem) };
	if (ev.estado === "lenta") return { ...atual, lenta: [...semOrigem(atual.lenta, origem), { origem, motivo }] };
	if (ev.estado === "falhou") return { ...atual, falhou: [...semOrigem(atual.falhou, origem), { origem, motivo }], lenta: semOrigem(atual.lenta, origem) };
	return juntarResultado(atual, ev.estado, ev.detalhe);
}

const SINAIS_VAZIOS: SinaisFonte = { respondeu: [], falhou: [], lenta: [] };

/** Registra um evento ETAPA do servidor. */
export function registrarEtapa(prev: EtapasState, ev: EventoEtapa): EtapasState {
	if (!ev?.fonte || !FONTES.some((f) => f.id === ev.fonte)) return prev;
	const contador = prev.contador + 1;
	const ativa = ev.estado === "consultando" || ev.estado === "lenta";
	return comPico(prev, {
		...prev,
		sinais: { ...prev.sinais, [ev.fonte]: aplicarSinal(prev.sinais[ev.fonte] ?? SINAIS_VAZIOS, ev) },
		vistas: { ...prev.vistas, [ev.fonte]: contador },
		atual: ativa ? ev.fonte : prev.atual,
		contador,
	});
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

/** Falha de conexão: nenhum site respondeu e o módulo não trouxe resultado = "fora"; senão "parcial". */
function statusDeFalha(g: SinaisFonte): EtapaStatus | null {
	if (g.falhou.length === 0) return null;
	const algoVeio = g.respondeu.length > 0 || g.resultado === "concluida" || g.resultado === "vazia";
	return algoVeio ? "parcial" : "fora";
}

const STATUS_DO_RESULTADO: Partial<Record<NonNullable<SinaisFonte["resultado"]>, EtapaStatus>> = { concluida: "ok", vazia: "vazio" };

/** Com a investigação rodando: nova tentativa = "slow"; módulo avisou que começou = "run". */
function statusEmCurso(s: EtapasState, g: SinaisFonte, rodando: boolean): EtapaStatus | null {
	if (!rodando || s.concluida) return null;
	if (g.lenta.length > 0) return "slow";
	return g.resultado === "consultando" ? "run" : null;
}

/** Estado pelos sinais do servidor; null = sem sinal decisivo (usa a reserva por texto). */
function statusPorSinais(s: EtapasState, g: SinaisFonte, rodando: boolean): EtapaStatus | null {
	if (g.resultado === "nao_se_aplica" && g.respondeu.length === 0) return "na";
	const falha = statusDeFalha(g);
	if (falha) return falha;
	const emCurso = statusEmCurso(s, g, rodando);
	if (emCurso === "slow") return emCurso;
	const doResultado = g.resultado ? STATUS_DO_RESULTADO[g.resultado] : undefined;
	return doResultado ?? emCurso;
}

/** Estado de uma fonte para a UI. `rodando` = job em andamento (false = interrompido). */
export function statusDaFonte(s: EtapasState, id: FonteId, rodando: boolean): EtapaStatus {
	const sinais = s.sinais[id];
	const porSinais = sinais ? statusPorSinais(s, sinais, rodando) : null;
	if (porSinais) return porSinais;
	if (s.concluida) return s.vistas[id] === undefined ? "na" : "ok";
	if (s.vistas[id] === undefined) {
		if (!rodando) return "cut";
		return iaComecou(s) ? "na" : "wait";
	}
	if (!rodando) return s.atual === id ? "cut" : "ok";
	return statusDaFonteAtiva(s, id);
}

const TERMINADOS = new Set<EtapaStatus>(["ok", "na", "vazio", "parcial", "fora"]);

function pesoDoStatus(st: EtapaStatus): number {
	if (TERMINADOS.has(st)) return 1;
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
	/** Fontes que já terminaram (com resultado, vazias ou com problema). */
	concluidas: number;
	total: number;
	/** Fontes que respondem (exclui as marcadas como "não se aplica"). */
	aplicaveis: number;
	/** Fontes em que algum site não respondeu ("parcial" ou "fora"). */
	comProblema: number;
}

export function resumirEtapas(s: EtapasState, rodando: boolean): ResumoEtapas {
	const estados = FONTES.map((f) => statusDaFonte(s, f.id, rodando));
	const na = estados.filter((e) => e === "na").length;
	const concluidas = estados.filter((e) => TERMINADOS.has(e) && e !== "na").length;
	const comProblema = estados.filter((e) => e === "parcial" || e === "fora").length;
	return { concluidas, total: FONTES.length, aplicaveis: FONTES.length - na, comProblema };
}

/** Texto curto de cada estado (copy da UI). */
export const TEXTO_ETAPA: Record<EtapaStatus, string> = {
	wait: "aguardando",
	run: "consultando",
	ok: "ok",
	slow: "lenta · tentando de novo",
	na: "não se aplica",
	cut: "interrompida",
	vazio: "sem registros",
	parcial: "respondeu em parte",
	fora: "não respondeu",
};

function listaDeOrigens(itens: { origem: string }[]): string {
	return [...new Set(itens.map((i) => i.origem).filter(Boolean))].join(", ");
}

/**
 * Frase da linha da fonte (abaixo do nome), em linguagem simples. Sem nada a
 * dizer, a tela mostra a descrição fixa da fonte.
 */
export function notaDaFonte(s: EtapasState, id: FonteId, status: EtapaStatus): string | null {
	const g = s.sinais[id];
	if (!g) return null;
	if (status === "fora" || status === "parcial") {
		const [primeira] = g.falhou;
		const resto = status === "parcial" ? "; o restante respondeu" : "";
		return `${listaDeOrigens(g.falhou)}: ${primeira.motivo}${resto}`;
	}
	if (status === "slow") return `${g.lenta[0].origem}: ${g.lenta[0].motivo}`;
	return g.detalhe ?? null;
}

export interface ProblemaDeFonte {
	fonte: FonteId;
	nome: string;
	/** Quem não respondeu e por quê, em linguagem simples. */
	texto: string;
	/** "fora": nada veio dessa fonte; "parcial": veio só uma parte. */
	gravidade: "fora" | "parcial";
}

/** Fontes com site que não respondeu, para o quadro "Algumas fontes não responderam". */
export function problemasDeConexao(s: EtapasState, rodando: boolean): ProblemaDeFonte[] {
	return FONTES.flatMap((f) => {
		const status = statusDaFonte(s, f.id, rodando);
		if (status !== "fora" && status !== "parcial") return [];
		return [{ fonte: f.id, nome: f.nome, texto: notaDaFonte(s, f.id, status) ?? "não respondeu", gravidade: status }];
	});
}

/** Formata segundos como mm:ss. */
export function formatarRelogio(segundos: number): string {
	const s = Math.max(0, Math.floor(segundos));
	const mm = String(Math.floor(s / 60)).padStart(2, "0");
	const ss = String(s % 60).padStart(2, "0");
	return `${mm}:${ss}`;
}
