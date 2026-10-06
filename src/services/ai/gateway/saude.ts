/**
 * Saúde dos modelos e provedores — disjuntor em memória da instância,
 * compartilhado entre chamadas (antes cada chamada criava um orquestrador
 * novo e um modelo fora do ar era tentado de novo toda vez).
 *
 * Pausas: 30 s → 2 min → 10 min a cada falha seguida (ou o tempo pedido pela
 * fonte, se maior); modelo inexistente fica 24 h fora. Sucesso zera.
 * Com Fluid Compute as instâncias da Vercel são reaproveitadas, então
 * redescobrir uma pausa custa no máximo uma chamada.
 */
import type { Falha } from "./falhas";

const ESCADA_MS = [30_000, 120_000, 600_000];

interface Pausa {
	ate: number;
	nivel: number;
}

export class SaudeIA {
	private readonly pausas = new Map<string, Pausa>();

	constructor(private readonly agora: () => number = () => Date.now()) {}

	private chave(provedor: string, modelo?: string): string {
		return modelo ? `${provedor}:${modelo}` : provedor;
	}

	private pausado(chave: string): boolean {
		const p = this.pausas.get(chave);
		return Boolean(p && p.ate > this.agora());
	}

	/** Pode tentar este modelo agora? (nem o modelo nem o provedor pausados) */
	disponivel(provedor: string, modelo: string): boolean {
		return !this.pausado(this.chave(provedor)) && !this.pausado(this.chave(provedor, modelo));
	}

	registrarFalha(provedor: string, modelo: string, falha: Falha): void {
		if (falha.escopo === "chamada") return;
		const chave = falha.escopo === "provedor" ? this.chave(provedor) : this.chave(provedor, modelo);
		const anterior = this.pausas.get(chave);
		const nivel = anterior ? Math.min(anterior.nivel + 1, ESCADA_MS.length - 1) : 0;
		const pausaMs = Math.max(ESCADA_MS[nivel], falha.cooldownMs ?? 0);
		this.pausas.set(chave, { ate: this.agora() + pausaMs, nivel });
	}

	registrarSucesso(provedor: string, modelo: string): void {
		this.pausas.delete(this.chave(provedor, modelo));
		this.pausas.delete(this.chave(provedor));
	}

	/** Quanto falta para o modelo voltar (0 = disponível). Para logs e testes. */
	restanteMs(provedor: string, modelo?: string): number {
		const p = this.pausas.get(this.chave(provedor, modelo));
		return p ? Math.max(0, p.ate - this.agora()) : 0;
	}

	limpar(): void {
		this.pausas.clear();
	}
}

/** Instância compartilhada pelo processo. */
export const saudeIA = new SaudeIA();
