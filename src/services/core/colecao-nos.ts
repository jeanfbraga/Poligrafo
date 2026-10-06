/**
 * Coleção dos nós que vão para o cache `pesquisas`.
 *
 * Antes, o cache recebia só os nós que alguém lembrava de dar `push`, e na
 * versão de ANTES da triagem da IA. Ficavam de fora sanções, DataJud, TCU,
 * cartão, viagens e QSA (emitidos direto pelos scrapers), e o score da IA
 * se perdia — o dossiê restaurado do cache era diferente do ao vivo.
 *
 * Agora:
 *  - `push` atualiza pelo `id` (a última versão vence, preservando o score
 *    da IA que reemite o mesmo nó);
 *  - `envolverEmissor` faz todo NODE_NOVO enviado à tela entrar no cache;
 *  - nós só de contexto da IA (`_isContextOnly`) nunca entram.
 */

type No = { id?: unknown; _isContextOnly?: boolean; [k: string]: unknown };

export class ColecaoNos extends Array<any> {
	private readonly indicePorId = new Map<string, number>();

	// filter/map/slice devolvem Array comum, não outra ColecaoNos.
	static get [Symbol.species]() {
		return Array;
	}

	override push(...nos: any[]): number {
		for (const no of nos) this.registrar(no);
		return this.length;
	}

	private registrar(no: No | null | undefined): void {
		if (!no || typeof no !== "object" || no._isContextOnly) return;
		const id = no.id === undefined || no.id === null ? "" : String(no.id);
		const indice = id ? this.indicePorId.get(id) : undefined;
		if (indice !== undefined) {
			this[indice] = no;
			return;
		}
		super.push(no);
		if (id) this.indicePorId.set(id, this.length - 1);
	}
}

export type EmissorSse = (tipo: string, payload: any) => void;

/** Todo NODE_NOVO enviado à tela também entra na coleção do cache. */
export function envolverEmissor(emitir: EmissorSse, colecao: ColecaoNos): EmissorSse {
	return (tipo, payload) => {
		if (tipo === "NODE_NOVO") colecao.push(payload);
		emitir(tipo, payload);
	};
}
