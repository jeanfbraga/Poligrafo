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
import type { OuvinteDeFontes, SinalFonte } from "@/lib/fonte-http/observador";

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

/**
 * Ouvinte para `observarFontes`: cada (origem, estado) vai uma vez só — um
 * deputado com 300 notas da cota não manda 300 eventos "respondeu".
 */
export function criarOuvinteDeEtapas(sendEvent: Emissor): OuvinteDeFontes {
	const enviados = new Set<string>();
	return (sinal) => {
		const evento = eventoDoSinal(sinal);
		if (!evento) return;
		const chave = `${evento.origem}|${evento.estado}`;
		if (enviados.has(chave)) return;
		enviados.add(chave);
		emitirEtapa(sendEvent, evento);
	};
}
