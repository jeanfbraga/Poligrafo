/**
 * Etapas ao vivo — o que está sendo consultado e o que deu problema, para a tela.
 *
 * Duas entradas viram o evento SSE `ETAPA` ({ fonte, estado, origem?, detalhe? }):
 *  - sinais automáticos do fonte-http (observador.ts): cada site respondeu, está
 *    lento (nova tentativa) ou falhou — sem mexer em cada cliente;
 *  - avisos dos módulos (`emitirEtapa`): "61 contratos do Governo do DF",
 *    "nenhum lançamento", "não se aplica a este cargo".
 *
 * Antes a tela adivinhava a fonte pelo texto do STATUS (lib/investigacao/etapas.ts)
 * e quase nunca mostrava falha de conexão.
 */
import type { FonteId } from "@/lib/investigacao/etapas";
import { type EventoEtapa, motivoAcessivel, origemDoEndereco } from "@/lib/investigacao/origens";
import { type OuvinteDeFontes, ouvinteAtual, type SinalFonte } from "@/lib/fonte-http/observador";

type Emissor = (tipo: string, payload: any) => void;

export function emitirEtapa(sendEvent: Emissor, evento: EventoEtapa): void {
	sendEvent("ETAPA", evento);
}

function eventoDoSinal(sinal: SinalFonte): EventoEtapa | null {
	const origem = origemDoEndereco(sinal.url);
	if (!origem) return null;
	const base = { fonte: origem.fonte as FonteId, origem: origem.nome };
	if (sinal.tipo === "respondeu") return { ...base, estado: "respondeu" };
	if (sinal.tipo === "lenta") return { ...base, estado: "lenta", detalhe: `${motivoAcessivel(sinal.motivo, sinal.status)}; tentando de novo` };
	return { ...base, estado: "falhou", detalhe: origem.quandoFalha ?? motivoAcessivel(sinal.erro, sinal.status) };
}

export type OuvinteDeEtapas = OuvinteDeFontes & {
	/** Passa a enviar por outro emissor (o do pipe, que também guarda no cache). */
	redirecionar: (emissor: Emissor) => void;
};

/**
 * Ouvinte para `observarFontes`: cada (origem, estado) vai uma vez só — um
 * deputado com 300 notas da cota não manda 300 eventos "respondeu".
 */
export function criarOuvinteDeEtapas(sendEvent: Emissor): OuvinteDeEtapas {
	const enviados = new Set<string>();
	let destino = sendEvent;
	const ouvir: OuvinteDeFontes = (sinal) => {
		const evento = eventoDoSinal(sinal);
		if (!evento) return;
		const chave = `${evento.origem}|${evento.estado}`;
		if (enviados.has(chave)) return;
		enviados.add(chave);
		emitirEtapa(destino, evento);
	};
	return Object.assign(ouvir, { redirecionar: (emissor: Emissor) => { destino = emissor; } });
}

/**
 * O pipe chama isto com o seu emissor (o que guarda nós e etapas no cache `pesquisas`):
 * os avisos de conexão passam a entrar no dossiê guardado. Fora de uma investigação, nada.
 */
export function redirecionarEtapasPara(emissor: Emissor): void {
	const ouvinte = ouvinteAtual() as Partial<OuvinteDeEtapas> | undefined;
	if (typeof ouvinte?.redirecionar === "function") ouvinte.redirecionar(emissor);
}

const FUSO = { timeZone: "America/Sao_Paulo" } as const;

function quandoFoiGuardado(timestamp: unknown): string {
	const d = new Date(String(timestamp ?? ""));
	if (Number.isNaN(d.getTime())) return "data não registrada";
	return `${d.toLocaleDateString("pt-BR", FUSO)} às ${d.toLocaleTimeString("pt-BR", { ...FUSO, hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Dossiê restaurado do cache: diz de quando ele é e reenvia o resumo das etapas
 * (o que respondeu e o que não respondeu naquela investigação). Dossiês antigos,
 * de antes do registro por fonte, não têm etapas e a tela diz isso.
 */
export function reemitirEtapasDoCache(grafo: { etapas?: unknown; timestamp?: unknown } | null | undefined, sendEvent: Emissor): void {
	const etapas = Array.isArray(grafo?.etapas) ? (grafo.etapas as EventoEtapa[]) : [];
	const quando = quandoFoiGuardado(grafo?.timestamp);
	sendEvent("STATUS", {
		msg: etapas.length
			? `[CACHE] Dossiê guardado em ${quando}. A lista de fontes mostra o que respondeu naquela investigação.`
			: `[CACHE] Dossiê guardado em ${quando}, antes do registro por fonte: não dá para dizer quais fontes responderam.`,
	});
	for (const etapa of etapas) emitirEtapa(sendEvent, etapa);
}
