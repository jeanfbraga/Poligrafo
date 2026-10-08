/**
 * Motor de cruzamentos: índice por documento, regras da tabela, achados com
 * os fatos que os sustentam. Funções puras (testes sem rede). Ver nota 31.
 */
import { documentoParaPrompt } from "@/lib/documento";
import { REGRAS } from "./regras";
import type { Achado, Fato, Papel, Regra, Severidade } from "./tipos";

const REBAIXAR: Record<Severidade, Severidade> = { ALTA: "MEDIA", MEDIA: "BAIXA", BAIXA: "BAIXA" };
const ORDEM: Record<Severidade, number> = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
/** Quantos fatos de cada papel entram no resumo. */
const NO_RESUMO = 3;

type Indice = Map<string, Map<Papel, Fato[]>>;

function indexar(fatos: Fato[], chave: (doc: string) => string | null): Indice {
	const indice: Indice = new Map();
	for (const f of fatos) {
		const k = chave(f.documento);
		if (!k) continue;
		const porPapel = indice.get(k) ?? new Map<Papel, Fato[]>();
		porPapel.set(f.papel, [...(porPapel.get(f.papel) ?? []), f]);
		indice.set(k, porPapel);
	}
	return indice;
}

/** Raiz do CNPJ (8 dígitos): mesma empresa, outra filial. CPF não tem raiz. */
export function raizCnpj(doc: string): string | null {
	return /^\d{14}$/.test(doc) ? doc.slice(0, 8) : null;
}

/** CPF, CNPJ ou o número do candidato no TSE (eleito sem CPF publicado). */
function documentoValidoParaCruzar(doc: string): string | null {
	return /^(\d{11}|\d{14}|SQ-\d+)$/.test(doc) ? doc : null;
}

/** Como o documento aparece na tela e no prompt: CPF mascarado (LGPD), nº do TSE por extenso. */
export function documentoLegivel(doc: string): string {
	return doc.startsWith("SQ-") ? `candidato nº ${doc.slice(3)} no TSE` : documentoParaPrompt(doc);
}

function formatarValor(v: number | undefined): string {
	return v ? ` (R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "";
}

function descreverFato(f: Fato): string {
	const partes = [f.detalhe, f.data].filter(Boolean).join(", ");
	return `${f.procedencia.fonte}${partes ? ` — ${partes}` : ""}${formatarValor(f.valor)}`;
}

function descreverLado(fatos: Fato[]): string {
	const extras = fatos.length > NO_RESUMO ? ` e mais ${fatos.length - NO_RESUMO}` : "";
	return fatos.slice(0, NO_RESUMO).map(descreverFato).join("; ") + extras;
}

export function montarResumo(regra: Regra, nome: string, documento: string, a: Fato[], b: Fato[], somenteRaiz: boolean): string {
	const raiz = somenteRaiz ? " A coincidência é só na raiz do CNPJ (matriz/filial): confira se é a mesma empresa." : "";
	// CPF de pessoa física sai mascarado (LGPD): o resumo vai para a tela e para o prompt.
	const quem = nome ? `${nome} (${documentoLegivel(documento)})` : documentoLegivel(documento);
	return `${quem}: ${regra.porque}. ${descreverLado(a)}. ${descreverLado(b)}.${raiz}`;
}

function nomeMaisInformativo(fatos: Fato[]): string {
	return fatos.map((f) => f.nome).filter(Boolean).sort((x, y) => y.length - x.length)[0] ?? "";
}

function criarAchado(regra: Regra, documento: string, a: Fato[], b: Fato[], somenteRaiz: boolean): Achado {
	const nome = nomeMaisInformativo([...a, ...b]);
	const ajuste = regra.ajustar?.(a, b) ?? null;
	const base = ajuste?.severidade ?? regra.severidade;
	const nota = ajuste?.nota ? ` ${ajuste.nota}` : "";
	return {
		id: `achado-${regra.id}-${documento}`,
		regra: regra.id,
		titulo: regra.titulo,
		severidade: somenteRaiz ? REBAIXAR[base] : base,
		documento,
		nome,
		somenteRaiz,
		fatos: [...a, ...b].map((f) => f.id),
		resumo: montarResumo(regra, nome, documento, a, b, somenteRaiz) + nota,
	};
}

function aplicarNoIndice(regra: Regra, indice: Indice, somenteRaiz: boolean, jaAchados: Set<string>): Achado[] {
	const [pa, pb] = regra.papeis;
	const achados: Achado[] = [];
	for (const porPapel of indice.values()) {
		const a = porPapel.get(pa);
		const b = porPapel.get(pb);
		if (!a?.length || !b?.length) continue;
		const documento = a[0].documento;
		// Raiz: só quando os documentos completos são diferentes e não houve achado completo.
		if (somenteRaiz && (b.every((f) => f.documento === documento) || jaAchados.has(`${regra.id}:${raizCnpj(documento)}`))) continue;
		achados.push(criarAchado(regra, documento, a, b, somenteRaiz));
	}
	return achados;
}

export function executarCruzamentos(fatos: Fato[], regras: Regra[] = REGRAS): Achado[] {
	const completos = indexar(fatos, documentoValidoParaCruzar);
	const porRaiz = indexar(fatos, raizCnpj);
	const achados: Achado[] = [];
	for (const regra of regras) {
		const diretos = aplicarNoIndice(regra, completos, false, new Set());
		const raizesAchadas = new Set(diretos.map((x) => `${regra.id}:${raizCnpj(x.documento)}`));
		achados.push(...diretos, ...aplicarNoIndice(regra, porRaiz, true, raizesAchadas));
	}
	return achados.sort((x, y) => ORDEM[x.severidade] - ORDEM[y.severidade]);
}
