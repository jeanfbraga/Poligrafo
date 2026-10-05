/* ==========================================================================
   Identificação das proposições votadas (sigla/número/ano, ementa e inteiro
   teor): primeiro o cache de detalhes, depois a API de dados abertos da Câmara
   para o que faltar. SÓ NO SERVIDOR. Nada é gravado no cache aqui: a página do
   projeto espera registros completos (autores, tramitações) naquela tabela.
   ========================================================================== */

export interface ProposicaoResumo {
	titulo?: string;
	ementa?: string;
	integra?: string;
}

const API = "https://dadosabertos.camara.leg.br/api/v2/proposicoes";
const CONCORRENCIA = 8;
const PRAZO_POR_PEDIDO_MS = 4000;

const url = (v: unknown) => (typeof v === "string" && /^https?:\/\//.test(v) ? v : undefined);
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function titulo(sigla: unknown, numero: unknown, ano: unknown): string | undefined {
	return sigla && numero && Number(ano) > 0 ? `${sigla} ${numero}/${ano}` : undefined;
}

export function resumoDaApi(d: Record<string, any>): ProposicaoResumo {
	return { titulo: titulo(d.siglaTipo, d.numero, d.ano), ementa: texto(d.ementa), integra: url(d.urlInteiroTeor) };
}

function resumoDoCache(d: Record<string, any>): ProposicaoResumo {
	return { titulo: texto(d.titulo) ?? titulo(d.sigla_tipo, d.numero, d.ano), ementa: texto(d.ementa), integra: url(d.texto_integral) };
}

async function doCache(supabase: any, ids: string[]): Promise<Map<string, ProposicaoResumo>> {
	const mapa = new Map<string, ProposicaoResumo>();
	if (ids.length === 0) return mapa;
	const { data } = await supabase
		.from("camara_proposicoes_detalhes_cache")
		.select("id_proposicao, titulo, sigla_tipo, numero, ano, ementa, texto_integral")
		.in("id_proposicao", ids);
	for (const d of data ?? []) mapa.set(String(d.id_proposicao), resumoDoCache(d));
	return mapa;
}

async function daApi(id: string): Promise<ProposicaoResumo | null> {
	try {
		const res = await fetch(`${API}/${id}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(PRAZO_POR_PEDIDO_MS) });
		if (!res.ok) return null;
		const json = await res.json();
		return json?.dados ? resumoDaApi(json.dados) : null;
	} catch {
		return null;
	}
}

/** Executa `tarefa` para cada item com no máximo `limite` em paralelo. */
export async function emLotes<T, R>(itens: T[], limite: number, tarefa: (item: T) => Promise<R>): Promise<R[]> {
	const saida: R[] = new Array(itens.length);
	let proximo = 0;
	const trabalhador = async () => {
		while (proximo < itens.length) {
			const i = proximo++;
			saida[i] = await tarefa(itens[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
	return saida;
}

const completo = (p?: ProposicaoResumo) => Boolean(p?.titulo && p.integra);

/** id → resumo; o que não foi encontrado em lugar nenhum fica de fora (o dossiê usa a ficha da Câmara). */
export async function resumirProposicoes(supabase: any, ids: string[]): Promise<Record<string, ProposicaoResumo>> {
	const unicos = [...new Set(ids)];
	const cache = await doCache(supabase, unicos).catch(() => new Map<string, ProposicaoResumo>());
	const faltam = unicos.filter((id) => !completo(cache.get(id)));
	const vivos = await emLotes(faltam, CONCORRENCIA, daApi);
	const saida: Record<string, ProposicaoResumo> = Object.fromEntries(cache);
	faltam.forEach((id, i) => {
		const v = vivos[i];
		if (v) saida[id] = { ...saida[id], ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) };
	});
	return saida;
}
