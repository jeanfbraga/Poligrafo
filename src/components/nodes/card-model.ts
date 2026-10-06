/* ==========================================================================
   Modelo de card — adaptador puro: dados da API → o que o card mostra.
   Um adaptador por tipo de nó; o NodeCard, a lista mobile e o inspetor
   consomem este mesmo modelo (consistência entre telas).
   ========================================================================== */
import {
	brl,
	brlCurto,
	cpfMascarado,
	dataBR,
	documentoFormatado,
	numeroSeguro,
	percentual,
} from "@/lib/format";
import { regraCritica, riscoDoNo, type Risco } from "@/lib/investigacao/risco";
import { type Familia, tipoDoNo } from "./node-types";
import type { PixelIconName } from "@/components/pixel/pixel-icons";

export interface CampoCard {
	label: string;
	value: string;
	chip?: boolean;
	wide?: boolean;
}

/** Acima disso o destaque do card é texto (não número) e usa corpo menor para caber. */
export const LIMITE_DESTAQUE_LONGO = 18;

export interface ModeloCard {
	tipo: string;
	familia: Familia;
	icon: PixelIconName;
	tag: string;
	titulo: string;
	sub: string;
	chave: { label: string; valor: string; dica: string; curto: string };
	campos: CampoCard[];
	medidor: { label: string; valor: number } | null;
	motivo: string;
	fonte: string;
	risco: Risco;
	score: number | null;
	/** Motivo do risco crítico quando ele vem de regra e não da nota da IA (ex.: "emenda fantasma"). */
	regra: string | null;
}

type Dados = Record<string, any>;
type Parcial = Partial<Omit<ModeloCard, "tipo" | "familia" | "icon" | "risco" | "score" | "regra">>;

/** Primeiro texto não vazio. */
export function primeiro(...vs: unknown[]): string {
	for (const v of vs) {
		if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
	}
	return "";
}

const campo = (label: string, value: string, extra?: Partial<CampoCard>): CampoCard => ({ label, value, ...extra });
const comValor = (cs: CampoCard[]): CampoCard[] => cs.filter((c) => c.value !== "");

/* ---- adaptadores por tipo ---- */

function variacaoPatrimonio(d: Dados): string {
	const variacao = numeroSeguro(d.variacaoPatrimonioPercentual);
	if (variacao === null) return "";
	const sinal = variacao >= 0 ? "▲ +" : "▼ ";
	return `${sinal}${percentual(variacao)} vs ${primeiro(d.anoPatrimonioAnterior, "anterior")}`;
}

function chavePatrimonio(d: Dados): ModeloCard["chave"] {
	const patr = numeroSeguro(d.patrimonio) ?? 0;
	const ano = d.anoPatrimonio ? ` (${d.anoPatrimonio})` : "";
	return {
		label: `Patrimônio declarado${ano}`,
		valor: patr > 0 ? brl(patr) : "Não localizado",
		dica: variacaoPatrimonio(d),
		curto: patr > 0 ? brlCurto(patr) : "—",
	};
}

function chaveDocumento(doc: string): ModeloCard["chave"] {
	return {
		label: "Documento raiz",
		valor: doc ? documentoFormatado(doc) : "Sigiloso / não encontrado",
		dica: "",
		curto: (doc && cpfMascarado(doc)) || "—",
	};
}

function pessoa(d: Dados): Parcial {
	const doc = primeiro(d.documentoPrincipal, d.cpf);
	const bens = Array.isArray(d.bensDeclarados) ? d.bensDeclarados.length : 0;
	return {
		sub: [primeiro(d.cargo), primeiro(d.uf)].filter(Boolean).join(" · "),
		chave: d.patrimonio !== undefined ? chavePatrimonio(d) : chaveDocumento(doc),
		campos: comValor([
			campo("Nome civil", primeiro(d.nomeCivil)),
			campo(d.isCnpj ? "CNPJ de campanha" : "CPF", doc ? documentoFormatado(doc) : "", { chip: true, wide: true }),
			campo("Bens declarados", bens > 0 ? String(bens) : ""),
		]),
		motivo: primeiro(d.afastamento?.motivo),
		fonte: "Câmara · TSE",
	};
}

function despesa(d: Dados): Parcial {
	const doc = primeiro(d.documento, d.cnpjCpfFornecedor);
	return {
		tag: primeiro(d.tipo, "Despesa"),
		titulo: primeiro(d.nomeFornecedor, d.label),
		sub: primeiro(d.tipo, d.descricao),
		chave: { label: "Valor", valor: brl(d.valor), dica: dataBR(d.dataDocumento) || "Data indisponível", curto: brlCurto(d.valor) },
		campos: comValor([
			campo("Emissão", dataBR(d.dataDocumento)),
			campo("Documento", primeiro(d.numeroDocumento), { chip: true }),
			campo("CNPJ/CPF", doc ? documentoFormatado(doc) : "", { chip: true, wide: true }),
		]),
		motivo: primeiro(d.motivo_ia),
		fonte: d.casa === "SENADO" ? "Senado · CEAPS" : "Câmara · CEAP",
	};
}

function contrato(d: Dados): Parcial {
	const ehEmenda = String(d.label ?? "").startsWith("EMENDA");
	return {
		tag: ehEmenda ? "Emenda parlamentar" : "Contrato federal",
		sub: primeiro(d.objeto),
		chave: { label: "Valor", valor: brl(d.valor), dica: dataBR(d.dataDocumento), curto: brlCurto(d.valor) },
		campos: comValor([campo("Código", primeiro(d.codigo), { chip: true }), campo("Fornecedor", primeiro(d.nomeFornecedor), { wide: true })]),
		motivo: d.codigo === "TSE-BENS" ? "" : primeiro(d.motivo_ia),
		fonte: primeiro(d.fonte, "PNCP"),
	};
}

function taxaExecucao(d: Dados): number {
	return numeroSeguro(d.percentualExecucao ?? d._percentualExecucao ?? d.taxaExecucao) ?? 0;
}

function emenda(d: Dados): Parcial {
	const taxa = taxaExecucao(d);
	const fantasma = Boolean(d.isFantasma ?? d._isFantasma);
	const valor = d._empenhado ?? d.valor;
	return {
		tag: primeiro(d.tipo, "Emenda"),
		sub: primeiro(d.objeto, d.subfuncao),
		chave: { label: "Valor empenhado", valor: brl(valor), dica: fantasma ? `Fantasma: ${taxa}% executado` : `${taxa}% executado`, curto: brlCurto(valor) },
		medidor: { label: "Execução", valor: taxa },
		campos: comValor([campo("Empenho", primeiro(d.codigo), { chip: true }), campo("Ano", primeiro(d.ano))]),
		motivo: fantasma ? `Emenda fantasma: ${taxa}% executado.` : primeiro(d.motivo_ia),
		fonte: "Transferegov",
	};
}

/** Resumo do Transferegov (transferências especiais): só totais, sem emendas individuais. */
function ehResumoTransferegov(d: Dados): boolean {
	return /transferegov/i.test(String(d.label ?? ""));
}

function subDoResumo(d: Dados, total: number): string {
	if (ehResumoTransferegov(d)) return "Resumo das transferências especiais (sem detalhe por emenda)";
	return d.isExpanded ? "Emendas exibidas no canvas" : `Hub · ${total} emendas ocultas no canvas`;
}

function emendaResumo(d: Dados): Parcial {
	const total = numeroSeguro(d.totalEmendas) ?? 0;
	const fantasmas = numeroSeguro(d.fantasmas) ?? 0;
	const soTotais = ehResumoTransferegov(d);
	return {
		titulo: `${total} emendas · ${brlCurto(d.totalEmpenhado)}`,
		sub: subDoResumo(d, total),
		chave: { label: "Total empenhado", valor: brl(d.totalEmpenhado), dica: fantasmas > 0 ? `${fantasmas} fantasma(s)` : "", curto: brlCurto(d.totalEmpenhado) },
		medidor: soTotais ? null : { label: "Execução global", valor: numeroSeguro(d.percentualExecucao) ?? 0 },
		motivo: Array.isArray(d.alertas) ? primeiro(d.alertas[0]) : "",
		campos: comValor([campo("Emendas", String(total)), campo("Pix", d.emendasPIX ? String(d.emendasPIX) : "")]),
		fonte: soTotais ? "Transferegov" : "Portal da Transparência · CGU",
	};
}

function empresa(d: Dados): Parcial {
	const cnpj = primeiro(d.cnpj);
	const capital = numeroSeguro(d.capitalSocial);
	const chave =
		capital === null
			? { label: "CNPJ", valor: cnpj ? documentoFormatado(cnpj) : "—", dica: primeiro(d.situacao), curto: cnpj ? documentoFormatado(cnpj) : "—" }
			: { label: "Capital social", valor: brl(capital), dica: primeiro(d.situacao), curto: brlCurto(capital) };
	return {
		tag: primeiro(d.tipo, "Pessoa jurídica"),
		sub: primeiro(d.cnae),
		chave,
		campos: comValor([
			campo("CNPJ", cnpj ? documentoFormatado(cnpj) : "", { chip: true }),
			campo("Situação", primeiro(d.situacao)),
			campo("CNAE", primeiro(d.cnae), { wide: true }),
		]),
		motivo: ehCampanha(d) ? "" : primeiro(d.motivo_ia),
		fonte: "Receita Federal",
	};
}

/** Empresas de campanha/eleição não recebem análise de IA no card (regra herdada). */
export function ehCampanha(d: Dados): boolean {
	const texto = `${d.label ?? ""} ${d.cnae ?? ""}`.toUpperCase();
	return texto.includes("ELEICAO") || texto.includes("CAMPANHA");
}

function orgao(d: Dados): Parcial {
	return {
		sub: primeiro(d.esfera),
		chave: { label: "Esfera", valor: primeiro(d.esfera, "—"), dica: "", curto: primeiro(d.esfera, "—") },
		campos: comValor([campo("Esfera", primeiro(d.esfera)), campo("CNPJ", d.cnpj ? documentoFormatado(d.cnpj) : "", { chip: true })]),
		motivo: primeiro(d.motivo_ia),
		fonte: primeiro(d.fonte, "Dados abertos"),
	};
}

function socio(d: Dados): Parcial {
	// A qualificação aparece uma vez só (destaque); subtítulo e campo repetiam o mesmo texto.
	return {
		sub: "",
		chave: { label: "Qualificação", valor: primeiro(d.cargo, "—"), dica: "", curto: primeiro(d.cargo, "—") },
		campos: [],
		fonte: "Receita Federal · QSA",
	};
}

function processo(d: Dados): Parcial {
	const sancao = d.tribunal === "Cadastro de Inidôneos/Sancionados (CGU)";
	return {
		tag: sancao ? "Sanção · CGU/TCU" : "Processo judicial",
		titulo: primeiro(d.assunto, d.label),
		sub: primeiro(d.tribunal),
		chave: { label: "Ajuizamento", valor: dataBR(d.dataAjuizamento) || "—", dica: "", curto: dataBR(d.dataAjuizamento) || "—" },
		campos: comValor([campo("Instância", primeiro(d.tribunal)), campo("Assunto", primeiro(d.assunto), { wide: true })]),
		motivo: primeiro(d.motivo_ia),
		fonte: primeiro(d.tribunal, "CNJ · DataJud"),
	};
}

function raioX(d: Dados): Parcial {
	return {
		sub: "Raio-X dos gastos do gabinete",
		chave: { label: "Detalhes", valor: "Abrir Raio-X", dica: "", curto: "Raio-X" },
		fonte: "Câmara Municipal",
	};
}

function atividade(d: Dados): Parcial {
	return {
		sub: primeiro(d.motivo_ia, "Presenças e votações na legislatura atual"),
		chave: { label: "Resumo", valor: "Presenças e votações", dica: "", curto: "Atividade" },
		fonte: "Câmara",
	};
}

function diario(d: Dados): Parcial {
	const local = [primeiro(d.municipio, "N/I"), primeiro(d.uf)].filter(Boolean).join(" / ");
	const valor = numeroSeguro(d.valor) ?? 0;
	return {
		sub: primeiro(d.tipoEvento, "Publicação legal"),
		chave: { label: "Publicação", valor: dataBR(d.dataPublicacao) || "—", dica: local, curto: dataBR(d.dataPublicacao) || "—" },
		campos: comValor([campo("Município/UF", local), campo("Empresa", primeiro(d.empresa), { wide: true }), campo("Valor", valor > 0 ? brl(valor) : "")]),
		motivo: primeiro(d.resumo),
		fonte: "Diário oficial",
	};
}

const ROTULO_SEVERIDADE: Record<string, string> = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

/** Cruzamento do motor (regra fixa, sem IA): gravidade, documento e as fontes dos fatos. */
function achado(d: Dados): Parcial {
	const fatos: Dados[] = Array.isArray(d.fatos) ? d.fatos : [];
	const fontes = [...new Set(fatos.map((f) => primeiro(f.fonte)).filter(Boolean))];
	const gravidade = ROTULO_SEVERIDADE[primeiro(d.severidade)] ?? "—";
	return {
		sub: primeiro(d.nome),
		chave: { label: "Gravidade", valor: gravidade, dica: d.somenteRaiz ? "Só a raiz do CNPJ coincide" : `${fatos.length} fatos`, curto: gravidade },
		campos: comValor([
			campo("CNPJ/CPF", d.documento ? documentoFormatado(d.documento) : "", { chip: true, wide: true }),
			campo("Fatos", fatos.length ? String(fatos.length) : ""),
		]),
		motivo: primeiro(d.explicacao_ia, d.motivo_ia),
		fonte: fontes.slice(0, 2).join(" · ") || "Regra (sem IA)",
	};
}

const ADAPTADORES: Record<string, (d: Dados) => Parcial> = {
	ACHADO: achado,
	PESSOA: pessoa,
	DESPESA: despesa,
	DESPESA_PUBLICA: despesa,
	CONTRATO: contrato,
	EMENDA: emenda,
	EMENDA_RESUMO: emendaResumo,
	EMPRESA: empresa,
	ORGAO: orgao,
	SOCIO: socio,
	SERVIDOR: socio,
	PROCESSO_JUDICIAL: processo,
	RESUMO_GASTOS: raioX,
	ATIVIDADE_PARLAMENTAR: atividade,
	DIARIO_OFICIAL_NODE: diario,
};

function scoreExibido(d: Dados): number | null {
	const v = numeroSeguro(d.score_letalidade ?? d.score);
	return v === null ? null : v;
}

const CHAVE_PADRAO: ModeloCard["chave"] = { label: "Registro", valor: "—", dica: "", curto: "—" };

function completar(parcial: Parcial, d: Dados, tagPadrao: string): Omit<ModeloCard, "tipo" | "familia" | "icon" | "risco" | "score" | "regra"> {
	return {
		tag: parcial.tag ?? tagPadrao,
		titulo: parcial.titulo ?? primeiro(d.label, "Sem título"),
		sub: parcial.sub ?? "",
		chave: parcial.chave ?? CHAVE_PADRAO,
		campos: parcial.campos ?? [],
		medidor: parcial.medidor ?? null,
		motivo: parcial.motivo ?? primeiro(d.motivo_ia),
		fonte: parcial.fonte ?? "",
	};
}

/** Constrói o modelo de card a partir de um nó do Dossiê. */
export function construirCard(type: string, data: Dados | undefined): ModeloCard {
	const d = data ?? {};
	const tipo = tipoDoNo(type);
	const adaptador = ADAPTADORES[type];
	return {
		tipo: type,
		familia: tipo.familia,
		icon: tipo.icon,
		...completar(adaptador ? adaptador(d) : {}, d, tipo.tag),
		risco: riscoDoNo(type, d),
		score: scoreExibido(d),
		regra: regraCritica(type, d),
	};
}
