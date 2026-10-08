/**
 * Tempo de uma investigação (rota /api/investigar, maxDuration = 300 s na Vercel).
 *
 * - Aos 240 s as FONTES param: toda chamada do fonte-http e do gateway de IA passa a
 *   recusar na hora ("ficou sem tempo dentro da investigação", na lista de fontes), e o
 *   pipe termina com o que já chegou — cruzamentos, gravação do dossiê e DONE ainda cabem.
 * - Aos 285 s, se algo fora do fonte-http ainda segurar o pipe, a rota encerra sozinha:
 *   avisa na tela e manda DONE (antes a Vercel matava a função e a tela ficava sem resposta).
 */
export const PRAZO_FONTES_MS = 240_000;
export const TETO_ROTA_MS = 285_000;

type Emissor = (tipo: string, payload: any) => void;

/** Espera a investigação, mas não além do teto; estourou = avisa e encerra a tela. */
export async function comTetoDeTempo(execucao: Promise<unknown>, sendEvent: Emissor, tetoMs = TETO_ROTA_MS): Promise<"concluida" | "estourou"> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const estouro = new Promise<"estourou">((resolver) => {
		timer = setTimeout(() => resolver("estourou"), tetoMs);
	});
	try {
		const resultado = await Promise.race([execucao.then(() => "concluida" as const), estouro]);
		if (resultado === "estourou") {
			sendEvent("STATUS", {
				msg: `A investigação passou do tempo máximo (${Math.round(tetoMs / 60_000)} minutos). O dossiê mostra o que chegou até aqui; as fontes que não terminaram aparecem na lista.`,
			});
			sendEvent("DONE", { msg: "Dossiê parcial: tempo máximo atingido." });
		}
		return resultado;
	} finally {
		clearTimeout(timer);
	}
}
