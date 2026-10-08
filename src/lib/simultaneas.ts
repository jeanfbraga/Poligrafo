/**
 * Limite de chamadas simultâneas a uma fonte (fila simples, sem dependência).
 *
 * Caso real (08/10/2026): com três consultas ao mesmo tempo no PNCP (duas páginas do
 * governo + a casa legislativa), uma delas sempre travava até o timeout; com duas, não.
 */
export function limitarSimultaneas(maximo: number) {
	let ativas = 0;
	const espera: (() => void)[] = [];
	return async function executar<T>(tarefa: () => Promise<T>): Promise<T> {
		// Sem vaga: espera; a vaga é passada direto por quem termina (ninguém fura a fila).
		if (ativas >= maximo) await new Promise<void>((vez) => espera.push(vez));
		else ativas++;
		try {
			return await tarefa();
		} finally {
			const proxima = espera.shift();
			if (proxima) proxima();
			else ativas--;
		}
	};
}
