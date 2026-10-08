/**
 * Observador de fontes — cada chamada feita pelo fonte-http avisa, dentro da
 * investigação em curso, se a fonte respondeu, está lenta (nova tentativa) ou
 * falhou de vez. O pipe transforma isso em eventos ETAPA para a tela
 * (services/core/etapas-ao-vivo.ts), sem precisar mexer em cada cliente.
 *
 * O mesmo contexto carrega o PRAZO da investigação: toda chamada do fonte-http
 * (e o gateway de IA) respeita o tempo que sobra, então perto do limite da rota
 * as consultas novas param na hora e o pipe termina com o que já chegou.
 *
 * Usa AsyncLocalStorage: vale só para as chamadas feitas dentro de
 * `observarFontes(...)` (uma investigação não recebe sinais de outra). Fora
 * disso (testes, ETLs) os sinais são ignorados e não há prazo. Só roda no servidor.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prazo } from "@/lib/prazo";
import type { TipoErroFonte } from "./index";

export type SinalFonte =
	| { tipo: "respondeu"; url: string; fonte?: string }
	| { tipo: "lenta"; url: string; fonte?: string; motivo: TipoErroFonte; status?: number }
	| { tipo: "falhou"; url: string; fonte?: string; erro: TipoErroFonte; status?: number };

export type OuvinteDeFontes = (sinal: SinalFonte) => void;

interface Contexto {
	ouvinte: OuvinteDeFontes;
	prazo?: Prazo;
}

const contexto = new AsyncLocalStorage<Contexto>();

export function observarFontes<T>(ouvinte: OuvinteDeFontes, executar: () => Promise<T>, opcoes: { prazo?: Prazo } = {}): Promise<T> {
	return contexto.run({ ouvinte, prazo: opcoes.prazo }, executar);
}

/** O ouvinte da investigação em curso (undefined fora de `observarFontes`). */
export function ouvinteAtual(): OuvinteDeFontes | undefined {
	return contexto.getStore()?.ouvinte;
}

/** Prazo da investigação em curso (undefined fora de `observarFontes` ou sem prazo). */
export function prazoDaInvestigacao(): Prazo | undefined {
	return contexto.getStore()?.prazo;
}

/** Avisa o ouvinte da investigação em curso (se houver). Nunca lança. */
export function sinalizarFonte(sinal: SinalFonte): void {
	try {
		contexto.getStore()?.ouvinte(sinal);
	} catch {
		// o aviso para a tela nunca derruba a consulta
	}
}
