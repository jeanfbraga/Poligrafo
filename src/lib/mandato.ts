/* ==========================================================================
   Situação do mandato de um deputado federal.
   1) `mandatoDoHistorico` (servidor): lê o histórico da Câmara e devolve fatos estruturados.
   2) `statusDoMandato` (tela): transforma esses fatos em UM selo + UMA frase de contexto,
      conforme o cenário (mandato inteiro, posse tardia, retorno, suplência, licença…).
   ========================================================================== */

/** Início da 57ª legislatura (posse dos eleitos em 2022). */
export const INICIO_LEGISLATURA = "2023-02-01";
const LEGISLATURA_ATUAL = 57;

export type SituacaoMandato = "Exercício" | "Licença" | "Suplência";
export type OrigemPosse = "recontagem" | "convocacao" | "";
export type MotivoAfastamento = "ministro" | "saude" | "outro";

export interface MandatoHistorico {
	situacao: SituacaoMandato;
	condicaoEleitoral: string;
	/** Primeira entrada em exercício na legislatura (AAAA-MM-DD). */
	dataPosse: string;
	/** Última entrada em exercício (posse ou retorno). */
	dataEntrada: string;
	/** Última saída (licença/suplência), se houver. */
	dataSaida: string;
	origemPosse: OrigemPosse;
	motivoAfastamento: MotivoAfastamento | "";
}

type Evento = { dataHora?: string; descricaoStatus?: string; situacao?: string; idLegislatura?: number };

const minusculo = (t?: string): string => (t ?? "").toLowerCase();
const dia = (dataHora?: string): string => (dataHora ?? "").slice(0, 10);

function eventosDaLegislatura(historico: Evento[]): Evento[] {
	if (!Array.isArray(historico)) return [];
	const atuais = historico.filter((h) => h.idLegislatura === LEGISLATURA_ATUAL || !h.idLegislatura);
	return [...(atuais.length > 0 ? atuais : historico)].sort((a, b) => (a.dataHora ?? "").localeCompare(b.dataHora ?? ""));
}

/** Só posse/reassunção contam como entrada ("Alteração de partido" também vem como Exercício e não é entrada). */
function ehEntrada(ev: Evento): boolean {
	return minusculo(ev.descricaoStatus).startsWith("entrada");
}

function ehSaida(ev: Evento): boolean {
	const desc = minusculo(ev.descricaoStatus);
	const sit = minusculo(ev.situacao);
	return desc.startsWith("saída") || desc.startsWith("saida") || sit.includes("supl") || sit.includes("licen");
}

function origemDaPosse(eventos: Evento[], dataPosse: string): OrigemPosse {
	const doDia = eventos.filter((e) => dia(e.dataHora) === dataPosse).map((e) => minusculo(e.descricaoStatus));
	if (doDia.some((d) => d.includes("recontagem"))) return "recontagem";
	return doDia.some((d) => d.includes("convoca")) ? "convocacao" : "";
}

function motivoDoAfastamento(saida?: Evento): MotivoAfastamento | "" {
	if (!saida) return "";
	const desc = minusculo(saida.descricaoStatus);
	if (desc.includes("ministro")) return "ministro";
	return desc.includes("saúde") || desc.includes("saude") ? "saude" : "outro";
}

function situacaoAtual(ultimoStatus: any, houveSaidaDepoisDaEntrada: boolean): SituacaoMandato {
	const s = minusculo(ultimoStatus?.situacao);
	if (s.includes("supl")) return "Suplência";
	return s.includes("licen") || houveSaidaDepoisDaEntrada ? "Licença" : "Exercício";
}

export function mandatoDoHistorico(historico: Evento[], ultimoStatus: any): MandatoHistorico {
	const eventos = eventosDaLegislatura(historico);
	const entradas = eventos.filter(ehEntrada);
	const saidas = eventos.filter(ehSaida);
	const entrada = entradas[entradas.length - 1];
	const saida = saidas[saidas.length - 1];
	const saiuDepois = Boolean(saida && (!entrada || (saida.dataHora ?? "") > (entrada.dataHora ?? "")));
	const dataPosse = dia(entradas[0]?.dataHora);
	return {
		situacao: situacaoAtual(ultimoStatus, saiuDepois),
		condicaoEleitoral: ultimoStatus?.condicaoEleitoral || "Titular",
		dataPosse,
		dataEntrada: dia(entrada?.dataHora),
		dataSaida: dia(saida?.dataHora) || dia(ultimoStatus?.data),
		origemPosse: origemDaPosse(eventos, dataPosse),
		motivoAfastamento: motivoDoAfastamento(saida),
	};
}

/* ------------------------------ tela ------------------------------ */

export type TomDoStatus = "phos" | "warn" | "steel" | "default";

export interface StatusDoMandato {
	/** Selo único com a situação (substitui "Titular"/"Exercício"/"Em exercício parlamentar…"). */
	rotulo: string;
	tom: TomDoStatus;
	/** Frase de contexto; vazia quando o selo já diz tudo (mandato inteiro, sem novidade). */
	detalhe: string;
	/** Condição para a linha de cargo: só aparece quando não é o caso comum (titular). */
	condicao: string;
}

export function formatarDataIso(iso?: string): string {
	const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
	return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const ORIGEM_TEXTO: Record<OrigemPosse, string> = {
	recontagem: " (convocado pela Mesa após recontagem de votos)",
	convocacao: " (convocado pela Mesa)",
	"": "",
};

const MOTIVO_TEXTO: Record<MotivoAfastamento | "", string> = {
	ministro: " para exercer o cargo de Ministro de Estado",
	saude: " para tratamento de saúde",
	outro: "",
	"": "",
};

function ehSuplente(p: Record<string, any>): boolean {
	return minusculo(p.condicao_eleitoral).includes("supl");
}

function detalheDoExercicio(p: Record<string, any>): string {
	const posse = formatarDataIso(p.data_posse);
	const entrada = formatarDataIso(p.data_entrada);
	const tardia = Boolean(p.data_posse) && p.data_posse > INICIO_LEGISLATURA;
	if (p.data_entrada && p.data_posse && p.data_entrada > p.data_posse) return `Retomou o exercício em ${entrada}.`;
	if (!tardia) return "";
	const origem = ORIGEM_TEXTO[(p.origem_posse as OrigemPosse) ?? ""] ?? "";
	return `${ehSuplente(p) ? "Assumiu" : "Tomou posse"} em ${posse}${origem}.`;
}

function detalheDoAfastamento(p: Record<string, any>): string {
	const saida = formatarDataIso(p.data_saida);
	const motivo = MOTIVO_TEXTO[(p.motivo_afastamento as MotivoAfastamento) ?? ""] ?? "";
	return saida ? `Afastado desde ${saida}${motivo}.` : "";
}

function detalheDaSuplencia(p: Record<string, any>): string {
	const de = formatarDataIso(p.data_posse);
	const ate = formatarDataIso(p.data_saida);
	if (de && ate) return `Exerceu o mandato de ${de} a ${ate}.`;
	return ate ? `Fora de exercício desde ${ate}.` : "";
}

/** Escolhe selo e frase conforme o cenário do mandato. Sem dados de situação, devolve só o mínimo. */
export function statusDoMandato(perfil: Record<string, any> | null | undefined): StatusDoMandato {
	const p = perfil ?? {};
	const condicao = ehSuplente(p) ? "Suplente" : "";
	const situacao = minusculo(p.situacao);
	if (situacao.includes("licen")) return { rotulo: "Licenciado", tom: "steel", detalhe: detalheDoAfastamento(p), condicao };
	if (situacao.includes("supl")) return { rotulo: "Suplente fora de exercício", tom: "warn", detalhe: detalheDaSuplencia(p), condicao: "" };
	if (situacao.includes("exerc")) return { rotulo: "Em exercício", tom: condicao ? "warn" : "phos", detalhe: detalheDoExercicio(p), condicao };
	return { rotulo: p.situacao ? String(p.situacao) : "", tom: "default", detalhe: "", condicao };
}
