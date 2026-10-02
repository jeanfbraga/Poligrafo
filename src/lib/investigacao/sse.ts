/* ==========================================================================
   SSE da investigação — parse puro + leitor de stream.
   O servidor emite blocos `data: {"tipo":"...","payload":{...}}\n\n`.
   ========================================================================== */

export interface SseEvent {
	tipo: string;
	/** O formato do payload varia por tipo de evento. */
	payload: any;
}

const PREFIXO = "data: ";

function parseBloco(bloco: string): SseEvent | null {
	if (!bloco.startsWith(PREFIXO)) return null;
	try {
		const ev = JSON.parse(bloco.slice(PREFIXO.length));
		return ev && typeof ev.tipo === "string" ? (ev as SseEvent) : null;
	} catch {
		return null;
	}
}

/**
 * Extrai os eventos completos de um buffer acumulado.
 * O último fragmento (sem "\n\n" final) volta em `rest` para o próximo chunk.
 */
export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
	const partes = buffer.split("\n\n");
	const rest = partes.pop() ?? "";
	const events: SseEvent[] = [];
	for (const parte of partes) {
		const ev = parseBloco(parte);
		if (ev) events.push(ev);
	}
	return { events, rest };
}

/** Processa o que sobrou no buffer quando o stream encerra (sem "\n\n" final). */
export function parseSseResiduo(rest: string): SseEvent[] {
	if (!rest.trim()) return [];
	return rest
		.split("\n\n")
		.map(parseBloco)
		.filter((e): e is SseEvent => e !== null);
}

/**
 * Lê um Response de streaming e entrega cada evento ao callback.
 * Resolve quando o stream termina; rejeita se o fetch for abortado.
 */
export async function consumirSse(
	response: Response,
	onEvent: (ev: SseEvent) => void,
): Promise<void> {
	if (!response.body) throw new Error("Falha no stream de dados.");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const { events, rest } = parseSseBuffer(buffer);
		buffer = rest;
		for (const ev of events) onEvent(ev);
	}
	for (const ev of parseSseResiduo(buffer)) onEvent(ev);
}
