/* ==========================================================================
   Servidores do gabinete — vínculos agrupados por pessoa.
   A Câmara publica um registro por PERÍODO de lotação: o mesmo servidor aparece
   várias vezes (recesso, troca de cargo, reclassificação). Formatos do campo:
     "De 19/02/2025 a 17/02/2026"  ·  "Desde 31/03/2026"  ·  "dd/mm/aaaa até dd/mm/aaaa"
   ========================================================================== */

export type StatusServidor = "ATIVO" | "EXONERADO";

export interface Periodo {
	inicio: Date | null;
	/** `null` = em aberto (sem data final). */
	fim: Date | null;
	/** Conseguiu ler o texto do período. */
	valido: boolean;
}

export interface Vinculo {
	cargo: string;
	periodo: string;
	inicio: Date | null;
	fim: Date | null;
	status: StatusServidor;
}

export interface ServidorAgrupado {
	nome: string;
	/** Vínculo mais recente (primeiro da lista). */
	atual: Vinculo;
	/** Do mais recente ao mais antigo. */
	vinculos: Vinculo[];
	/** ATIVO se algum vínculo está vigente. */
	status: StatusServidor;
}

const DATA = /(\d{2})\/(\d{2})\/(\d{4})/g;

function data(d: RegExpMatchArray | undefined): Date | null {
	return d ? new Date(Number(d[3]), Number(d[2]) - 1, Number(d[1])) : null;
}

export function lerPeriodo(periodo?: string | null): Periodo {
	const datas = [...String(periodo ?? "").matchAll(DATA)];
	if (datas.length === 0) return { inicio: null, fim: null, valido: false };
	return { inicio: data(datas[0]), fim: datas.length > 1 ? data(datas[1]) : null, valido: true };
}

function hojeSemHora(hoje: Date): Date {
	const b = new Date(hoje);
	b.setHours(0, 0, 0, 0);
	return b;
}

/** Vigente: sem data final, ou com data final ainda não passada. Sem período legível, mantém ATIVO. */
export function statusDoPeriodo(periodo?: string | null, hoje: Date = new Date()): StatusServidor {
	const p = lerPeriodo(periodo);
	if (!p.valido || !p.fim) return "ATIVO";
	return p.fim < hojeSemHora(hoje) ? "EXONERADO" : "ATIVO";
}

function paraVinculo(s: Record<string, any>, hoje: Date): Vinculo {
	const periodo = String(s.periodo ?? "");
	const p = lerPeriodo(periodo);
	return {
		cargo: String(s.cargo || "Não informado"),
		periodo: periodo || "período não informado",
		inicio: p.inicio,
		fim: p.fim,
		status: statusDoPeriodo(periodo, hoje),
	};
}

/** Mais recente primeiro (por início; sem início vai para o fim). */
function maisRecente(a: Vinculo, b: Vinculo): number {
	return (b.inicio?.getTime() ?? -Infinity) - (a.inicio?.getTime() ?? -Infinity);
}

function chaveDaPessoa(nome: unknown): string {
	return String(nome ?? "").trim().toUpperCase();
}

/** Uma entrada por pessoa; ativos primeiro, depois por nome. */
export function agruparServidores(servidores: Record<string, any>[], hoje: Date = new Date()): ServidorAgrupado[] {
	const porPessoa = new Map<string, { nome: string; vinculos: Vinculo[] }>();
	for (const s of servidores ?? []) {
		const chave = chaveDaPessoa(s.nome);
		if (!chave) continue;
		const grupo = porPessoa.get(chave) ?? { nome: String(s.nome).trim(), vinculos: [] };
		grupo.vinculos.push(paraVinculo(s, hoje));
		porPessoa.set(chave, grupo);
	}
	return [...porPessoa.values()]
		.map(({ nome, vinculos }) => {
			const ordenados = [...vinculos].sort(maisRecente);
			const status: StatusServidor = ordenados.some((v) => v.status === "ATIVO") ? "ATIVO" : "EXONERADO";
			return { nome, atual: ordenados[0], vinculos: ordenados, status };
		})
		.sort((a, b) => (a.status === b.status ? a.nome.localeCompare(b.nome) : a.status === "ATIVO" ? -1 : 1));
}

export interface CargoContado {
	cargo: string;
	quantidade: number;
}

/** Quantas pessoas ativas há em cada cargo (pelo vínculo mais recente), do maior para o menor. */
export function resumoPorCargo(pessoas: ServidorAgrupado[]): CargoContado[] {
	const mapa = new Map<string, number>();
	for (const p of pessoas) {
		if (p.status !== "ATIVO") continue;
		mapa.set(p.atual.cargo, (mapa.get(p.atual.cargo) ?? 0) + 1);
	}
	return [...mapa.entries()].map(([cargo, quantidade]) => ({ cargo, quantidade })).sort((a, b) => b.quantidade - a.quantidade || a.cargo.localeCompare(b.cargo));
}