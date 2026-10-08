/**
 * Observador de fontes — cada chamada feita pelo fonte-http avisa, dentro da
 * investigação em curso, se a fonte respondeu, está lenta (nova tentativa) ou
 * falhou de vez. O pipe transforma isso em eventos ETAPA para a tela
 * (services/core/etapas-ao-vivo.ts), sem precisar mexer em cada cliente.
 *
 * Usa AsyncLocalStorage: o ouvinte vale só para as chamadas feitas dentro de
 * `observarFontes(...)` (uma investigação não recebe sinais de outra). Fora
 * disso (testes, ETLs) os sinais são ignorados. Só roda no servidor.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { TipoErroFonte } from "./index";

export type SinalFonte =
	| { tipo: "respondeu"; url: string; fonte?: string }
	| { tipo: "lenta"; url: string; fonte?: string; motivo: TipoErroFonte; status?: number }
	| { tipo: "falhou"; url: string; fonte?: string; erro: TipoErroFonte; status?: number };

export type OuvinteDeFontes = (sinal: SinalFonte) => void;

const contexto = new AsyncLocalStorage<OuvinteDeFontes>();

export function observarFontes<T>(ouvinte: OuvinteDeFontes, executar: () => Promise<T>): Promise<T> {
	return contexto.run(ouvinte, executar);
}

/** Avisa o ouvinte da investigação em curso (se houver). Nunca lança. */
export function sinalizarFonte(sinal: SinalFonte): void {
	try {
		contexto.getStore()?.(sinal);
	} catch {
		// o aviso para a tela nunca derruba a consulta
	}
}
