/**
 * Resumo de uma investigação capturada pela matriz de alçadas.
 * Funções puras (testadas em __tests__/unit/matriz-alcadas.test.ts).
 *
 * O repositório é público: o CPF nunca vai para o resumo, só um hash curto
 * que permite comparar "mesma pessoa antes/depois".
 */
import { createHash } from "node:crypto";

export interface EventoCapturado {
	tipo: string;
	payload: any;
	ms: number;
}

export interface ResumoAlvo {
	id: string;
	descricao: string;
	alcada: string;
	exercita: string;
	cargoEsperado: string;
	ref: string | null;
	terminou: "DONE" | "ERROR" | "TIMEOUT" | "SEM_FIM";
	duracaoMs: number;
	identidade: {
		nome?: string;
		cargo?: string;
		casa?: string;
		uf?: string;
		documento: "CPF" | "CNPJ" | "AUSENTE";
		documentoHash?: string;
		cargoCorreto: boolean;
	} | null;
	eventos: Record<string, number>;
	nos: Record<string, number>;
	nosPorPrefixo: Record<string, number>;
	sentinelas: Record<string, number>;
	erros: string[];
	escritasBloqueadas: number;
}

// "2024-01-01" saiu da lista: o código não injeta mais essa data (removida na Fase 1) e contratos
// reais começam em 1º de janeiro — contava como falso alarme.
const SENTINELAS = ["00000000000", "13149954000185"];

export function hashDocumento(doc: string): string {
	return createHash("sha256").update(doc).digest("hex").slice(0, 10);
}

/** Troca sequências de 11 ou 14 dígitos (CPF/CNPJ) por um hash curto. */
export function mascararDocumentos(texto: string): string {
	return texto.replace(/(?<!\d)(\d{14}|\d{11})(?!\d)/g, (m) => `#${hashDocumento(m)}`);
}

function contar<T>(itens: T[], chave: (i: T) => string): Record<string, number> {
	const r: Record<string, number> = {};
	for (const i of itens) {
		const k = chave(i);
		r[k] = (r[k] ?? 0) + 1;
	}
	return r;
}

/** Prefixo do id do nó (ex.: "despesa-123" → "despesa"), aproxima a fonte. */
export function prefixoNo(id: unknown): string {
	const s = String(id ?? "sem-id");
	return s.split(/[-_:]/)[0] || "sem-id";
}

function resumirIdentidade(eventos: EventoCapturado[], cargoEsperado: string) {
	const pessoa = eventos.find((e) => e.tipo === "NODE_NOVO" && e.payload?.type === "PESSOA");
	if (!pessoa) return null;
	const d = pessoa.payload.data ?? {};
	const doc = String(d.documentoPrincipal ?? d.cpf ?? "").replace(/\D/g, "");
	let documento: "CPF" | "CNPJ" | "AUSENTE" = "AUSENTE";
	if (doc.length === 11) documento = "CPF";
	else if (doc.length === 14) documento = "CNPJ";
	return {
		nome: d.label,
		cargo: d.cargo,
		casa: d.casa,
		uf: d.uf,
		documento,
		documentoHash: doc ? hashDocumento(doc) : undefined,
		cargoCorreto: d.cargo === cargoEsperado,
	};
}

function contarSentinelas(eventos: EventoCapturado[]): Record<string, number> {
	const nos = eventos.filter((e) => e.tipo === "NODE_NOVO").map((e) => JSON.stringify(e.payload));
	const r: Record<string, number> = {};
	for (const s of SENTINELAS) {
		const n = nos.filter((t) => t.includes(s)).length;
		if (n) r[s] = n;
	}
	return r;
}

function terminouCom(eventos: EventoCapturado[], estourou: boolean): ResumoAlvo["terminou"] {
	if (estourou) return "TIMEOUT";
	const ultimo = [...eventos].reverse().find((e) => e.tipo === "DONE" || e.tipo === "ERROR");
	return (ultimo?.tipo as "DONE" | "ERROR" | undefined) ?? "SEM_FIM";
}

export function montarResumo(
	alvo: { id: string; descricao: string; alcada: string; exercita: string; cargoEsperado: string },
	ref: string | null,
	eventos: EventoCapturado[],
	extra: { duracaoMs: number; estourou: boolean; escritasBloqueadas: number },
): ResumoAlvo {
	const nos = eventos.filter((e) => e.tipo === "NODE_NOVO");
	return {
		...alvo,
		ref: ref ? mascararDocumentos(ref) : null,
		terminou: terminouCom(eventos, extra.estourou),
		duracaoMs: extra.duracaoMs,
		identidade: resumirIdentidade(eventos, alvo.cargoEsperado),
		eventos: contar(eventos, (e) => e.tipo),
		nos: contar(nos, (e) => String(e.payload?.type ?? "?")),
		nosPorPrefixo: contar(nos, (e) => prefixoNo(e.payload?.id)),
		sentinelas: contarSentinelas(eventos),
		erros: eventos
			.filter((e) => e.tipo === "ERROR")
			.map((e) => mascararDocumentos(String(e.payload?.mensagem ?? e.payload?.msg ?? "")).slice(0, 200)),
		escritasBloqueadas: extra.escritasBloqueadas,
	};
}

/** Escolhe a ref do primeiro candidato (o que a UI faria ao clicar). */
export function refDoPrimeiroCandidato(eventos: EventoCapturado[]): string | null {
	const lista = eventos.find((e) => e.tipo === "CANDIDATOS_ENCONTRADOS")?.payload?.candidatos;
	if (!Array.isArray(lista) || lista.length === 0) return null;
	return lista[0]?.ref ?? null;
}

export interface Diferenca {
	id: string;
	campo: string;
	antes: string;
	depois: string;
}

function texto(v: unknown): string {
	return typeof v === "object" ? JSON.stringify(v ?? null) : String(v);
}

/** Compara dois conjuntos de resumos (antes × depois) campo a campo. */
export function compararResumos(antes: ResumoAlvo[], depois: ResumoAlvo[]): Diferenca[] {
	const diffs: Diferenca[] = [];
	const porId = new Map(antes.map((r) => [r.id, r]));
	for (const d of depois) {
		const a = porId.get(d.id);
		if (!a) {
			diffs.push({ id: d.id, campo: "alvo", antes: "(novo)", depois: d.terminou });
			continue;
		}
		const campos: [string, unknown, unknown][] = [
			["terminou", a.terminou, d.terminou],
			["cargo", a.identidade?.cargo, d.identidade?.cargo],
			["cargoCorreto", a.identidade?.cargoCorreto, d.identidade?.cargoCorreto],
			["documento", a.identidade?.documento, d.identidade?.documento],
			["documentoHash", a.identidade?.documentoHash, d.identidade?.documentoHash],
			["nos", a.nos, d.nos],
			["sentinelas", a.sentinelas, d.sentinelas],
			["erros", a.erros.length, d.erros.length],
		];
		for (const [campo, va, vd] of campos) {
			if (texto(va) !== texto(vd)) diffs.push({ id: d.id, campo, antes: texto(va), depois: texto(vd) });
		}
	}
	return diffs;
}
