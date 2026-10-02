/* ==========================================================================
   Ações do inspetor por tipo de nó — lógica pura (sem React).
   Regras herdadas do antigo painel lateral do page.tsx:
   - Pivô por CNPJ só com documento de 14 dígitos e fora de empresas de campanha.
   - Mapa/endereço só para CNPJ (> 11 dígitos) fora de campanha.
   - Busca reversa só para sócio.
   - "Ir para o perfil" só para deputado federal com id canônico.
   ========================================================================== */
import { ehCampanha } from "@/components/nodes/card-model";
import { ehHubDeEmendas } from "@/lib/investigacao/dossie-state";
import { soDigitos } from "@/lib/format";
import { extractDeputyId, extractDeputyPhotoUrl } from "@/lib/utils";

export type AcaoId =
	| "perfil"
	| "pivot-cnpj"
	| "busca-reversa"
	| "toggle-emendas"
	| "raio-x"
	| "mapa"
	| "nota";

export interface AcaoNo {
	id: AcaoId;
	label: string;
	primary?: boolean;
	href?: string;
	/** Argumento que o handler recebe (cnpj, nome, id do hub...). */
	arg?: string;
	/** Ação já executada: mostra confirmação no lugar do botão. */
	concluida?: boolean;
}

type Dados = Record<string, any>;

/** CNPJ (14 dígitos) do nó, considerando os campos usados por cada tipo. */
export function cnpjDoNo(type: string, d: Dados): string {
	const bruto = type === "EMPRESA" ? d.cnpj : (d.documento ?? d.cnpjCpfFornecedor);
	const dig = soDigitos(bruto);
	return dig.length === 14 ? dig : "";
}

export function linkMapa(d: Dados): string {
	const termos = [d.label, d.municipio, d.uf, d.cnpj || d.documento || d.cnpjCpfFornecedor ? `CNPJ ${d.cnpj ?? d.documento ?? d.cnpjCpfFornecedor}` : null, "Brasil"]
		.filter(Boolean)
		.join(" ");
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(termos)}`;
}

function documentoLongo(type: string, d: Dados): boolean {
	const bruto = type === "EMPRESA" ? d.cnpj : (d.documento ?? d.cnpjCpfFornecedor);
	return soDigitos(bruto).length > 11;
}

export function urlDocumentoValida(url: unknown): boolean {
	if (typeof url !== "string" || !url) return false;
	return url.endsWith(".pdf") || url.includes("camara.leg.br") || url.includes("senado.leg.br");
}

export function hrefPerfil(d: Dados, nodeId?: string): string | undefined {
	const cargo = String(d.cargo ?? "").toUpperCase();
	const casa = String(d.casa ?? "").toUpperCase();
	if (!cargo.includes("DEPUTADO FEDERAL") && !casa.includes("FEDERAL")) return undefined;
	const id = extractDeputyId(d, nodeId);
	if (!id) return undefined;
	const q = new URLSearchParams({
		nome: String(d.label ?? ""),
		partido: String(d.partido ?? ""),
		uf: String(d.uf ?? ""),
		foto: extractDeputyPhotoUrl(d),
	});
	return `/perfil/deputado/${id}?${q.toString()}`;
}

function acaoPivot(type: string, d: Dados, jaFeito: boolean): AcaoNo[] {
	const cnpj = cnpjDoNo(type, d);
	if (!cnpj || ehCampanha(d)) return [];
	const label = type === "EMPRESA" ? "Expandir teia societária" : "Aprofundar investigação";
	return [{ id: "pivot-cnpj", label, arg: cnpj, primary: type !== "SOCIO", concluida: jaFeito }];
}

function acaoMapa(type: string, d: Dados): AcaoNo[] {
	if (type === "SOCIO" || !documentoLongo(type, d) || ehCampanha(d)) return [];
	return [{ id: "mapa", label: "Analisar endereço (Street View)", href: linkMapa(d) }];
}

interface Ctx {
	id: string;
	type: string;
	d: Dados;
	jaExpandido: boolean;
}

function acoesPessoa({ id, d }: Ctx): AcaoNo[] {
	const href = hrefPerfil(d, id);
	return href ? [{ id: "perfil", label: "Abrir perfil completo", href, primary: true }] : [];
}

function acoesDespesa({ type, d, jaExpandido }: Ctx): AcaoNo[] {
	const nota: AcaoNo[] = urlDocumentoValida(d.urlDocumento)
		? [{ id: "nota", label: "Ver nota digitalizada (PDF)", href: d.urlDocumento, primary: true }]
		: [];
	return [...nota, ...acaoPivot(type, d, jaExpandido), ...acaoMapa(type, d)];
}

function acoesEmpresa({ type, d, jaExpandido }: Ctx): AcaoNo[] {
	return [...acaoPivot(type, d, jaExpandido), ...acaoMapa(type, d)];
}

function acoesSocio({ type, d, jaExpandido }: Ctx): AcaoNo[] {
	const reversa: AcaoNo = {
		id: "busca-reversa",
		label: "Rodar busca reversa",
		arg: String(d.label ?? ""),
		primary: true,
		concluida: jaExpandido,
	};
	return [...acaoPivot(type, d, jaExpandido), reversa];
}

function acoesResumoEmendas({ id, d }: Ctx): AcaoNo[] {
	// só o hub de emendas parlamentares tem emendas filhas (Pix/Transferegov é só resumo)
	if (!ehHubDeEmendas({ id, type: "EMENDA_RESUMO", position: { x: 0, y: 0 }, data: d })) return [];
	const label = d.isExpanded ? "Recolher emendas no canvas" : "Ver todas as emendas no canvas";
	return [{ id: "toggle-emendas", label, arg: id, primary: true }];
}

function acoesRaioX({ d }: Ctx): AcaoNo[] {
	return [{ id: "raio-x", label: "Abrir Raio-X de gastos", arg: String(d.nomeVereador ?? ""), primary: true }];
}

const ACOES_POR_TIPO: Record<string, (c: Ctx) => AcaoNo[]> = {
	PESSOA: acoesPessoa,
	DESPESA: acoesDespesa,
	DESPESA_PUBLICA: acoesDespesa,
	EMPRESA: acoesEmpresa,
	SOCIO: acoesSocio,
	EMENDA_RESUMO: acoesResumoEmendas,
	RESUMO_GASTOS: acoesRaioX,
};

/** Ações do inspetor para um nó. `jaExpandido`: o pivô/busca desse nó já rodou. */
export function acoesDoNo(
	node: { id: string; type?: string; data?: Dados },
	jaExpandido: boolean,
): AcaoNo[] {
	const type = node.type ?? "";
	const fn = ACOES_POR_TIPO[type];
	return fn ? fn({ id: node.id, type, d: node.data ?? {}, jaExpandido }) : [];
}

/** Tipos cujo clique no canvas abre o inspetor (os demais só ficam selecionados). */
export const TIPOS_COM_INSPETOR = new Set([
	"PESSOA",
	"DESPESA",
	"DESPESA_PUBLICA",
	"EMENDA",
	"EMENDA_RESUMO",
	"EMPRESA",
	"SOCIO",
	"SERVIDOR",
	"CONTRATO",
	"PROCESSO_JUDICIAL",
	"DIARIO_OFICIAL_NODE",
	"ORGAO",
	"ATIVIDADE_PARLAMENTAR",
	"RESUMO_GASTOS",
]);
