/**
 * Comparação de eventos SSE do golden master (scripts/qa/golden/executar.ts).
 * Tira o que muda a cada execução — carimbo de tempo e sufixo aleatório nos ids,
 * datas ISO, durações e o "Triagem em progresso... (Ns)" — e compara o resto.
 */
export interface EventoGolden {
	tipo: string;
	payload: unknown;
}

const BATIMENTO = /Triagem em progresso\.\.\. \(\d+s\)/;

function normalizarTexto(s: string): string {
	return s
		.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "<T>")
		.replace(/\d{13}(-[a-z0-9]{4,9})?/g, "<TS>")
		.replace(/^(anac(-forn)?-.+)-[a-z0-9]{5}$/, "$1-<R>")
		.replace(/\b\d+([.,]\d+)?\s?(ms|s)\b/g, "<DUR>");
}

export function normalizar(v: unknown): unknown {
	if (typeof v === "string") return normalizarTexto(v);
	if (Array.isArray(v)) return v.map(normalizar);
	if (v && typeof v === "object") {
		const saida: Record<string, unknown> = {};
		// Ids com carimbo de tempo também aparecem como chave (escores do grafo por id de nó).
		for (const k of Object.keys(v).sort((x, y) => normalizarTexto(x).localeCompare(normalizarTexto(y)))) {
			if (k === "ms" || k === "timestamp") continue;
			saida[normalizarTexto(k)] = normalizar((v as Record<string, unknown>)[k]);
		}
		return saida;
	}
	return v;
}

function chave(e: EventoGolden): string {
	return JSON.stringify({ tipo: e.tipo, payload: normalizar(e.payload) });
}

function relevantes(eventos: EventoGolden[]): string[] {
	return eventos.filter((e) => !(e.tipo === "STATUS" && BATIMENTO.test(String((e.payload as { msg?: string })?.msg)))).map(chave);
}

function contar(lista: string[]): Map<string, number> {
	const m = new Map<string, number>();
	for (const k of lista) m.set(k, (m.get(k) ?? 0) + 1);
	return m;
}

const curto = (k: string) => (k.length > 240 ? `${k.slice(0, 240)}…` : k);

/** Eventos que estão em `de` mais vezes do que em `em`. */
function faltando(de: Map<string, number>, em: Map<string, number>, rotulo: string): string[] {
	const dif: string[] = [];
	for (const [k, n] of de) {
		const falta = n - (em.get(k) ?? 0);
		if (falta > 0) dif.push(`${rotulo} (${falta}x): ${curto(k)}`);
	}
	return dif;
}

/**
 * Avisos de conexão (ETAPA) vêm de fontes em paralelo (ex.: a conferência das empresas
 * declaradas roda em segundo plano): contam como conjunto. O resto, em ordem exata.
 */
function mudancaDeOrdem(a: string[], b: string[]): string[] {
	const semEtapa = (l: string[]) => l.filter((k) => !k.startsWith('{"tipo":"ETAPA"'));
	const [sa, sb] = [semEtapa(a), semEtapa(b)];
	const i = sa.findIndex((k, j) => k !== sb[j]);
	return i >= 0 ? [`ordem mudou no evento ${i} (sem ETAPA): era ${curto(sa[i])} | agora ${curto(sb[i])}`] : [];
}

/** Diferenças entre a referência e a execução nova; [] = mesmo comportamento. */
export function compararEventos(referencia: EventoGolden[], nova: EventoGolden[]): string[] {
	const a = relevantes(referencia);
	const b = relevantes(nova);
	const [ca, cb] = [contar(a), contar(b)];
	const dif = [...faltando(ca, cb, "sumiu"), ...faltando(cb, ca, "apareceu")];
	return dif.length > 0 ? dif : mudancaDeOrdem(a, b);
}
